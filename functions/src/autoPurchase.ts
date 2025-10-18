// functions/src/autoPurchase.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// YYYY-MM-DD America/Bogota
const dateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

type Inv = {
  name: string;
  unit?: string | null;
  stock: number;
  minStock: number;
  targetStock?: number | null;
  costPerUnit?: number | null;
};

export const autoPurchase = onSchedule(
  { schedule: "0 8 * * *", timeZone: "America/Bogota" },
  async () => {
    const dk = dateKey();

    // Puedes iterar todas las orgs si guardas un índice; aquí procesamos una org a la vez por variable.
    const orgId = process.env.ORG_ID || "demo";

    // orgSettings
    const sref = db.doc(`orgSettings/${orgId}`);
    const sdoc = await sref.get();
    const settings = (sdoc.exists ? sdoc.data() : {}) as {
      autoPurchasesEnabled?: boolean;
      autoSupplier?: string | null;
      lastAutoPurchaseDate?: string | null;
    };

    if (!settings.autoPurchasesEnabled) {
      console.log(`[autoPurchase] disabled for org=${orgId}`);
      return;
    }

    // ¿ya existe borrador de hoy?
    const exist = await db
      .collection("purchases")
      .where("orgId", "==", orgId)
      .where("status", "==", "draft")
      .where("dateKey", "==", dk)
      .limit(1)
      .get();

    // calcular sugeridos (faltantes)
    const invSnap = await db
      .collection("inventoryItems")
      .where("orgId", "==", orgId)
      .get();

    const lines: Array<{ ingredientId: string; qty: number; unitCost: number; name: string; unit?: string | null; totalCost: number; }> = [];

    invSnap.forEach((d) => {
      const v = d.data() as Inv;
      const stock = num(v.stock);
      const min = Math.max(0, num(v.minStock));
      const target = v.targetStock == null || num(v.targetStock) <= 0 ? min * 2 : num(v.targetStock);
      const missing = Math.max(0, target - stock);
      const unitCost = Math.max(0, num(v.costPerUnit));
      if (missing > 0) {
        lines.push({
          ingredientId: d.id,
          qty: missing,
          unitCost,
          name: v.name,
          unit: v.unit || null,
          totalCost: missing * unitCost,
        });
      }
    });

    if (lines.length === 0) {
      console.log(`[autoPurchase] no missing items for org=${orgId}`);
      return;
    }

    if (exist.empty) {
      // crear nueva
      const ref = db.collection("purchases").doc();
      const total = lines.reduce((s, x) => s + x.totalCost, 0);
      await ref.set({
        id: ref.id,
        orgId,
        status: "draft",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        supplier: settings.autoSupplier ?? null,
        notes: `Auto-generada por cron ${dk}`,
        items: lines.map(({ name, unit, ...rest }) => ({
          ...rest,
          name,
          unit: unit ?? null,
          totalCost: rest.qty * rest.unitCost,
        })),
        total,
        dateKey: dk,
      });
      await sref.set({ lastAutoPurchaseDate: dk }, { merge: true });
      console.log(`[autoPurchase] created draft=${ref.id} org=${orgId}`);
      return;
    }

    // mergear con existente
    const pref = exist.docs[0].ref;
    const cur = exist.docs[0].data() as any;
    const map = new Map<string, any>();
    for (const it of cur.items || []) map.set(it.ingredientId, { ...it });

    for (const n of lines) {
      const prev = map.get(n.ingredientId);
      if (prev) {
        const qty = num(prev.qty) + num(n.qty);
        const unitCost = n.unitCost ?? prev.unitCost ?? 0;
        map.set(n.ingredientId, {
          ...prev,
          qty,
          unitCost,
          totalCost: qty * unitCost,
        });
      } else {
        map.set(n.ingredientId, {
          ingredientId: n.ingredientId,
          name: n.name,
          unit: n.unit ?? null,
          qty: n.qty,
          unitCost: n.unitCost,
          totalCost: n.qty * n.unitCost,
        });
      }
    }

    const merged = Array.from(map.values());
    const total = merged.reduce((s, it) => s + num(it.totalCost), 0);

    await pref.update({
      items: merged,
      total,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await sref.set({ lastAutoPurchaseDate: dk }, { merge: true });
    console.log(`[autoPurchase] merged into draft=${pref.id} org=${orgId}`);
  }
);

// src/lib/purchases.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  query as fsQuery,
  limit,
  updateDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { getOrgId } from "@/services/firebase";

export type PurchaseStatus = "draft" | "ordered" | "received" | "canceled";

export type PurchaseItem = {
  ingredientId: string;
  name: string;
  unit?: string | null;
  qty: number;
  unitCost: number;   // costo por unidad en la misma unidad que inventoryItems.unit
  totalCost: number;  // qty * unitCost
};

export type PurchaseDoc = {
  id: string;
  orgId: string;
  status: PurchaseStatus;
  createdAt: any;
  orderedAt?: any | null;  // 👈 permitir null
  receivedAt?: any | null;
  updatedAt?: any;
  supplier?: string | null;
  items: PurchaseItem[];
  notes?: string | null;
  total: number;
  /** Clave de fecha local (YYYY-MM-DD America/Bogota) para auto-orden del día */
  dateKey?: string;
};

// YYYY-MM-DD (America/Bogota)
const toDateKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const num = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

type Suggestion = {
  ingredientId: string;
  name: string;
  unit?: string | null;
  stock: number;
  minStock: number;
  targetStock: number; // par efectivo (target || min*2)
  missing: number;
  costPerUnit: number;
  suggestedCost: number;
};

/** Lee inventoryItems y calcula faltantes contra par (target || min*2) */
export async function suggestReplenishment(db: Firestore): Promise<Suggestion[]> {
  const orgId = getOrgId();
  const snap = await getDocs(
    fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId))
  );

  const out: Suggestion[] = [];
  snap.forEach((d) => {
    const v: any = d.data();
    const stock = num(v?.stock);
    const minStock = Math.max(0, num(v?.minStock));
    const rawTarget = v?.targetStock;
    const par =
      rawTarget == null || num(rawTarget) <= 0
        ? Math.max(minStock * 2, 0)
        : Math.max(num(rawTarget), 0);

    const name = String(v?.name ?? d.id);
    const unit = (v?.unit as string) || null;
    const costPerUnit = Math.max(0, num(v?.costPerUnit));

    const missing = Math.max(0, par - stock);
    if (missing > 0) {
      out.push({
        ingredientId: d.id,
        name,
        unit,
        stock,
        minStock,
        targetStock: par,
        missing,
        costPerUnit,
        suggestedCost: missing * costPerUnit,
      });
    }
  });

  out.sort((a, b) => b.suggestedCost - a.suggestedCost);
  return out;
}

/**
 * Crea una orden de compra.
 * - Si se pasa `opts.dateKey`, es **idempotente**: si ya existe una orden para ese día+org, retorna la existente.
 */
export async function createPurchaseOrder(
  db: Firestore,
  items: Array<{ ingredientId: string; qty: number; unitCost?: number }>,
  opts?: {
    supplier?: string | null;
    status?: PurchaseStatus;
    notes?: string | null;
    dateKey?: string;
  }
): Promise<string> {
  const clean = (items || [])
    .map((x) => ({ ...x, qty: Math.max(0, num(x.qty)) }))
    .filter((x) => x.qty > 0);
  if (!clean.length) throw new Error("Sin ítems para comprar.");

  const orgId = getOrgId();
  const dk = opts?.dateKey || toDateKey();

  if (opts?.dateKey) {
    const existQ = fsQuery(
      collection(db, "purchases"),
      where("orgId", "==", orgId),
      where("dateKey", "==", dk),
      limit(1)
    );
    const existSnap = await getDocs(existQ);
    if (!existSnap.empty) {
      return existSnap.docs[0].id;
    }
  }

  const ref = doc(collection(db, "purchases"));

  // Enriquecer items con nombre/unit/costo (paralelo)
  const enriched: PurchaseItem[] = await Promise.all(
    clean.map(async (it) => {
      const iref = doc(db, "inventoryItems", it.ingredientId);
      const isnap = await getDoc(iref);
      if (!isnap.exists()) throw new Error(`Ingrediente no existe: ${it.ingredientId}`);
      const v: any = isnap.data();
      const name = String(v?.name ?? it.ingredientId);
      const unit = (v?.unit as string) || null;
      const unitCost = Math.max(0, num(it.unitCost ?? v?.costPerUnit));
      const qty = Math.max(0, num(it.qty));
      return {
        ingredientId: it.ingredientId,
        name,
        unit,
        qty,
        unitCost,
        totalCost: qty * unitCost,
      };
    })
  );

  const total = enriched.reduce((s, i) => s + i.totalCost, 0);
  const status: PurchaseStatus = opts?.status ?? "draft";

  // ⚠️ NUNCA mandar undefined a Firestore
  const orderedAt = status === "ordered" ? serverTimestamp() : null;

  const docBody: PurchaseDoc = {
    id: ref.id,
    orgId,
    status,
    createdAt: serverTimestamp(),
    orderedAt, // null o Timestamp, nunca undefined
    updatedAt: serverTimestamp(),
    supplier: opts?.supplier ?? null,
    notes: opts?.notes ?? null,
    items: enriched,
    total,
    dateKey: dk,
  };

  await setDoc(ref, docBody as any);
  return ref.id;
}

/**
 * **Nuevo**: Crea o MERGEA el borrador de hoy (status:"draft") con `dateKey` = hoy.
 * - Enriquece líneas con name/unit/cost.
 * - Suma cantidades si el ingrediente ya está en la orden.
 * - Recalcula `total` y `totalCost` por línea.
 * Devuelve el `purchaseId` del borrador resultante.
 */
export async function upsertDraftForToday(
  db: Firestore,
  lines: Array<{ ingredientId: string; qty: number; unitCost?: number }>,
  opts?: { supplier?: string | null; notes?: string | null }
): Promise<string | null> {
  const orgId = getOrgId();
  const dk = toDateKey();

  const clean = (lines || [])
    .map((x) => ({ ...x, qty: Math.max(0, num(x.qty)) }))
    .filter((x) => x.qty > 0);
  if (!clean.length) return null;

  // ¿existe borrador de hoy?
  const qy = fsQuery(
    collection(db, "purchases"),
    where("orgId", "==", orgId),
    where("status", "==", "draft"),
    where("dateKey", "==", dk),
    limit(1)
  );
  const snap = await getDocs(qy);

  // Enriquecer líneas con datos del inventario
  const enriched: PurchaseItem[] = await Promise.all(
    clean.map(async (it) => {
      const iref = doc(db, "inventoryItems", it.ingredientId);
      const isnap = await getDoc(iref);
      if (!isnap.exists()) throw new Error(`Ingrediente no existe: ${it.ingredientId}`);
      const v: any = isnap.data();
      const name = String(v?.name ?? it.ingredientId);
      const unit = (v?.unit as string) || null;
      const unitCost = Math.max(0, num(it.unitCost ?? v?.costPerUnit));
      const qty = Math.max(0, num(it.qty));
      return { ingredientId: it.ingredientId, name, unit, qty, unitCost, totalCost: qty * unitCost };
    })
  );

  if (snap.empty) {
    // Crear nuevo borrador
    const ref = doc(collection(db, "purchases"));
    const total = enriched.reduce((s, i) => s + i.totalCost, 0);
    const body: PurchaseDoc = {
      id: ref.id,
      orgId,
      status: "draft",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      supplier: opts?.supplier ?? null,
      notes: opts?.notes ?? null,
      items: enriched,
      total,
      dateKey: dk,
    };
    await setDoc(ref, body as any);
    return ref.id;
  }

  // Merge sobre el existente
  const pref = doc(db, "purchases", snap.docs[0].id);
  const cur = snap.docs[0].data() as PurchaseDoc;

  // índice por ingredientId
  const map = new Map<string, PurchaseItem>();
  for (const it of cur.items || []) map.set(it.ingredientId, { ...it });

  for (const n of enriched) {
    const prev = map.get(n.ingredientId);
    if (prev) {
      const qty = num(prev.qty) + num(n.qty);
      const unitCost = n.unitCost ?? prev.unitCost ?? 0;
      map.set(n.ingredientId, {
        ingredientId: n.ingredientId,
        name: n.name || prev.name,
        unit: n.unit || prev.unit,
        qty,
        unitCost,
        totalCost: qty * unitCost,
      });
    } else {
      map.set(n.ingredientId, { ...n });
    }
  }

  const merged = Array.from(map.values());
  const total = merged.reduce((s, i) => s + num(i.totalCost), 0);

  await updateDoc(pref, {
    items: merged,
    total,
    updatedAt: serverTimestamp(),
    supplier: cur.supplier ?? opts?.supplier ?? null,
    dateKey: dk,
  });

  return pref.id;
}

/** Pasar una compra a "ordered" (con guardas) */
export async function markPurchaseOrdered(db: Firestore, purchaseId: string): Promise<void> {
  const pref = doc(db, "purchases", purchaseId);
  await runTransaction(db, async (tx) => {
    const psnap = await tx.get(pref);
    if (!psnap.exists()) throw new Error("Compra no existe");
    const p = psnap.data() as PurchaseDoc;
    if (p.orgId !== getOrgId()) throw new Error("Sin permisos para esta organización.");
    if (p.status === "received") throw new Error("La compra ya fue recibida.");
    if (p.status === "ordered") {
      tx.update(pref, { updatedAt: serverTimestamp() }); // idempotente
      return;
    }
    tx.update(pref, { status: "ordered", orderedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

/** Cancelar compra (solo si NO está recibida) */
export async function cancelPurchase(db: Firestore, purchaseId: string): Promise<void> {
  const pref = doc(db, "purchases", purchaseId);
  await runTransaction(db, async (tx) => {
    const psnap = await tx.get(pref);
    if (!psnap.exists()) throw new Error("Compra no existe");
    const p = psnap.data() as PurchaseDoc;
    if (p.orgId !== getOrgId()) throw new Error("Sin permisos para esta organización.");
    if (p.status === "received") throw new Error("No se puede cancelar: ya recibida.");
    if (p.status === "canceled") return;
    tx.update(pref, { status: "canceled", updatedAt: serverTimestamp() });
  });
}

/**
 * Recibir compra (kardex compatible con rules):
 * - Sube stock de cada ingrediente.
 * - Inserta stockMovements con type:'revert', reason:null, qty positiva, meta 'purchase'.
 * - Guarda items efectivos recibidos.
 * - (Opcional) registra salida de caja (cashMovements.out).
 * - Idempotente si ya estaba 'received'.
 */
export async function receivePurchase(
  db: Firestore,
  purchaseId: string,
  receivedItems?: Array<{ ingredientId: string; qty: number; unitCost?: number }>,
  opts?: { payFromCash?: number; userId?: string | null }
): Promise<void> {
  const orgId = getOrgId();
  const pref = doc(db, "purchases", purchaseId);

  await runTransaction(db, async (tx) => {
    const psnap = await tx.get(pref);
    if (!psnap.exists()) throw new Error("Compra no existe");
    const p = psnap.data() as any;
    if (p.orgId !== orgId) throw new Error("Sin permisos para esta organización.");
    if (p.status === "received") return; // idempotente

    // Items a aplicar: si viene override, se re-enriquecen; si no, se usan los del doc
    const items: PurchaseItem[] =
      receivedItems && receivedItems.length
        ? await Promise.all(
            receivedItems
              .map((ri) => ({ ...ri, qty: Math.max(0, num(ri.qty)) }))
              .filter((ri) => ri.qty > 0)
              .map(async (ri) => {
                const iref = doc(db, "inventoryItems", ri.ingredientId);
                const isnap = await tx.get(iref);
                if (!isnap.exists()) throw new Error(`Ingrediente no existe: ${ri.ingredientId}`);
                const v: any = isnap.data();
                const name = String(v?.name ?? ri.ingredientId);
                const unit = (v?.unit as string) || null;
                const unitCost = Math.max(0, num(ri.unitCost ?? v?.costPerUnit));
                const qty = Math.max(0, num(ri.qty));
                return { ingredientId: ri.ingredientId, name, unit, qty, unitCost, totalCost: qty * unitCost };
              })
          )
        : (p.items || []);

    if (!items.length) throw new Error("No hay ítems para recibir.");

    let total = 0;

    for (const it of items) {
      const invRef = doc(db, "inventoryItems", it.ingredientId);
      const invSnap = await tx.get(invRef);
      const cur = invSnap.exists() ? num((invSnap.data() as any)?.stock) : 0;
      const inc = Math.max(0, num(it.qty));
      const next = cur + inc;

      tx.set(
        invRef,
        {
          orgId,
          stock: next,
          updatedAt: serverTimestamp(),
          costPerUnit: Math.max(0, num(it.unitCost)),
        },
        { merge: true }
      );

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(movRef, {
        id: movRef.id,
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "revert",          // entrada compatible con rules
        ingredientId: it.ingredientId,
        qty: inc,                // positiva
        reason: null,            // rules-friendly
        metaReason: "purchase",  // informativo
        purchaseId,
        itemName: it.name,
        unit: it.unit ?? null,
      });

      total += inc * Math.max(0, num(it.unitCost));
    }

    // (Opcional) salida de caja si se pagó en efectivo
    if (opts?.payFromCash && opts.payFromCash > 0) {
      const cashRef = doc(collection(db, "cashMovements"));
      tx.set(cashRef, {
        id: cashRef.id,
        orgId,
        type: "out",
        amount: Math.max(0, num(opts.payFromCash)),
        at: serverTimestamp(),
        dateKey: toDateKey(),
        reason: "purchase",
        purchaseId,
        userId: opts.userId ?? null,
      });
    }

    // Estado final + líneas efectivas y updatedAt
    tx.update(pref, {
      status: "received",
      receivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      items,        // asegura persistir lo realmente recibido
      total,
    });
  });
}

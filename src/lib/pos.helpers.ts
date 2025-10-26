// src/lib/pos.helpers.ts
import type { Firestore } from "firebase/firestore";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { gaLog, getOrgId, toDateKey } from "@/services/firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

/** ===== Config colecciones (multi-tenant toggle) =====
 *  Si usas subcolecciones por organización, pon USE_ORG_SUBCOLS=true.
 *  Así quedará en orgs/{orgId}/{colName}
 */
const USE_ORG_SUBCOLS = false;
const col = (db: Firestore, orgId: string, name: string) =>
  USE_ORG_SUBCOLS ? collection(db as any, "orgs", orgId, name) : collection(db as any, name);
const docIn = (db: Firestore, orgId: string, name: string, id?: string) =>
  id
    ? (USE_ORG_SUBCOLS ? doc(db as any, "orgs", orgId, name, id) : doc(db as any, name, id))
    : doc(col(db, orgId, name));

/** ===== Tipos ===== */
export type PayMethod = "cash" | "qr" | "card" | "other";

export type CartItem = {
  id: string;
  name: string;
  sizeId?: string;
  sizeName?: string;
  price: number;
  qty: number;
  recipe?: Record<string, number>; // ingredienteId -> cantidad (unidad base)
  isBeverage?: boolean;
  category?: string;
};

type InventoryRow = {
  id: string;
  have: number;
  req: number;
  name: string;
  unit?: string;
  cpu: number; // costo por unidad
};

/** ===== Config impuestos / redondeo ===== */
const IVA_RATE = 0; // 0.19 si manejas IVA incluido
const ROUND_TO = 50; // múltiplo $50 (0 = sin redondeo)

/** ---------- Utils ---------- */
function aggregateNeed(items: CartItem[]): Record<string, number> {
  const need: Record<string, number> = {};
  for (const it of items) {
    const r = it.recipe || {};
    const units = Number(it.qty) || 0;
    for (const [ing, perUnit] of Object.entries(r)) {
      const total = (Number(perUnit) || 0) * units;
      if (total > 0) need[ing] = (need[ing] || 0) + total;
    }
  }
  return need;
}

function computeNeedFromItemsList(items: any[] | undefined): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items || []) {
    const r = it?.recipe || {};
    const qty = Number(it?.qty || 0);
    for (const [ing, grams] of Object.entries(r)) {
      const total = (Number(grams) || 0) * qty;
      if (total > 0) acc[ing] = (acc[ing] || 0) + total;
    }
  }
  return acc;
}

function toAnalyticsItems(items: CartItem[]) {
  return items
    .filter((i) => (Number(i.price) || 0) >= 0)
    .map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.qty) || 0,
    }));
}

/** ===== Totales con descuento/IVA/redondeo ===== */
const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : n);

export function calcTotals(items: CartItem[], opts?: { ivaRate?: number; roundTo?: number }) {
  const ivaRate = opts?.ivaRate ?? IVA_RATE;
  const step = opts?.roundTo ?? ROUND_TO;

  const positives = items.filter((i) => (Number(i.price) || 0) >= 0);
  const negatives = items.filter((i) => (Number(i.price) || 0) < 0);

  const subtotal = positives.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.qty || 0),
    0
  );
  const discount = Math.abs(
    negatives.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0)
  );

  // precios con IVA incluido
  const net = Math.max(0, subtotal - discount);
  const tax = ivaRate > 0 ? net - net / (1 + ivaRate) : 0;
  const total = net;
  const totalRounded = roundTo(total, step);
  const roundDelta = totalRounded - total;

  return { subtotal, discount, tax, roundDelta, total, totalRounded };
}

/** ---------- limpiar objetos (preservando Timestamp y sentinels) ---------- */
function isPlainObject(v: any) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function cleanDeep<T = any>(v: T): T {
  if (v === undefined) return undefined as any;
  if (v === null) return v;
  const t = typeof v;

  if (t === "number") return (Number.isFinite(v as any) ? v : 0) as any;
  if (t === "string" || t === "boolean") return v;

  if (Array.isArray(v)) {
    const out = (v as any[]).map(cleanDeep).filter((x) => x !== undefined);
    return out as any;
  }

  if (t === "object") {
    if (v instanceof Timestamp) return v as any;
    // serverTimestamp() y otros FieldValue no son plain objects: se devuelven tal cual
    if (!isPlainObject(v)) return v as any;
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      const c = cleanDeep(val);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v as any;
}

/** -------------------------
 * Confirmar venta (descuenta stock, crea orden pending)
 * ------------------------- */
export async function checkoutStrict(
  db: Firestore,
  items: CartItem[],
  payMethod: PayMethod = "cash",
  staffUid?: string | null,
  customerUid?: string | null
): Promise<string> {
  if (!items.length) throw new Error("El carrito está vacío");

  const ORG_ID = getOrgId();
  const need = aggregateNeed(items);
  const invIds = Object.keys(need);
  const orderRef = docIn(db, ORG_ID, "orders");

  await runTransaction(db, async (tx) => {
    /** ----- LECTURAS inventario ----- */
    const rows: InventoryRow[] = [];
    for (const id of invIds) {
      const ref = docIn(db, ORG_ID, "inventoryItems", id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error(`Ingrediente no existe: ${id}`);

      const data: any = snap.data();
      const have = Number(data?.stock || 0);
      const req = Number(need[id] || 0);
      const name = String(data?.name ?? id);
      const unit = String(data?.unit || "");
      const cpu = Number(data?.costPerUnit || 0);

      if (have < req)
        throw new Error(`Stock insuficiente de ${name}. Falta ${req - have} ${unit || ""}.`);
      rows.push({ id, have, req, name, unit, cpu });
    }

    const totalCogs = rows.reduce<number>((acc, r) => acc + r.req * r.cpu, 0);

    /** ----- ESCRITURAS inventario + kardex ----- */
    for (const { id, have, req } of rows) {
      const ref = docIn(db, ORG_ID, "inventoryItems", id);
      tx.update(ref, { stock: have - req, updatedAt: serverTimestamp() });

      const movRef = docIn(db, ORG_ID, "stockMovements");
      tx.set(
        movRef,
        cleanDeep({
          id: movRef.id,
          orgId: ORG_ID,
          dateKey: toDateKey(),
          at: serverTimestamp(),
          type: "out", // consumo por venta
          ingredientId: id,
          qty: req,
          reason: "sale",
          orderId: orderRef.id,
        })
      );
    }

    /** ----- Orden ----- */
    const safeItems = items.map((i) => {
      const price = Number.isFinite(Number(i.price)) ? Number(i.price) : 0;
      const qty = Number(i.qty) || 0;
      const base: any = {
        productId: String(i.id ?? ""),
        name: String(i.name ?? ""),
        price,
        qty,
        total: price * qty,
        recipe: i.recipe || {},
      };
      if (i.sizeId) base.sizeId = String(i.sizeId);
      if (i.sizeName) base.sizeName = String(i.sizeName);
      if (typeof i.isBeverage === "boolean") base.isBeverage = i.isBeverage;
      if (i.category) base.category = String(i.category);
      return base;
    });

    const createdAt = serverTimestamp();
    const totals = calcTotals(safeItems);

    tx.set(
      orderRef,
      cleanDeep({
        id: orderRef.id,
        orgId: ORG_ID,
        dateKey: toDateKey(),
        at: createdAt,
        createdAt,
        items: safeItems,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        roundDelta: totals.roundDelta,
        total: totals.totalRounded,
        cogs: Number(totalCogs || 0),
        payMethod: payMethod || "cash",
        status: "pending",
        staffId: staffUid ?? null,
        customerUid: customerUid ?? null,
        consumption: need, // para revertir exacto si se cancela
      })
    );
  });

  // Analytics (no bloquea la UX)
  try {
    const totals = calcTotals(items);
    await gaLog("begin_checkout", {
      value: totals.totalRounded,
      currency: "COP",
      items: toAnalyticsItems(items),
    });
  } catch {}

  return orderRef.id;
}

/** -------------------------
 * Entregar (marca delivered + acredita sellos)
 * ------------------------- */
export async function deliverOrder(db: Firestore, orderId: string) {
  const ORG_ID = getOrgId();
  const ref = docIn(db, ORG_ID, "orders", orderId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe");
    const o: any = snap.data();

    if (o.status === "canceled") throw new Error("No se puede entregar una orden anulada");
    if (o.status !== "delivered") {
      tx.update(ref, cleanDeep({ status: "delivered", deliveredAt: serverTimestamp() }));
    }

    return {
      total: Number(o.total || 0),
      items: Array.isArray(o.items) ? o.items : [],
      id: ref.id,
    };
  });

  // Analytics purchase
  try {
    await gaLog("purchase", {
      transaction_id: orderId,
      value: result?.total ?? 0,
      currency: "COP",
      items: toAnalyticsItems(
        (result?.items || []).map((i: any) => ({
          id: String(i.productId || i.id || ""),
          name: String(i.name || ""),
          price: Number(i.price || 0),
          qty: Number(i.qty || 0),
        })) as any
      ),
    });
  } catch {}

  // Fidelización (sellos/puntos)
  try {
    await awardStampsOnDeliveredOrder(db, orderId);
  } catch {}

  return;
}

export async function markDelivered(db: Firestore, orderId: string) {
  return deliverOrder(db, orderId);
}

/** -------------------------
 * Anular (revierte stock y marca canceled)
 * ------------------------- */
export async function cancelOrder(db: Firestore, orderId: string) {
  const ORG_ID = getOrgId();
  const orderRef = docIn(db, ORG_ID, "orders", orderId);

  const result = await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Orden no existe");
    const order: any = orderSnap.data();

    if (order.status === "canceled") {
      return { total: Number(order.total || 0), items: Array.isArray(order.items) ? order.items : [] };
    }
    if (order.status === "delivered") {
      throw new Error("No se puede anular una orden ya entregada");
    }

    const need: Record<string, number> =
      order.consumption && typeof order.consumption === "object"
        ? order.consumption
        : computeNeedFromItemsList(order.items);

    const invIds = Object.keys(need);

    // leer inventario de TODOS primero
    const invSnaps: Record<string, { have: number } | null> = {};
    for (const id of invIds) {
      const invRef = docIn(db, ORG_ID, "inventoryItems", id);
      const snap = await tx.get(invRef);
      invSnaps[id] = snap.exists() ? { have: Number(snap.data()?.stock || 0) } : null;
    }

    // ESCRITURAS: devolver stock + kardex revert
    for (const id of invIds) {
      const giveBack = Number(need[id] || 0);
      const invRef = docIn(db, ORG_ID, "inventoryItems", id);
      const have = invSnaps[id]?.have ?? 0;

      if (invSnaps[id]) {
        tx.update(invRef, { stock: have + giveBack, updatedAt: serverTimestamp() });
      }

      const movRef = docIn(db, ORG_ID, "stockMovements");
      tx.set(
        movRef,
        cleanDeep({
          id: movRef.id,
          orgId: ORG_ID,
          dateKey: toDateKey(),
          at: serverTimestamp(),
          type: "in", // entrada por cancelación
          ingredientId: id,
          qty: giveBack,
          reason: "cancel",
          orderId,
        })
      );
    }

    tx.update(orderRef, cleanDeep({ status: "canceled", canceledAt: serverTimestamp() }));
    return { total: Number(order.total || 0), items: Array.isArray(order.items) ? order.items : [] };
  });

  // Analytics
  try {
    await gaLog("refund", {
      transaction_id: orderId,
      value: result?.total ?? 0,
      currency: "COP",
      items: toAnalyticsItems(
        (result?.items || []).map((i: any) => ({
          id: String(i.productId || i.id || ""),
          name: String(i.name || ""),
          price: Number(i.price || 0),
          qty: Number(i.qty || 0),
        })) as any
      ),
    });
  } catch {}
}

/** -------------------------
 * Eliminar (si no estaba cancelada, también revierte stock)
 * ------------------------- */
export async function deleteOrder(db: Firestore, orderId: string) {
  const ORG_ID = getOrgId();
  const orderRef = docIn(db, ORG_ID, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;

    const order: any = snap.data();

    let need: Record<string, number> = {};
    let invIds: string[] = [];
    let invSnaps: Record<string, { have: number } | null> = {};

    if (order.status !== "canceled") {
      need =
        order.consumption && typeof order.consumption === "object"
          ? order.consumption
          : computeNeedFromItemsList(order.items);

      invIds = Object.keys(need);

      invSnaps = {};
      for (const id of invIds) {
        const invRef = docIn(db, ORG_ID, "inventoryItems", id);
        const invSnap = await tx.get(invRef);
        invSnaps[id] = invSnap.exists() ? { have: Number(invSnap.data()?.stock || 0) } : null;
      }

      // devolver stock + kardex (delete)
      for (const id of invIds) {
        const give = Number(need[id] || 0);
        const invRef = docIn(db, ORG_ID, "inventoryItems", id);
        const have = invSnaps[id]?.have ?? 0;

        if (invSnaps[id]) {
          tx.update(invRef, { stock: have + give, updatedAt: serverTimestamp() });
        }

        const movRef = docIn(db, ORG_ID, "stockMovements");
        tx.set(
          movRef,
          cleanDeep({
            id: movRef.id,
            orgId: ORG_ID,
            dateKey: toDateKey(),
            at: serverTimestamp(),
            type: "in", // entrada por borrado
            ingredientId: id,
            qty: give,
            reason: "delete",
            orderId,
          })
        );
      }
    }

    tx.delete(orderRef);
  });
}

/* =========================================================
 * FRAPPE HELPERS (exportados para Canvas / Studio / etc.)
 * ========================================================= */

// Unidades usadas en recetas / visualización
export type Unit = "g" | "ml" | "u";

// Item para visualización de vaso/capas
export type VizItem = { name: string; unit: Unit | string; amount: number };

// Normalización de texto tolerante a encoding chueco
export function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch: string) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

// normaliza + quita tildes (con fallback si \p{Diacritic} no está disponible)
export const normalize = (s: string) => {
  const base = fixText(s).toLowerCase().normalize("NFD");
  try {
    // @ts-ignore - algunos runtimes no soportan \p{Diacritic}
    return base.replace(/\p{Diacritic}/gu, "");
  } catch {
    return base.replace(/[\u0300-\u036f]/g, "");
  }
};

type Role = "liquid" | "sparkling" | "ice" | "syrup" | "topping" | "whipped" | "base" | "ignore";

// Clasifica ingrediente (rol + color)
export function classify(name: string): { role: Role; color: string } {
  const n = normalize(name);
  if (/(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[ée]rmica|pitillos|vaso(?!.*(cart[oó]n|pl[aá]stico|8 oz|12 oz)))/.test(n)) return { role: "ignore", color: "#fff" };
  if (/(detergente|desinfectante|jab[oó]n)/.test(n)) return { role: "ignore", color: "#fff" };
  if (/(hielo|ice)/.test(n)) return { role: "ice", color: "#e7f5ff" };
  if (/(t[oó]nica|tonica|soda|sparkling)/.test(n)) return { role: "sparkling", color: "#cfe9ff" };
  if (/(espresso|caf[eé]|cold ?brew|concentrado cold brew)/.test(n)) return { role: "liquid", color: "#4a2c21" };
  if (/(leche|avena)/.test(n)) return { role: "liquid", color: "#f3e6d4" };
  if (/(milo|cacao|chocolate(?!.*blanco)|negro|oscuro)/.test(n)) return { role: "liquid", color: "#6b3e2e" };
  if (/(chocolate.*blanco|blanco)/.test(n)) return { role: "liquid", color: "#fff3e0" };
  if (/(fresa|strawberry|naranja|arándano|arandano)/.test(n)) return { role: "liquid", color: "#ffb3c1" };
  if (/(vainilla)/.test(n)) return { role: "liquid", color: "#f7e7b6" };
  if (/(caramelo|syrup|sirope|jarabe|arequipe|dulce de leche|az[uú]car)/.test(n)) return { role: "syrup", color: "#cc8a2e" };
  if (/(oreo|galleta|cookies?)/.test(n)) return { role: "topping", color: "#2f2f2f" };
  if (/(crema batida|chantilly|whipped)/.test(n)) return { role: "whipped", color: "#ffffff" };
  if (/(base frapp[eé]|base frappe|base)/.test(n)) return { role: "base", color: "#dfe7ff" };
  if (/(agua)/.test(n)) return { role: "liquid", color: "#cfe9ff" };
  return { role: "liquid", color: "#d9c7a2" };
}

// Calcula capas y extras para el vaso
export function asLayers(items: VizItem[]) {
  const enriched = items
    .map((it) => ({ ...it, ...classify(it.name) }))
    .filter((it) => it.role !== "ignore");

  const liquids = enriched.filter(
    (it) => (it.unit === "ml" || it.unit === "g") && (it.role === "liquid" || it.role === "sparkling")
  );

  const total = liquids.reduce((a, b) => a + Math.max(0, b.amount || 0), 0) || 1;
  const layers = liquids.map((it) => ({
    height: Math.max(0, it.amount || 0) / total,
    color: classify(it.name).color,
    label: it.name,
    sparkling: classify(it.name).role === "sparkling",
  }));

  const ice = enriched.filter((it) => it.role === "ice");
  const syrups = enriched.filter((it) => it.role === "syrup");
  const toppings = enriched.filter((it) => it.role === "topping");
  const whipped = enriched.filter((it) => it.role === "whipped");
  const base = enriched.filter((it) => it.role === "base");
  const sparklingStrength = liquids
    .filter((l) => classify(l.name).role === "sparkling")
    .reduce((a, b) => a + (b.amount || 0), 0);

  return {
    layers,
    iceCount: ice.length ? Math.max(2, Math.round((ice[0].amount || 0) / 50)) : 0,
    syrups,
    toppings,
    whipped,
    basePresent: base.length > 0,
    sparklingStrength,
  };
}

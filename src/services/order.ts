import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  Firestore,
  runTransaction
} from "firebase/firestore";
import type { OrderItem } from "./types.ar.rb";
const IVA_RATE = 0;
const ROUND_TO = 50;
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

import { applyStockForOrder } from "./bodega";
import { db as defaultDb, getOrgId, gaLog } from "./firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

/* --------------------------------
   Helpers básicos
----------------------------------*/
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toDateKey = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Helper interno para limpiar objetos deep
function cleanDeep<T = any>(v: T): T {
  if (v === undefined) return undefined as any;
  if (v === null) return v;
  if (typeof v === "object") {
    if ((v as any).toDate) return v; // Timestamp
    if (Array.isArray(v)) return v.map(cleanDeep) as any;
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      if (val !== undefined) out[k] = cleanDeep(val);
    }
    return out;
  }
  return v;
}

type CleanComponent = { itemId: string; qty: number; unit: string };
type CleanItem = {
  custom?: boolean;
  sizeId?: string;
  price: number;
  components: CleanComponent[];
  meta?: Record<string, any>;
};

function cleanItem(raw: any): CleanItem {
  const components: CleanComponent[] = (Array.isArray(raw?.components) ? raw.components : [])
    .map((c: any) => ({
      itemId: String(c?.itemId ?? c?.inventoryItemId ?? ""),
      qty: Math.max(0, num(c?.qty)),
      unit: String(c?.unit ?? "pc"),
    }))
    .filter((c: CleanComponent) => c.itemId && c.qty > 0);

  const metaIn = raw?.meta ?? {};
  const meta: Record<string, any> = {};
  for (const k of ["basePublic", "baseCost", "topsServings", "topsChargeable", "topsUnit", "topsPublic"]) {
    const v = (metaIn as any)[k];
    if (v !== undefined && v !== null) meta[k] = num(v, v);
  }

  const out: CleanItem = {
    custom: !!raw?.custom,
    sizeId: raw?.sizeId ? String(raw.sizeId) : undefined,
    price: Math.max(0, num(raw?.price)),
    components,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
  return out;
}

/* --------------------------------
   Tipos
----------------------------------*/
export type WorkQueueDoc = {
  orgId: string;
  orderId: string;
  status: "queued" | "working" | "done" | "canceled";
  route: string;
  kind: string;
  sizeId?: string;
  total?: number;
  source?: "client-app" | "kiosk";
  createdAt: any;
  createdBy?: string;
};

export type PayMethod = "cash" | "qr" | "card" | "other";

export type CartItem = {
  id: string;
  name: string;
  sizeId?: string;
  sizeName?: string;
  price: number;
  qty: number;
  recipe?: Record<string, number>;
  isBeverage?: boolean;
  category?: string;
};

/* --------------------------------
   API 1: Crear orden (Builder / App cliente)
   - Crea orden con lógica de componentes.
----------------------------------*/
export async function createOrderFromBuilder(params: {
  orgId: string;
  userId: string;
  source: "client-app" | "kiosk";
  items: OrderItem[];
  db?: Firestore;
}) {
  const db = params.db ?? defaultDb;
  const orderRef = doc(collection(db, "orders"));
  const orderId = orderRef.id;

  const safeItems = (Array.isArray(params.items) ? params.items : []).map(cleanItem);
  if (!safeItems.length) throw new Error("La orden no tiene ítems válidos.");

  const total = safeItems.reduce((s, it) => s + num(it.price), 0);

  const orderPayload = {
    id: orderId,
    orgId: String(params.orgId),
    userId: String(params.userId),
    source: params.source,
    status: "pending" as const,
    items: safeItems,
    total,
    createdAt: serverTimestamp(),
    dateKey: toDateKey(),
  };

  const batch = writeBatch(db);
  batch.set(orderRef, orderPayload);
  await batch.commit();

  // descuenta stock por TODOS los componentes
  const allComponents: CleanComponent[] = safeItems.flatMap((i) => i.components);
  if (allComponents.length) {
    await applyStockForOrder(params.orgId, orderId, allComponents as any);
  }

  return orderId;
}

/* --------------------------------
   API 2: Checkout estricto (POS)
   - Verifica stock antes de crear.
   - Transaccional.
----------------------------------*/
export async function createOrderStrict(
  dbIn: Firestore,
  items: CartItem[],
  payMethod: "cash" | "qr" | "card" | "other" = "cash",
  staffUid?: string | null,
  customerUid?: string | null
): Promise<string> {
  const db = dbIn || defaultDb;
  if (!items.length) throw new Error("El carrito está vacío");

  const orgId = getOrgId();

  // Calcular consumo agregado
  const need: Record<string, number> = {};
  for (const it of items) {
    const r = it.recipe || {};
    const units = Number(it.qty) || 0;
    for (const [ing, perUnit] of Object.entries(r)) {
      const total = (Number(perUnit) || 0) * units;
      if (total > 0) need[ing] = (need[ing] || 0) + total;
    }
  }

  const invIds = Object.keys(need);
  const orderRef = doc(db, "orders"); // ID auto-generado

  await runTransaction(db, async (tx) => {
    // 1. Lectura de inventario
    const rows: any[] = [];
    let totalCogs = 0;

    for (const id of invIds) {
      const ref = doc(db, "inventoryItems", id);
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

      rows.push({ id, have, req, ref });
      totalCogs += req * cpu;
    }

    // 2. Escrituras (Stock + Movimientos)
    for (const { id, have, req, ref } of rows) {
      tx.update(ref, { stock: have - req, updatedAt: serverTimestamp() });

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(movRef, {
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "out",
        ingredientId: id,
        qty: req,
        reason: "sale",
        orderId: orderRef.id,
      });
    }

    // 3. Crear Orden
    const safeItems = items.map((i) => {
      const price = Number.isFinite(Number(i.price)) ? Number(i.price) : 0;
      const qty = Number(i.qty) || 0;
      return cleanDeep({
        productId: String(i.id ?? ""),
        name: String(i.name ?? ""),
        price,
        qty,
        total: price * qty,
        recipe: i.recipe || {},
        sizeId: i.sizeId ? String(i.sizeId) : undefined,
        sizeName: i.sizeName ? String(i.sizeName) : undefined,
        isBeverage: typeof i.isBeverage === "boolean" ? i.isBeverage : undefined,
        category: i.category ? String(i.category) : undefined
      });
    });

    const createdAt = serverTimestamp();
    const subtotal = safeItems.reduce((s, x) => s + (x.price * x.qty), 0);

    tx.set(orderRef, cleanDeep({
      id: orderRef.id,
      orgId,
      dateKey: toDateKey(),
      at: createdAt,
      createdAt,
      items: safeItems,
      total: subtotal,
      cogs: Number(totalCogs || 0),
      payMethod: payMethod || "cash",
      status: "pending",
      staffId: staffUid ?? null,
      customerUid: customerUid ?? null,
      consumption: need
    }));
  });

  return orderRef.id;
}

/* --------------------------------
   API 3: Suscripciones
----------------------------------*/
export function subscribeToOrders(
  orgId: string,
  range: { from: any; to: any },
  callback: (orders: any[], error?: string) => void
) {
  const qy = query(
    collection(defaultDb, "orders"),
    where("orgId", "==", orgId),
    where("createdAt", ">=", range.from),
    where("createdAt", "<", range.to),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(qy,
    (snap) => {
      const xs: any[] = [];
      snap.forEach((d) => {
        const v = d.data();
        xs.push({ ...v, id: d.id });
      });
      callback(xs);
    },
    (e: any) => {
      let msg = e?.message || String(e);
      if (e?.code === "failed-precondition") {
        msg = "Falta índice de Firestore para orders: [orgId ASC, createdAt DESC].";
      }
      callback([], msg);
    }
  );
}

export function subscribeToPendingOrdersCount(orgId: string, callback: (count: number) => void) {
  const qy = query(
    collection(defaultDb, "orders"),
    where("orgId", "==", orgId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(qy, (snap) => callback(snap.size));
}

/* --------------------------------
   API 4: Acciones (Entregar, Anular, Borrar)
----------------------------------*/
function toAnalyticsItems(items: any[]) {
  return items.map((i) => ({
    item_id: i.productId || i.id,
    item_name: i.name,
    price: Number(i.price) || 0,
    quantity: Number(i.qty) || 0,
  }));
}

export async function markDelivered(dbIn: Firestore, orderId: string) {
  const db = dbIn || defaultDb;
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe");
    const o: any = snap.data();

    if (o.status === "canceled") throw new Error("No se puede entregar una anulada");
    if (o.status !== "delivered") {
      tx.update(ref, { status: "delivered", deliveredAt: serverTimestamp() });
    }
  });

  getDoc(ref).then(async (s) => {
    const o: any = s.data();
    try {
      await gaLog("purchase", {
        transaction_id: orderId,
        value: Number(o?.total || 0),
        currency: "COP",
        items: toAnalyticsItems(o?.items || [])
      });
      awardStampsOnDeliveredOrder(db, orderId).catch(() => { });
    } catch { }
  });
}

export async function finalizeOrder(
  dbIn: Firestore,
  orderId: string,
  payMethod?: PayMethod
) {
  const db = dbIn || defaultDb;
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe");
    const o: any = snap.data();

    if (o.status === "canceled") throw new Error("No se puede finalizar una orden anulada");

    const updates: any = {
      status: "delivered",
      deliveredAt: serverTimestamp()
    };
    if (payMethod) updates.payMethod = payMethod;

    tx.update(ref, updates);
  });

  // Analytics & Stamps (same as markDelivered)
  getDoc(ref).then(async (s) => {
    const o: any = s.data();
    try {
      await gaLog("purchase", {
        transaction_id: orderId,
        value: Number(o?.total || 0),
        currency: "COP",
        items: toAnalyticsItems(o?.items || [])
      });
      awardStampsOnDeliveredOrder(db, orderId).catch(() => { });
    } catch { }
  });
}

export async function cancelOrder(dbIn: Firestore, orderId: string) {
  const db = dbIn || defaultDb;
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe");
    const o: any = snap.data();

    if (o.status === "canceled") return;
    if (o.status === "delivered") throw new Error("Ya entregada, no se puede anular");

    // Devolver stock
    let need: Record<string, number> = o.consumption || {};
    if (!Object.keys(need).length && Array.isArray(o.items)) {
      for (const it of o.items) {
        const r = it.recipe || {};
        const q = Number(it.qty || 0);
        for (const [ing, amount] of Object.entries(r)) {
          need[ing] = (need[ing] || 0) + Number(amount) * q;
        }
      }
    }

    const orgId = o.orgId;
    const invIds = Object.keys(need);
    for (const id of invIds) {
      const invRef = doc(db, "inventoryItems", id);
      const invSnap = await tx.get(invRef);
      if (invSnap.exists()) {
        const current = Number(invSnap.data()?.stock || 0);
        tx.update(invRef, {
          stock: current + Number(need[id]),
          updatedAt: serverTimestamp()
        });
      }

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(movRef, {
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "in",
        ingredientId: id,
        qty: Number(need[id]),
        reason: "cancel",
        orderId
      });
    }

    tx.update(ref, { status: "canceled", canceledAt: serverTimestamp() });
  });
}

export async function deleteOrder(dbIn: Firestore, orderId: string) {
  const db = dbIn || defaultDb;
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const o: any = snap.data();

    if (o.status !== "canceled") {
      let need: Record<string, number> = o.consumption || {};
      if (!Object.keys(need).length && Array.isArray(o.items)) {
        for (const it of o.items) {
          const r = it.recipe || {};
          const q = Number(it.qty || 0);
          for (const [ing, amount] of Object.entries(r)) {
            need[ing] = (need[ing] || 0) + Number(amount) * q;
          }
        }
      }
      const orgId = o.orgId;
      const invIds = Object.keys(need);
      for (const id of invIds) {
        const invRef = doc(db, "inventoryItems", id);
        const invSnap = await tx.get(invRef);
        if (invSnap.exists()) {
          const current = Number(invSnap.data()?.stock || 0);
          tx.update(invRef, { stock: current + Number(need[id]), updatedAt: serverTimestamp() });
        }
        const movRef = doc(collection(db, "stockMovements"));
        tx.set(movRef, {
          orgId,
          dateKey: toDateKey(),
          at: serverTimestamp(),
          type: "in",
          ingredientId: id,
          qty: Number(need[id]),
          reason: "delete",
          orderId
        });
      }
    }
    tx.delete(ref);
  });
}

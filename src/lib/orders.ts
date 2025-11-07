// src/lib/orders.ts
/**
 * Utilidades para órdenes:
 * - Crear orden (status:"pending") sin escribir undefined.
 * - Marcar entregada (status:"delivered").
 * - Cancelar (reabre stock con movimiento 'revert').
 *
 * Compatibilidad: incluye createOrderFromBuilder para el flujo del Builder.
 */

import type { Firestore } from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db as defaultDb, getOrgId, toDateKey } from "@/services/firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

export type PayMethod = "cash" | "qr" | "card" | "other";
export type OrderStatus = "pending" | "delivered" | "canceled";

/** Ítem a consumir directamente desde inventario */
export type OrderItem = {
  inventoryItemId: string;
  qty: number;              // en la misma unidad que inventoryItems.unit
  name?: string | null;     // opcional para UI
  unit?: string | null;     // opcional para UI
};

export type OrderDoc = {
  id: string;
  orgId: string;
  items: OrderItem[];
  total: number;
  cogs: number;
  payMethod: PayMethod;
  status: OrderStatus;
  createdAt: any;
  deliveredAt?: any | null;
  canceledAt?: any | null;
  dateKey?: string;
  customerUid?: string | null;
  staffId?: string | null;
  // datos crudos del builder (opcional, sin undefined)
  builder?: any;
};

/* ---------- internos ---------- */
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// Sanitiza objetos anidados eliminando undefined (Firestore no acepta undefined).
function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as any;
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      if (val === undefined) continue;
      out[k] = stripUndefined(val as any);
    }
    return out;
  }
  return v;
}

async function computeCOGS(db: Firestore, items: OrderItem[]): Promise<number> {
  const parts = await Promise.all(
    items.map(async (it) => {
      const ref = doc(db, "inventoryItems", it.inventoryItemId);
      const snap = await getDoc(ref);
      const v: any = snap.exists() ? snap.data() : {};
      const cpu = Math.max(0, num(v?.costPerUnit));
      const qty = Math.max(0, num(it.qty));
      return cpu * qty;
    })
  );
  const cogs = parts.reduce((s, x) => s + x, 0);
  return Math.round(cogs * 100) / 100;
}

function cleanPayMethod(pm?: string): PayMethod {
  return (["cash", "qr", "card", "other"] as const).includes(pm as any)
    ? (pm as PayMethod)
    : "other";
}

/* ---------- API básica ---------- */

export async function createOrder(
  db: Firestore,
  payload: {
    items: Array<{ inventoryItemId: string; qty: number; name?: string | null; unit?: string | null }>;
    total: number;
    payMethod: PayMethod | string;
    customerUid?: string | null;
    staffId?: string | null;
    extra?: any; // opcional (p. ej., builder breakdown)
  }
): Promise<string> {
  const orgId = getOrgId();
  const items: OrderItem[] = (payload.items || [])
    .map((i) => ({
      inventoryItemId: String(i.inventoryItemId),
      qty: Math.max(0, num(i.qty)),
      name: i.name ?? null,
      unit: i.unit ?? null,
    }))
    .filter((i) => i.inventoryItemId && i.qty > 0);

  if (!items.length) throw new Error("La orden no tiene ítems válidos.");

  const total = Math.max(0, num(payload.total));
  const payMethod = cleanPayMethod(payload.payMethod);
  const cogs = await computeCOGS(db, items);

  const ref = doc(collection(db, "orders"));
  const order: OrderDoc = {
    id: ref.id,
    orgId,
    items,
    total,
    cogs,
    payMethod,
    status: "pending",
    createdAt: serverTimestamp(),
    // ⚠️ nunca escribimos undefined:
    deliveredAt: null,
    canceledAt: null,
    dateKey: toDateKey(),
    customerUid: payload.customerUid ?? null,
    staffId: payload.staffId ?? null,
    builder: payload.extra ? stripUndefined(payload.extra) : undefined,
  };

  // Limpieza final por si quedó algo undefined en builder
  await setDoc(ref, stripUndefined(order) as any);
  return ref.id;
}

/* ---------- Compat: Builder ---------- */
/**
 * Compatibilidad con el llamado desde BuilderClient:
 * createOrderFromBuilder({ items:[{ custom:true, sizeId, components[], price, meta }], userId, ... })
 * - Aplana 'components' a items de inventario y usa 'price' como total.
 * - payMethod = "other" (se cobra en caja / entrega).
 */
export async function createOrderFromBuilder(payload: {
  items: Array<{
    custom?: boolean;
    sizeId: string;
    components: Array<{ itemId: string; qty: number; unit?: string }>;
    price: number;
    meta?: any;
  }>;
  userId?: string | null;
  staffId?: string | null;
  payMethod?: PayMethod | string;
}, dbInstance: Firestore = defaultDb): Promise<string> {

  // Aplanar componentes → items de inventario
  const m = new Map<string, { qty: number; name?: string | null; unit?: string | null }>();
  for (const it of payload.items || []) {
    for (const c of it.components || []) {
      if (!c || !c.itemId) continue;
      const k = String(c.itemId);
      const prev = m.get(k)?.qty ?? 0;
      m.set(k, { qty: prev + Math.max(0, num(c.qty)), unit: (c.unit ?? null) as any });
    }
  }
  const items = Array.from(m.entries()).map(([inventoryItemId, v]) => ({
    inventoryItemId,
    qty: v.qty,
    unit: v.unit ?? null,
  }));

  const total = Math.max(0, num((payload.items || []).reduce((s, it) => s + num(it.price), 0)));
  const extra = {
    source: "builder",
    lines: stripUndefined(payload.items || []),
  };

  return createOrder(dbInstance, {
    items,
    total,
    payMethod: payload.payMethod ?? "other",
    customerUid: payload.userId ?? null,
    staffId: payload.staffId ?? null,
    extra,
  });
}

/* ---------- Entregar / Cancelar ---------- */

export async function markOrderDelivered(db: Firestore, orderId: string): Promise<void> {
  const ref = doc(db, "orders", orderId);
  await updateDoc(ref, {
    status: "delivered",
    deliveredAt: serverTimestamp(),
  });
  try { await awardStampsOnDeliveredOrder(db, orderId); } catch {}
}

export async function cancelOrder(db: Firestore, orderId: string): Promise<void> {
  const orgId = getOrgId();
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe.");
    const o = snap.data() as any as OrderDoc;

    if (o.status === "canceled") return;
    if (o.status === "delivered") throw new Error("No se puede cancelar: ya fue entregada.");

    // Re-abrir stock (el consumo lo hace tu CF onOrderCreate al crear)
    for (const it of o.items || []) {
      const invRef = doc(db, "inventoryItems", it.inventoryItemId);
      const invSnap = await tx.get(invRef);
      const cur = num(invSnap.exists() ? (invSnap.data() as any)?.stock : 0);
      const next = cur + Math.max(0, num((it as any).qty));
      tx.set(invRef, { orgId, stock: next, updatedAt: serverTimestamp() }, { merge: true });

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(movRef, {
        id: movRef.id,
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "revert",
        reason: "cancel",
        ingredientId: it.inventoryItemId,
        qty: Math.max(0, num((it as any).qty)),
        orderId,
      });
    }

    tx.update(ref, { status: "canceled", canceledAt: serverTimestamp() });
  });
}

// src/lib/orders.ts
/**
 * Utilidades para órdenes:
 * - Tipos y helpers de escritura.
 * - Crear orden (status:"pending") con COGS calculado.
 * - Marcar entregada (status:"delivered") con deliveredAt.
 * - Cancelar (status:"canceled") con revert de inventario.
 *
 * Notas:
 * - Reglas: crear la orden (staff), marcar delivered (worker con campos inmutables), cancelar (owner).
 * - Caja calcula el efectivo esperado desde orders.deliveredAt + payMethod; aquí NO generamos cashMovements.
 * - COGS se calcula leyendo costPerUnit de inventoryItems.
 * - La CF onOrderCreate hace el consumo de stock al crear la orden (kardex type:"consume", reason:"sale").
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
import { getOrgId, toDateKey } from "@/services/firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

export type PayMethod = "cash" | "qr" | "card" | "other";
export type OrderStatus = "pending" | "delivered" | "canceled";

/** Ítem a consumir directamente desde inventario (compatible con tu CF onOrderCreate) */
export type OrderItem = {
  inventoryItemId: string;
  qty: number; // en la misma unidad que inventoryItems.unit
  name?: string | null; // sólo informativo
  unit?: string | null; // sólo informativo
};

export type OrderDoc = {
  id: string;
  orgId: string;
  items: OrderItem[];
  total: number;          // total cobrado al cliente
  cogs: number;           // costo de insumos (leer de inventoryItems.costPerUnit)
  payMethod: PayMethod;
  status: OrderStatus;
  createdAt: any;
  deliveredAt?: any;
  canceledAt?: any;
  dateKey?: string;
  // Trazabilidad / fidelización
  customerUid?: string | null;
  staffId?: string | null;
};

/* ---------- internos ---------- */
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

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
  return Math.round(cogs * 100) / 100; // redondeo 2 decimales
}

function cleanPayMethod(pm?: string): PayMethod {
  return (["cash", "qr", "card", "other"] as const).includes(pm as any)
    ? (pm as PayMethod)
    : "other";
}

/* ---------- API ---------- */

/**
 * Crea una orden "pending".
 * - Escribe orgId, dateKey local, items, total, cogs, payMethod, status, createdAt.
 * - Tu Cloud Function onOrderCreate consumirá inventario (kardex) al crear la orden.
 */
export async function createOrder(
  db: Firestore,
  payload: {
    items: Array<{ inventoryItemId: string; qty: number; name?: string | null; unit?: string | null }>;
    total: number;
    payMethod: PayMethod | string;
    customerUid?: string | null;
    staffId?: string | null;
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
    deliveredAt: undefined,
    canceledAt: undefined,
    dateKey: toDateKey(),
    customerUid: payload.customerUid ?? null,
    staffId: payload.staffId ?? null,
  };

  await setDoc(ref, order as any);
  return ref.id;
}

/**
 * Marca una orden como entregada (workers pueden hacer este update según tus reglas).
 * - Mantiene inmutable: orgId, total, items, createdAt, payMethod, customerUid.
 * - Suma deliveredAt: serverTimestamp()
 * - Luego intenta otorgar sellos de fidelización (idempotente).
 */
export async function markOrderDelivered(db: Firestore, orderId: string): Promise<void> {
  const ref = doc(db, "orders", orderId);
  await updateDoc(ref, {
    status: "delivered",
    deliveredAt: serverTimestamp(),
  });

  // Post-hook: fidelización (idempotente y con sus propias validaciones)
  try {
    await awardStampsOnDeliveredOrder(db, orderId);
  } catch {
    // silencioso: no bloquea la entrega
  }
}

/**
 * Cancela una orden.
 * - Reabre stock consumido en la creación (kardex 'revert' reason:'cancel').
 * - Sella status:'canceled' y canceledAt.
 * - Requiere permisos de Owner (según tus reglas).
 */
export async function cancelOrder(db: Firestore, orderId: string): Promise<void> {
  const orgId = getOrgId();
  const ref = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Orden no existe.");
    const o = snap.data() as any as OrderDoc;

    if (o.status === "canceled") return; // idempotente
    if (o.status === "delivered") throw new Error("No se puede cancelar: ya fue entregada.");

    // Devolvemos el stock (lo consumió CF al crear)
    for (const it of o.items || []) {
      const invRef = doc(db, "inventoryItems", it.inventoryItemId);
      const invSnap = await tx.get(invRef);
      const cur = invSnap.exists() ? num(invSnap.data()?.stock) : 0;
      const inc = Math.max(0, num(it.qty));
      const next = cur + inc;

      // actualizar inventario (merge para no fallar si faltara el doc)
      tx.set(
        invRef,
        {
          orgId,
          stock: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // movimiento de revert (entrada)
      const movRef = doc(collection(db, "stockMovements"));
      tx.set(movRef, {
        id: movRef.id,
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "revert",       // aceptado por tus rules (parche legacy)
        reason: "cancel",     // aceptado por tus rules
        ingredientId: it.inventoryItemId,
        qty: inc,             // positiva
        orderId,
      });
    }

    tx.update(ref, {
      status: "canceled",
      canceledAt: serverTimestamp(),
    });
  });
}

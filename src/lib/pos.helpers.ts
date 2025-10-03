// src/lib/pos.helpers.ts
import type { Firestore } from "firebase/firestore";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { gaLog, getOrgId } from "@/services/firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

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

type InventoryRow = { id: string; have: number; req: number; name: string; unit?: string; cpu: number };

const ORG_ID = getOrgId();
const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

// ---------- utils ----------
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
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    price: Number(i.price) || 0,
    quantity: Number(i.qty) || 0,
  }));
}

// ---------- limpiar objetos (preservando Timestamp y sentinels) ----------
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
    if (v instanceof Timestamp) return v as any; // preservar Timestamp
    if (!isPlainObject(v)) return v as any; // preservar sentinels (p.ej., serverTimestamp())
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      const c = cleanDeep(val);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v as any;
}

// -------------------------
// Confirmar venta (descuenta stock, crea orden pending)
// -------------------------
export async function checkoutStrict(
  db: Firestore,
  items: CartItem[],
  payMethod: PayMethod = "cash",
  staffUid?: string | null,
  customerUid?: string | null
): Promise<string> {
  if (!items.length) throw new Error("El carrito está vacío");

  const need = aggregateNeed(items);
  const invIds = Object.keys(need);
  const orderRef = doc(collection(db, "orders")); // id ya disponible para vincular en stockMovements

  await runTransaction(db, async (tx) => {
    // ----- LECTURAS inventario -----
    const rows: InventoryRow[] = [];
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

      if (have < req) throw new Error(`Stock insuficiente de ${name}. Falta ${req - have} ${unit || ""}.`);
      rows.push({ id, have, req, name, unit, cpu });
    }

    const totalCogs = rows.reduce<number>((acc, r) => acc + r.req * r.cpu, 0);

    // ----- ESCRITURAS inventario + kardex -----
    for (const { id, have, req } of rows) {
      const ref = doc(db, "inventoryItems", id);
      tx.update(ref, { stock: have - req, updatedAt: serverTimestamp() });

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(
        movRef,
        cleanDeep({
          id: movRef.id,
          orgId: ORG_ID,
          dateKey: ymd(),
          at: serverTimestamp(),
          type: "consume",
          ingredientId: id,
          qty: req,
          reason: "sale",
          orderId: orderRef.id,
        })
      );
    }

    // ----- Orden -----
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
    const total = safeItems.reduce<number>((s, it) => s + (Number(it.total) || 0), 0);

    tx.set(
      orderRef,
      cleanDeep({
        id: orderRef.id,
        orgId: ORG_ID,
        dateKey: ymd(),
        at: createdAt,
        createdAt,
        items: safeItems,
        total,
        cogs: Number(totalCogs || 0),
        payMethod: payMethod || "cash",
        status: "pending",
        staffId: staffUid ?? null,
        customerUid: customerUid ?? null,
        consumption: need, // para revertir exacto si se cancela
      })
    );
  });

  // Analytics (no bloquea)
  try {
    const total = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
    await gaLog("begin_checkout", { value: total, currency: "COP", items: toAnalyticsItems(items) });
  } catch {}

  return orderRef.id;
}

// -------------------------
// Entregar (marca delivered + acredita sellos)
// -------------------------
export async function deliverOrder(db: Firestore, orderId: string) {
  const ref = doc(db, "orders", orderId);

  // Marcamos delivered de forma transaccional e idempotente
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

  // Analytics
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
        }))
      ),
    });
  } catch {}

  // Ledger (no bloquea si falla). Usa customers.awardStampsOnDeliveredOrder
  try {
    await awardStampsOnDeliveredOrder(db, orderId);
  } catch {}

  return;
}

export async function markDelivered(db: Firestore, orderId: string) {
  return deliverOrder(db, orderId);
}

// -------------------------
// Anular (revierte stock y marca canceled)
// -------------------------
export async function cancelOrder(db: Firestore, orderId: string) {
  const orderRef = doc(db, "orders", orderId);

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
      const invRef = doc(db, "inventoryItems", id);
      const snap = await tx.get(invRef);
      invSnaps[id] = snap.exists() ? { have: Number(snap.data()?.stock || 0) } : null;
    }

    // ESCRITURAS: devolver stock + kardex revert
    for (const id of invIds) {
      const giveBack = Number(need[id] || 0);
      const invRef = doc(db, "inventoryItems", id);
      const have = invSnaps[id]?.have ?? 0;

      if (invSnaps[id]) {
        tx.update(invRef, { stock: have + giveBack, updatedAt: serverTimestamp() });
      }

      const movRef = doc(collection(db, "stockMovements"));
      tx.set(
        movRef,
        cleanDeep({
          id: movRef.id,
          orgId: ORG_ID,
          dateKey: ymd(),
          at: serverTimestamp(),
          type: "revert",
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
        }))
      ),
    });
  } catch {}
}

// -------------------------
// Eliminar (si no estaba cancelada, también revierte stock)
// -------------------------
export async function deleteOrder(db: Firestore, orderId: string) {
  const orderRef = doc(db, "orders", orderId);

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
        const invRef = doc(db, "inventoryItems", id);
        const invSnap = await tx.get(invRef);
        invSnaps[id] = invSnap.exists() ? { have: Number(invSnap.data()?.stock || 0) } : null;
      }

      // devolver stock + kardex revert (delete)
      for (const id of invIds) {
        const give = Number(need[id] || 0);
        const invRef = doc(db, "inventoryItems", id);
        const have = invSnaps[id]?.have ?? 0;

        if (invSnaps[id]) {
          tx.update(invRef, { stock: have + give, updatedAt: serverTimestamp() });
        }

        const movRef = doc(collection(db, "stockMovements"));
        tx.set(
          movRef,
          cleanDeep({
            id: movRef.id,
            orgId: ORG_ID,
            dateKey: ymd(),
            at: serverTimestamp(),
            type: "revert",
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

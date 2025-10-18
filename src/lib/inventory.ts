// src/lib/inventory.ts
/**
 * Helpers de inventario (ledger / kardex):
 * - Entradas y salidas manuales (in/out).
 * - Ajuste directo a un stock objetivo.
 * - Consumo por receta/BOM (para ventas), con movimientos type:"consume".
 *
 * Compatibles con tus reglas de seguridad:
 *   - type ∈ ['consume','revert','buy','adjust'] o ['in','out']
 *   - qty > 0
 *   - reason ∈ ['sale','cancel','delete','purchase','manual'] o null
 *
 * Notas:
 * - Siempre escribimos qty POSITIVA en los movimientos.
 * - Para consumo por venta usamos { type:'consume', reason:'sale' }.
 * - Para entradas/salidas manuales usamos { type:'in'|'out', reason:'manual' }.
 */

import type { Firestore, DocumentReference } from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getOrgId, toDateKey } from "@/services/firebase";

/** ===== Tipos ===== */
export type Unit = "g" | "ml" | "u";
export type StockMovementType = "in" | "out" | "adjust" | "consume" | "revert";
export type StockReason = "manual" | "sale" | "cancel" | "delete" | "purchase" | null;

export type BomLine = {
  ingredientId: string;
  qty: number; // en la unidad del inventoryItem
};

export type MovementMeta = {
  /** Motivo permitido por rules. Default: 'manual' (o 'sale' en consume). */
  reason?: StockReason;
  /** Info adicional libre, no usada por rules. */
  metaReason?: string | null;
  /** Para trazabilidad UI */
  orderId?: string | null;
  purchaseId?: string | null;
  /** Usuario operador (worker/owner). */
  userId?: string | null;
};

/** ===== Utilidades ===== */
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

async function readItemMeta(
  db: Firestore,
  ingredientId: string
): Promise<{ name: string; unit: Unit | null; stock: number; ref: DocumentReference }> {
  const ref = doc(db, "inventoryItems", ingredientId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Ítem no existe: ${ingredientId}`);
  const v: any = snap.data();
  const name = String(v?.name ?? ingredientId);
  const unit = (v?.unit as Unit) || null;
  const stock = num(v?.stock, 0);
  return { name, unit, stock, ref };
}

function movementBase(extra?: Partial<Record<string, any>>) {
  return {
    orgId: getOrgId(),
    dateKey: toDateKey(),
    at: serverTimestamp(),
    ...(extra || {}),
  };
}

/** ===== Escribe movimiento de stock (para usar dentro de runTransaction) ===== */
function txWriteMovement(
  db: Firestore,
  tx: any,
  data: {
    type: StockMovementType;
    ingredientId: string;
    qty: number; // positiva
    reason: StockReason;
    meta?: MovementMeta;
    itemName?: string | null;
    unit?: Unit | null;
  }
) {
  const movRef = doc(collection(db, "stockMovements"));
  tx.set(movRef, {
    id: movRef.id,
    ...movementBase(),
    type: data.type,
    ingredientId: data.ingredientId,
    qty: Math.max(0, num(data.qty)), // SIEMPRE positiva
    reason: data.reason ?? null,
    metaReason: data.meta?.metaReason ?? null,
    orderId: data.meta?.orderId ?? null,
    purchaseId: data.meta?.purchaseId ?? null,
    userId: data.meta?.userId ?? null,
    itemName: data.itemName ?? null,
    unit: data.unit ?? null,
  });
}

/** ====== Entradas/salidas manuales ====== */

/** Entrada manual a inventario (kardex: type:'in', reason:'manual'). */
export async function addStock(
  db: Firestore,
  ingredientId: string,
  qty: number,
  meta?: MovementMeta
) {
  const orgId = getOrgId();
  const inc = Math.max(0, num(qty));
  if (!(inc > 0)) throw new Error("Cantidad inválida");

  await runTransaction(db, async (tx) => {
    const { name, unit, stock, ref } = await readItemMeta(db, ingredientId);
    const next = stock + inc;

    tx.update(ref, { orgId, stock: next, updatedAt: serverTimestamp() });
    txWriteMovement(db, tx, {
      type: "in",
      ingredientId,
      qty: inc,
      reason: meta?.reason ?? "manual",
      meta,
      itemName: name,
      unit,
    });
  });
}

/** Salida manual de inventario (kardex: type:'out', reason:'manual'). */
export async function removeStock(
  db: Firestore,
  ingredientId: string,
  qty: number,
  meta?: MovementMeta
) {
  const orgId = getOrgId();
  const dec = Math.max(0, num(qty));
  if (!(dec > 0)) throw new Error("Cantidad inválida");

  await runTransaction(db, async (tx) => {
    const { name, unit, stock, ref } = await readItemMeta(db, ingredientId);
    const next = stock - dec;
    if (next < 0) throw new Error("Stock insuficiente");

    tx.update(ref, { orgId, stock: next, updatedAt: serverTimestamp() });
    txWriteMovement(db, tx, {
      type: "out",
      ingredientId,
      qty: dec,
      reason: meta?.reason ?? "manual",
      meta,
      itemName: name,
      unit,
    });
  });
}

/**
 * Ajuste a un stock objetivo.
 * - Si next > actual → escribe movimiento de entrada.
 * - Si next < actual → escribe movimiento de salida.
 * (Puedes cambiar a type:'adjust' si prefieres; tus rules lo permiten).
 */
export async function adjustStockTo(
  db: Firestore,
  ingredientId: string,
  nextStock: number,
  meta?: MovementMeta
) {
  const orgId = getOrgId();
  const target = Math.max(0, num(nextStock));

  await runTransaction(db, async (tx) => {
    const { name, unit, stock, ref } = await readItemMeta(db, ingredientId);
    if (target === stock) return; // sin cambio

    const diff = target - stock;
    const abs = Math.abs(diff);

    tx.update(ref, { orgId, stock: target, updatedAt: serverTimestamp() });

    txWriteMovement(db, tx, {
      type: diff > 0 ? "in" : "out", // también podrías usar 'adjust'
      ingredientId,
      qty: abs,
      reason: meta?.reason ?? "manual",
      meta: { ...(meta || {}), metaReason: "adjust" },
      itemName: name,
      unit,
    });
  });
}

/** ====== Consumo por receta / BOM (ventas) ====== */

/**
 * Consume una sola línea de BOM (kardex: type:'consume', reason:'sale').
 * Útil para casos simples o pruebas.
 */
export async function consumeOne(
  db: Firestore,
  ingredientId: string,
  qty: number,
  meta?: MovementMeta
) {
  const orgId = getOrgId();
  const use = Math.max(0, num(qty));
  if (!(use > 0)) return;

  await runTransaction(db, async (tx) => {
    const { name, unit, stock, ref } = await readItemMeta(db, ingredientId);
    const next = stock - use;
    if (next < 0) throw new Error(`Stock insuficiente: ${name}`);

    tx.update(ref, { orgId, stock: next, updatedAt: serverTimestamp() });
    txWriteMovement(db, tx, {
      type: "consume",
      ingredientId,
      qty: use,
      reason: meta?.reason ?? "sale",
      meta,
      itemName: name,
      unit,
    });
  });
}

/**
 * Consume una BOM completa en una sola transacción.
 * - Para ventas: pasa orderId en meta → { orderId, userId }.
 * - Cada línea genera un movimiento de kardex type:'consume', reason:'sale'.
 */
export async function consumeBOM(
  db: Firestore,
  bom: BomLine[],
  meta?: MovementMeta
) {
  const orgId = getOrgId();
  const lines = (bom || [])
    .map((l) => ({ ingredientId: String(l.ingredientId), qty: Math.max(0, num(l.qty)) }))
    .filter((l) => l.ingredientId && l.qty > 0);

  if (!lines.length) return;

  await runTransaction(db, async (tx) => {
    // Leemos todos los ítems primero
    const metas = await Promise.all(lines.map((l) => readItemMeta(db, l.ingredientId)));

    // Validamos disponibilidad
    for (let i = 0; i < lines.length; i++) {
      const need = lines[i].qty;
      const { name, stock } = metas[i];
      if (stock - need < 0) {
        throw new Error(`Stock insuficiente para ${name}`);
      }
    }

    // Aplicamos consumo y movimientos
    for (let i = 0; i < lines.length; i++) {
      const { ingredientId, qty } = lines[i];
      const { name, unit, stock, ref } = metas[i];

      tx.update(ref, {
        orgId,
        stock: stock - qty,
        updatedAt: serverTimestamp(),
      });

      txWriteMovement(db, tx, {
        type: "consume",
        ingredientId,
        qty,
        reason: meta?.reason ?? "sale",
        meta,
        itemName: name,
        unit,
      });
    }
  });
}

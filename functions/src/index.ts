// functions/src/index.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

type OrderItem = { inventoryItemId?: string; qty?: number };
type Order = { orgId?: string | null; items?: OrderItem[] };

// Disminuye inventario y registra kardex al crear una orden
export const onOrderCreate = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data; // QueryDocumentSnapshot | undefined (inferencia)
  if (!snap) return null;

  const order = (snap.data() ?? {}) as Order;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return null;

  const batch = db.batch();
  const orgId = order.orgId ?? null;
  const dateKey = new Date().toISOString().slice(0, 10);

  for (const it of items) {
    const invId = String(it.inventoryItemId || "");
    const qty = Number(it.qty || 0);
    if (!invId || !(qty > 0)) continue;

    // Kardex (modelo compatible con tus rules)
    const movRef = db.collection("stockMovements").doc();
    batch.set(movRef, {
      id: movRef.id,
      orgId,
      dateKey,
      at: FieldValue.serverTimestamp(),
      type: "consume",  // permitido por tus rules
      reason: "sale",   // permitido por tus rules
      ingredientId: invId,
      qty,              // positiva
      orderId: event.params.orderId,
    });

    // Descuento de inventario
    const invRef = db.collection("inventoryItems").doc(invId);
    batch.update(invRef, {
      stock: FieldValue.increment(-qty),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return null;
});

// Reexporta otros triggers
export { autoPurchase } from "./autoPurchase";

// functions/src/index.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

type OrderItem = { inventoryItemId: string; qty: number };
type Order = { items?: OrderItem[] };

export const onOrderCreate = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) return null;

  const order = snap.data() as Order;
  if (!order?.items?.length) return null;

  const batch = db.batch();

  for (const item of order.items) {
    const invRef = db.collection("inventoryItems").doc(item.inventoryItemId);
    const movRef = db.collection("stockMovements").doc();

    // registro de movimiento
    batch.set(movRef, {
      inventoryItemId: item.inventoryItemId,
      change: -item.qty,
      reason: "sale",
      at: FieldValue.serverTimestamp(),
      orderId: event.params.orderId,
    });

    // descuento de inventario
    batch.update(invRef, { stock: FieldValue.increment(-item.qty) });
  }

  await batch.commit();
  return null;
});

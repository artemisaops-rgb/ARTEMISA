import {
  getFirestore, doc, collection, runTransaction, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { TemplateComponent } from './types.ar.rb';

const db = getFirestore();

/**
 * Descuenta stock de inventoryItems y registra movimientos OUT por cada componente del pedido.
 * Si cualquier item queda por debajo de 0, la transacción falla completa.
 */
export async function applyStockForOrder(
  orgId: string,
  orderId: string,
  components: TemplateComponent[]
){
  // 1) Transacción: descuenta stock en cada item
  await runTransaction(db, async (tx) => {
    for (const c of components) {
      const ref = doc(db, 'inventoryItems', c.itemId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('inventory/not-found:' + c.itemId);
      const data = snap.data() as any;
      const current = Number(data.stock ?? 0);
      const next = current - Number(c.qty ?? 0);
      if (next < 0) throw new Error('inventory/insufficient:' + c.itemId);
      tx.update(ref, { stock: next, updatedAt: serverTimestamp() });
    }
  });

  // 2) Movimientos OUT
  const batch = writeBatch(db);
  const now = serverTimestamp();
  for (const c of components) {
    const movRef = doc(collection(db, 'stockMovements'));
    batch.set(movRef, {
      orgId, itemId: c.itemId, orderId,
      type: 'OUT', qty: c.qty, unit: c.unit,
      createdAt: now
    });
  }
  await batch.commit();
}
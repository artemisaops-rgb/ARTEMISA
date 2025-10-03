// src/lib/customers.ts
import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  Firestore,
} from "firebase/firestore";
import { getOrgId, db as appDb } from "@/services/firebase";

export const BEVERAGE_CATEGORIES = ["frappes", "coldbrew", "bebidas calientes"] as const;
type Cat = (typeof BEVERAGE_CATEGORIES)[number];

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  price?: number;
  category?: string;
  isBeverage?: boolean;
  sizeId?: string;
  sizeName?: string;
};

type OrderDoc = {
  id: string;
  orgId: string;
  customerUid?: string | null;
  items?: OrderItem[];
  deliveredAt?: any;
  staffId?: string;
};

export async function ensureCustomerDoc(db: Firestore, uid: string, patch?: Partial<Record<string, any>>) {
  const ref = doc(db, "customers", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const now = serverTimestamp();
    // primer intento "update" por si existe / offline, cae en set transaccional
    await updateDoc(ref, {} as any).catch(async () => {
      await runTransaction(db, async (tx) => {
        tx.set(ref, {
          orgId: getOrgId(),
          stampsProgress: 0,
          totalStamps: 0,
          freeCredits: 0,
          createdAt: now,
          updatedAt: now,
          ...(patch || {}),
        });
      });
    });
  } else if (patch && Object.keys(patch).length) {
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as any);
  }
}

/** Wrapper para que Auth.tsx pueda llamar ensureCustomerProfile({ uid, email, displayName, photoURL }) */
export type EnsureCustomerProfileArgs = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};
export async function ensureCustomerProfile(args: EnsureCustomerProfileArgs) {
  const { uid, email, displayName, photoURL } = args;
  return ensureCustomerDoc(appDb, uid, {
    email: email ?? null,
    displayName: displayName ?? null,
    photoURL: photoURL ?? null,
  });
}

function countBeverages(items: OrderItem[] | undefined): number {
  if (!items || !items.length) return 0;
  return items.reduce((sum, it) => {
    const isB =
      Boolean(it.isBeverage) ||
      (it.category ? (BEVERAGE_CATEGORIES as readonly string[]).includes(it.category.toLowerCase()) : false);
    return sum + (isB ? Number(it.qty || 0) : 0);
  }, 0);
}

/** Recalcula derivados a partir de totalStamps neto */
function derive(totalStamps: number) {
  const ts = Math.max(0, Math.floor(totalStamps));
  const freeCredits = Math.floor(ts / 10);
  const stampsProgress = ts % 10;
  return { totalStamps: ts, freeCredits, stampsProgress };
}

/** Canje manual de 1 bebida gratis (-10 sellos) */
export async function redeemOneFreeBeverage(db: Firestore, customerUid: string) {
  const orgId = getOrgId();
  const custRef = doc(db, "customers", customerUid);
  const eventsCol = collection(db, "customers", customerUid, "loyaltyEvents");

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(custRef);
    if (!snap.exists()) throw new Error("El cliente no existe.");
    const cur = snap.data() || {};
    const totalStamps = Number(cur.totalStamps || 0);
    if (totalStamps < 10) throw new Error("Sin créditos disponibles.");
    const next = derive(totalStamps - 10);
    tx.update(custRef, { ...next, updatedAt: serverTimestamp() });
    tx.set(doc(eventsCol), {
      orgId,
      type: "redeem",
      delta: -10,
      at: serverTimestamp(),
      by: "staff",
    });
  });
}

/** Acredita sellos al ENTREGAR una orden (idempotente por status) */
export async function awardStampsOnDeliveredOrder(db: Firestore, orderId: string) {
  const orgId = getOrgId();
  const orderRef = doc(db, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const osnap = await tx.get(orderRef);
    if (!osnap.exists()) return;
    const o = { id: orderId, ...(osnap.data() as any) } as OrderDoc;
    const uid = o.customerUid || null;
    if (!uid) return; // no hay cliente asociado
    const stamps = countBeverages(o.items);
    if (stamps <= 0) return;

    const custRef = doc(db, "customers", uid);
    const csnap = await tx.get(custRef);
    if (!csnap.exists()) {
      tx.set(custRef, {
        orgId,
        stampsProgress: 0,
        totalStamps: 0,
        freeCredits: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    const cur = (csnap.exists() ? csnap.data() : { totalStamps: 0 }) as any;
    const next = derive(Number(cur.totalStamps || 0) + stamps);

    const eventsCol = collection(db, "customers", uid, "loyaltyEvents");
    tx.set(doc(eventsCol), {
      orgId,
      type: "earn",
      delta: stamps,
      orderId,
      at: serverTimestamp(),
      staffId: o.staffId || null,
    });
    tx.update(custRef, { ...next, updatedAt: serverTimestamp() });
  });
}

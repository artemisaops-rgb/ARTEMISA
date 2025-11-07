// src/lib/customers.ts
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { getOrgId } from "@/services/firebase";

/** ===== Toggle multi-tenant (igual que en pos.helpers) ===== */
const USE_ORG_SUBCOLS = false;
const col = (db: Firestore, orgId: string, name: string) =>
  USE_ORG_SUBCOLS ? collection(db as any, "orgs", orgId, name) : collection(db as any, name);
const docIn = (db: Firestore, orgId: string, name: string, id?: string) =>
  id
    ? (USE_ORG_SUBCOLS ? doc(db as any, "orgs", orgId, name, id) : doc(db as any, name, id))
    : doc(col(db, orgId, name));

/** Perfil básico persistido en /customers/{uid} */
export type CustomerProfile = {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
};

export type CustomerDoc = CustomerProfile & {
  uid: string;
  totalStamps: number;
  freeCredits: number;
  stampsProgress: number;
  isDeleted: boolean;
  orgId?: string | null;
  createdAt: any;
  updatedAt: any;
};

/** Deriva contadores de fidelización a partir de totalStamps. */
function derive(totalStamps: number) {
  const ts = Math.max(0, Math.floor(Number(totalStamps || 0)));
  const freeCredits = Math.floor(ts / 10);
  const stampsProgress = ts % 10;
  return { totalStamps: ts, freeCredits, stampsProgress };
}

const safe = (v: any) => (v === undefined ? null : v);

/**
 * Crea/actualiza el doc de cliente en /customers/{uid}.
 * - Idempotente
 * - Sin undefined
 * - Usa siempre setDoc(..., { merge: true }) para evitar 400 en updateDoc
 */
export async function ensureCustomerDoc(
  db: Firestore,
  uid: string,
  profile?: CustomerProfile
): Promise<void> {
  if (!uid) return;

  const orgId = String(getOrgId() || "artemisa");
  const ref = docIn(db, orgId, "customers", uid);

  // Leemos una vez para saber si hay que incluir defaults de creación
  const snap = await getDoc(ref);
  const isNew = !snap.exists();

  const base = {
    uid,
    orgId,
    email: safe(profile?.email ?? null),
    displayName: safe(profile?.displayName ?? null),
    photoURL: safe(profile?.photoURL ?? null),
    phoneNumber: safe(profile?.phoneNumber ?? null),
    updatedAt: serverTimestamp(),
    ...(isNew
      ? {
          // Defaults solo al crear (para no pisar contadores existentes)
          ...derive(0),
          isDeleted: false,
          createdAt: serverTimestamp(),
        }
      : {}),
  } as Partial<CustomerDoc>;

  await setDoc(ref, base, { merge: true });
}

export async function ensureCustomerProfile(
  db: Firestore,
  uid: string,
  profile: CustomerProfile
) {
  return ensureCustomerDoc(db, uid, profile);
}

/** Canjea 1 crédito (= 10 sellos). */
export async function redeemOneFreeBeverage(db: Firestore, customerUid: string) {
  const orgId = getOrgId();
  const custRef = docIn(db, orgId, "customers", customerUid);
  const eventsRoot = col(db, orgId, "customers");
  const evRef = (uid: string) => doc(collection(eventsRoot, uid, "loyaltyEvents"));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(custRef);
    if (!snap.exists()) throw new Error("El cliente no existe.");
    const cur = snap.data() || {};
    const total = Number(cur.totalStamps || 0);
    if (total < 10) throw new Error("Sin créditos disponibles.");
    const next = derive(total - 10);

    tx.set(custRef, { ...next, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(evRef(customerUid), {
      orgId,
      type: "redeem",
      delta: -10,
      at: serverTimestamp(),
      by: "staff",
    });
  });
}

/**
 * +1 sello POR COMPRA al marcar delivered (idempotente, excluye staff/owner y auto-compra).
 * Idempotencia sin tocar el doc de la orden (evita romper reglas para workers).
 */
export async function awardStampsOnDeliveredOrder(db: Firestore, orderId: string) {
  const orgId = getOrgId();
  const orderRef = docIn(db, orgId, "orders", orderId);

  await runTransaction(db, async (tx) => {
    const osnap = await tx.get(orderRef);
    if (!osnap.exists()) return;

    const o = { id: orderId, ...(osnap.data() as any) } as {
      customerUid?: string | null;
      staffId?: string | null;
      total?: number;
      status?: string;
      stampsAwarded?: boolean;
    };

    // 1) Debe estar entregada
    if ((o.status || "") !== "delivered") return;

    // 2) Cliente válido
    const uid = o.customerUid || null;
    if (!uid) return;

    // 3) No auto-premiarse
    if (o.staffId && uid === o.staffId) return;

    // 4) Excluir staff/owner del org
    const mRef = doc(db, "orgs", orgId, "members", uid);
    const msnap = await tx.get(mRef);
    if (msnap.exists()) {
      const r = String((msnap.data() as any)?.role || "client");
      if (r === "owner" || r === "worker") return;
    }

    // 5) Orden con total > 0
    if (Number(o.total || 0) <= 0) return;

    // 6) Idempotencia vía evento con ID determinístico (sin escribir en orders)
    const eventsRoot = col(db, orgId, "customers");
    const evId = `order_${orderId}`;
    const evRef = doc(collection(eventsRoot, uid, "loyaltyEvents"), evId);
    const evSnap = await tx.get(evRef);
    if (evSnap.exists()) return; // ya otorgado

    // 7) Asegurar doc de cliente (si no existe)
    const custRef = docIn(db, orgId, "customers", uid);
    const csnap = await tx.get(custRef);
    if (!csnap.exists()) {
      tx.set(
        custRef,
        {
          uid,
          email: null,
          displayName: null,
          photoURL: null,
          phoneNumber: null,
          ...derive(0),
          isDeleted: false,
          orgId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as CustomerDoc,
        { merge: true }
      );
    }

    const cur = (csnap.exists() ? csnap.data() : { totalStamps: 0 }) as any;
    const next = derive(Number(cur.totalStamps || 0) + 1);

    // 8) Registrar evento y actualizar contadores
    tx.set(evRef, {
      orgId,
      type: "earn",
      delta: 1,
      orderId,
      at: serverTimestamp(),
      staffId: o.staffId || null,
    });

    tx.set(custRef, { ...next, updatedAt: serverTimestamp() }, { merge: true });
  });
}

import type { Firestore } from "firebase/firestore";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  setDoc,
} from "firebase/firestore";

/** Usa VITE_ORG_ID si existe; si no, 'default' */
const ORG_ID = import.meta.env.VITE_ORG_ID ?? "default";

export type CashType = "in" | "out";

/** YYYY-MM-DD en hora local */
export function ymd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Rango del da local [00:00, 24:00) en Timestamps de Firestore */
export function dayRange(d = new Date()) {
  const fromDate = new Date(d);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + 1);
  return {
    from: Timestamp.fromDate(fromDate),
    to: Timestamp.fromDate(toDate),
  };
}

/** ID del doc de apertura para un usuario (mismo formato que usa Apertura) */
export function openingDocIdForUser(uid: string, d = new Date()): string {
  return `${ymd(d)}_${uid}`;
}

/** Flags de confirmacin de WhatsApp (Apertura sin foto en la app) */
export function hasWppConfirmations(tasksDone: any): boolean {
  const arr: string[] = Array.isArray(tasksDone) ? tasksDone : [];
  return arr.includes("foto_wpp_sent") && arr.includes("foto_wpp_double");
}

/** (Utilitario) Lee estado/meta de la apertura del usuario hoy */
export async function getOpeningMetaForUser(
  db: Firestore,
  uid: string,
  d = new Date()
): Promise<{
  exists: boolean;
  status: "open" | "closed" | "unknown";
  initialCash: number;
  tasksDone: string[];
}> {
  const id = openingDocIdForUser(uid, d);
  const ref = doc(collection(db, "openings"), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { exists: false, status: "unknown", initialCash: 0, tasksDone: [] };
  }
  const v: any = snap.data();
  return {
    exists: true,
    status: v?.status === "closed" ? "closed" : "open",
    initialCash: Number(v?.initialCash || 0),
    tasksDone: Array.isArray(v?.tasksDone) ? v.tasksDone : [],
  };
}

/** Registra un movimiento de caja. Cumple las reglas multi-tenant. */
export async function addCashMovement(
  db: Firestore,
  params: {
    userId: string; // debe ser el uid del auth actual (la regla lo exige)
    type: CashType;
    amount: number;
    reason?: string;
    orderId?: string;
  }
) {
  const amount = Number(params.amount || 0);
  if (!params.userId) throw new Error("Falta userId");
  if (!(amount > 0)) throw new Error("El monto debe ser mayor a 0");
  if (params.type !== "in" && params.type !== "out") {
    throw new Error("Tipo invlido");
  }

  await addDoc(collection(db, "cashMovements"), {
    orgId: ORG_ID,
    dateKey: ymd(),
    userId: params.userId,
    type: params.type,
    amount,
    reason: params.reason?.slice(0, 120) ?? null,
    orderId: params.orderId ?? null,
    at: serverTimestamp(), // las reglas validan nowish(at)
  });
}

/**
 * Snapshot de caja de HOY (tienda) por ORG:
 * - openingCash: primera apertura del da (por createdAt)
 * - cashSales:   entregadas en efectivo (deliveredAt hoy)
 *                menos anuladas en efectivo (canceledAt hoy)
 * - inTotal/outTotal: suma de cashMovements de hoy por tipo
 * - expectedCash = openingCash + cashSales + inTotal - outTotal
 */
export async function getTodayCashSnapshot(
  db: Firestore,
  _userId?: string | null // reservado por si luego deseas filtrar por cajero
): Promise<{
  openingCash: number;
  cashSales: number;
  inTotal: number;
  outTotal: number;
  expectedCash: number;
}> {
  const { from, to } = dayRange();

  // --- Apertura (openingCash) ?' primera del da por createdAt, filtrada por orgId
  let openingCash = 0;
  {
    const qOpen = query(
      collection(db, "openings"),
      where("orgId", "==", ORG_ID),
      where("createdAt", ">=", from),
      where("createdAt", "<", to),
      orderBy("createdAt", "asc"),
      limit(1)
    );
    const snap = await getDocs(qOpen);
    snap.forEach((d) => {
      const v: any = d.data();
      if (typeof v?.initialCash === "number") {
        openingCash = Number(v.initialCash || 0);
      }
    });
  }

  // --- Ventas en efectivo (delivered hoy) - Anulaciones en efectivo (canceled hoy)
  let cashSales = 0;

  // Entregadas hoy
  {
    const qDelivered = query(
      collection(db, "orders"),
      where("orgId", "==", ORG_ID),
      where("deliveredAt", ">=", from),
      where("deliveredAt", "<", to)
    );
    const snap = await getDocs(qDelivered);
    snap.forEach((d) => {
      const v: any = d.data();
      const total = Number(v.total || 0);
      const pm = String(v.payMethod || "");
      const status = String(v.status || "");
      if (pm === "cash" && status === "delivered" && total > 0) {
        cashSales += total;
      }
    });
  }

  // Anuladas hoy
  {
    const qCanceled = query(
      collection(db, "orders"),
      where("orgId", "==", ORG_ID),
      where("canceledAt", ">=", from),
      where("canceledAt", "<", to)
    );
    const snap = await getDocs(qCanceled);
    snap.forEach((d) => {
      const v: any = d.data();
      const total = Number(v.total || 0);
      const pm = String(v.payMethod || "");
      const status = String(v.status || "");
      if (pm === "cash" && status === "canceled" && total > 0) {
        cashSales -= total;
      }
    });
  }

  // --- Movimientos de caja (ingresos/egresos) por orgId
  let inTotal = 0;
  let outTotal = 0;
  {
    const qMovs = query(
      collection(db, "cashMovements"),
      where("orgId", "==", ORG_ID),
      where("at", ">=", from),
      where("at", "<", to),
      orderBy("at", "asc")
    );
    const snap = await getDocs(qMovs);
    snap.forEach((d) => {
      const v: any = d.data();
      const amt = Number(v.amount || 0);
      if (!(amt > 0)) return;
      if (v.type === "in") inTotal += amt;
      else if (v.type === "out") outTotal += amt;
    });
  }

  const expectedCash = openingCash + cashSales + inTotal - outTotal;
  return { openingCash, cashSales, inTotal, outTotal, expectedCash };
}

/** Cierra la apertura del usuario hoy (si existe) y guarda totales */
export async function closeOpeningForUser(
  db: Firestore,
  uid: string,
  data: { expectedCash: number; countedCash: number; cashDiff: number }
): Promise<"closed" | "no-opening"> {
  const id = openingDocIdForUser(uid);
  const ref = doc(collection(db, "openings"), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return "no-opening";

  await setDoc(ref, { orgId: ORG_ID }, { merge: true }); // por si faltara
  await updateDoc(ref, {
    status: "closed",
    expectedCash: Number(data.expectedCash || 0),
    countedCash: Number(data.countedCash || 0),
    cashDiff: Number(data.cashDiff || 0),
    closedAt: serverTimestamp(),
  });
  return "closed";
}

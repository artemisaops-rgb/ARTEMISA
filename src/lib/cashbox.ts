// src/lib/cashbox.ts
import type { Firestore, Timestamp as FSTimestamp } from "firebase/firestore";
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
import { getOrgId, toDateKey } from "@/services/firebase";

/** ===== Types ===== */
export type CashType = "in" | "out";

export type OpeningMeta = {
  exists: boolean;
  status: "open" | "closed" | "unknown";
  initialCash: number;
  tasksDone: string[];
};

/** ===== Config / Guardrails ===== */
export const MIN_DRAWER_CASH = 0; // ajusta si quieres un piso de efectivo (p. ej. 20000)

/** WhatsApp checklist obligatoria en apertura */
export function hasWppConfirmations(tasksDone: any): boolean {
  const arr: string[] = Array.isArray(tasksDone) ? tasksDone : [];
  return arr.includes("foto_wpp_sent") && arr.includes("foto_wpp_double");
}

/** YYYY-MM-DD (zona local del navegador/servidor) */
export function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Rango del día local [00:00, 24:00) en Firestore Timestamps */
export function dayRange(d = new Date()) {
  const fromDate = new Date(d);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + 1);
  return { from: Timestamp.fromDate(fromDate), to: Timestamp.fromDate(toDate) };
}

/** ID del doc de apertura para un usuario (YYYY-MM-DD_uid) */
export function openingDocIdForUser(uid: string, d = new Date()): string {
  return `${toDateKey(d)}_${uid}`;
}

/** ===== Apertura de caja ===== */
export async function openCaja(
  db: Firestore,
  params: {
    uid: string;
    initialCash: number;
    checklist?: string[];
    tasksDone: string[]; // debe incluir foto_wpp_sent y foto_wpp_double
    now?: Date;
  }
) {
  const { uid, initialCash, checklist = [], tasksDone, now } = params;
  if (!uid) throw new Error("Falta uid");
  if (!hasWppConfirmations(tasksDone)) {
    throw new Error("Faltan las 2 confirmaciones de WhatsApp.");
  }

  const id = openingDocIdForUser(uid, now);
  const ref = doc(collection(db, "openings"), id);
  const snap = await getDoc(ref);

  const base = {
    orgId: getOrgId(),
    userId: uid,
    // Unificar dateKey con el ID (usa el mismo helper de toda la app)
    dateKey: toDateKey(now),
    checklist,
    tasksDone,
    initialCash: Math.max(0, Number(initialCash || 0)),
    status: "open",
    updatedAt: serverTimestamp(),
  } as const;

  if (!snap.exists()) {
    await setDoc(ref, { ...base, createdAt: serverTimestamp() });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

/** Estado de apertura del usuario (hoy) */
export async function getOpeningMetaForUser(
  db: Firestore,
  uid: string,
  d = new Date()
): Promise<OpeningMeta> {
  if (!uid) return { exists: false, status: "unknown", initialCash: 0, tasksDone: [] };

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

/** ===== Movimientos de caja (in/out) ===== */
export async function addCashMovement(
  db: Firestore,
  params: {
    userId: string;
    type: CashType;
    amount: number;
    reason?: string;
    orderId?: string;
    at?: FSTimestamp; // opcional (para cargas históricas)
  }
) {
  const amount = Number(params.amount || 0);
  if (!params.userId) throw new Error("Falta userId");
  if (!(amount > 0)) throw new Error("El monto debe ser mayor a 0");
  if (params.type !== "in" && params.type !== "out") {
    throw new Error("Tipo inválido");
  }

  await addDoc(collection(db, "cashMovements"), {
    orgId: getOrgId(),
    dateKey: toDateKey(), // coherente con el resto de la app
    userId: params.userId,
    type: params.type,
    amount,
    reason: params.reason ? String(params.reason).slice(0, 120) : null,
    orderId: params.orderId || null,
    at: params.at || serverTimestamp(),
  });
}

/** ===== Proyección de caja del día ===== */
export async function getTodayCashProjection(
  db: Firestore
): Promise<{
  openingCash: number;
  cashSales: number;
  inTotal: number;
  outTotal: number;
  expectedCash: number;
}> {
  const { from, to } = dayRange();
  const ORG_ID = getOrgId();

  // Apertura (primera del día)
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
      if (typeof v?.initialCash === "number") openingCash = Number(v.initialCash || 0);
    });
  }

  // Ventas efectivo (delivered hoy) - anuladas efectivo (canceled hoy)
  let cashSales = 0;

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
      if (pm === "cash" && status === "delivered" && total > 0) cashSales += total;
    });
  }

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
      if (pm === "cash" && status === "canceled" && total > 0) cashSales -= total;
    });
  }

  // Movimientos de caja
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

/** ===== Cierre de caja (doc openings) ===== */
export async function closeOpeningForUser(
  db: Firestore,
  uid: string,
  data: { expectedCash: number; countedCash: number }
): Promise<"closed" | "no-opening"> {
  const id = openingDocIdForUser(uid);
  const ref = doc(collection(db, "openings"), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return "no-opening";

  const expected = Number(data.expectedCash || 0);
  const counted = Number(data.countedCash || 0);
  const cashDiff = counted - expected;

  // merge compatible con rules
  await setDoc(
    ref,
    {
      orgId: getOrgId(),
      status: "closed",
      expectedCash: expected,
      countedCash: counted,
      cashDiff,
      closedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return "closed";
}

/** ===== Guardrail: ¿viola mínimo de caja? ===== */
export function willViolateMinCash(
  currentExpectedCash: number,
  movementType: CashType,
  amount: number,
  min = MIN_DRAWER_CASH
): boolean {
  const amt = Number(amount || 0);
  if (movementType !== "out") return false;
  return currentExpectedCash - amt < Math.max(0, Number(min || 0));
}

/** ===== (Opcional) resumen diario — permitido sólo para owner por tus rules =====
 * Intenta escribir /dailySummary/{dateKey}. Si no hay permisos, ignora silenciosamente.
 */
export async function tryWriteDailySummary(
  db: Firestore,
  payload: {
    dateKey?: string;
    data: Record<string, any>;
  }
): Promise<"written" | "skipped"> {
  try {
    const id = payload.dateKey || toDateKey();
    await setDoc(
      doc(db, "dailySummary", id),
      { orgId: getOrgId(), ...payload.data, createdAt: serverTimestamp() },
      { merge: true }
    );
    return "written";
  } catch {
    // Puede fallar por permisos (owner-only); no bloqueamos el cierre.
    return "skipped";
  }
}

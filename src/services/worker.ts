import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';

const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Suscribe a los cambios del estado de apertura (openings) para el usuario hoy.
 */
export function subscribeToOpeningStatus(userId: string, callback: (status: "unknown" | "absent" | "open" | "closed") => void) {
  if (!userId) {
     callback("absent");
     return () => {};
  }
  const ref = doc(collection(db, "openings"), `${ymd()}_${userId}`);
  
  // onSnapshot inicial para mantener la reactividad si cambia
  const unsub = onSnapshot(ref, (s) => {
    if (!s.exists()) {
      callback("absent");
    } else {
      const v: any = s.data();
      callback(v?.status === "closed" ? "closed" : "open");
    }
  }, (err) => {
    console.error("subscribeToOpeningStatus", err);
    callback("absent");
  });

  return unsub;
}

/**
 * Suscribe al conteo de items con bajo stock.
 */
export function subscribeToLowStockCount(orgId: string, callback: (count: number) => void) {
  const qy = query(collection(db, "inventoryItems"), where("orgId", "==", orgId));
  return onSnapshot(qy, (snap) => {
    let n = 0;
    snap.forEach((d) => {
      const x: any = d.data();
      const stock = Number(x?.stock || 0);
      const min = x?.minStock != null ? Number(x.minStock) : Number(x.min || 0);
      if (!Number.isNaN(min) && stock <= min) n += 1;
    });
    callback(n);
  });
}

/**
 * Lee las tareas del turno de hoy (snapshot, una sola vez o suscripción? Tareas usa state local y luego guarda)
 * Para tareas.tsx, el componente carga al inicio y guarda al final.
 * Haremos una función de lectura simple y una de guardado.
 */
export async function getTodaysShiftTasks(userId: string) {
  const id = `${ymd()}_${userId}`;
  const ref = doc(db, "shiftTasks", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return (snap.data() as any)?.checks ?? {};
}

/**
 * Guarda las tareas del turno.
 */
export async function saveShiftTasks(orgId: string, userId: string, checks: Record<string, boolean>) {
  const dateKey = ymd();
  const id = `${dateKey}_${userId}`;
  const ref = doc(db, "shiftTasks", id);
  await setDoc(ref, {
    id,
    orgId,
    userId,
    checks,
    updatedAt: serverTimestamp(),
    dateKey,
  }, { merge: true });
}

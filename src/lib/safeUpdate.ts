import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

/** Quita undefined y NaN para evitar merges sucios */
export function scrub<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined) continue;
    if (typeof v === "number" && Number.isNaN(v)) continue;
    out[k] = v;
  }
  return out as T;
}

/** setDoc merge con updatedAt automático */
export async function safeUpdate(path: string, data: Record<string, any>) {
  const db = getFirestore();
  const payload = scrub({ ...data, updatedAt: serverTimestamp() });
  await setDoc(doc(db, path), payload, { merge: true });
}

export default safeUpdate;

// src/lib/safeUpdate.ts
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
/** Quita undefined y NaN para evitar merges sucios */
function scrub(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        if (v === undefined)
            continue;
        if (typeof v === "number" && Number.isNaN(v))
            continue;
        out[k] = v;
    }
    return out;
}
/**
 * Actualiza con merge + marca updatedAt.
 * Uso: await safeUpdate(`products/${id}`, { active: true })
 */
export async function safeUpdate(path, data) {
    const db = getFirestore();
    const payload = scrub({ ...data, updatedAt: serverTimestamp() });
    await setDoc(doc(db, path), payload, { merge: true });
}
export default safeUpdate;

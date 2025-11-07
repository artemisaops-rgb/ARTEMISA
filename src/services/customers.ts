import { auth, db, getOrgId } from "@/services/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Crea/actualiza /customers/{uid} sin `undefined` y con `orgId`.
 * Evita 400 por docId vacío y payload inválido.
 */
export async function ensureCustomerRecord(user = auth.currentUser) {
  const u = user ?? auth.currentUser;
  if (!u?.uid) return null;

  const orgId = String(getOrgId() || "artemisa");
  const ref = doc(db, "customers", u.uid);

  const safe = (v: any) => (v === undefined ? null : v);
  const base = {
    orgId,
    displayName: safe(u.displayName || null),
    email: safe(u.email || null),
    photoURL: safe(u.photoURL || null),
    phoneNumber: safe((u as any).phoneNumber || null),
    lastSeenAt: serverTimestamp(),
  };

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        ...base,
        createdAt: serverTimestamp(),
        marketingOptIn: false,
      },
      { merge: true }
    );
  } else {
    await setDoc(ref, base, { merge: true });
  }

  return ref.id;
}

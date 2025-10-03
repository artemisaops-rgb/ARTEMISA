// src/lib/memberships.ts
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

type Args = { uid: string; email?: string | null };

/**
 * Garantiza que el usuario tenga un doc de membresía dentro de la org actual.
 * Si no existe, lo crea con role="client" para que pase las reglas y pueda leer.
 * Si existe, actualiza email/updatedAt cuando haga falta.
 */
export async function ensureMemberOnLogin({ uid, email }: Args) {
  const orgId = getOrgId();
  const ref = doc(db, "orgs", orgId, "members", uid);

  try {
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(
        ref,
        {
          role: "client",
          email: email ?? null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    const cur = snap.data() || {};
    const needEmailUpdate = (email ?? null) !== (cur.email ?? null);
    const needRole = !cur.role;

    if (needEmailUpdate || needRole) {
      await setDoc(
        ref,
        {
          role: cur.role || "client",
          email: email ?? cur.email ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn("ensureMemberOnLogin:", e);
  }
}

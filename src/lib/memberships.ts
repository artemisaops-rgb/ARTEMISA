import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import type { DBRole } from "@/lib/roles";

type Args = { uid: string; email?: string | null; displayName?: string | null };

/**
 * Crea/actualiza la membresía del usuario al iniciar sesión.
 * - Lee settings/{orgId}.roleByEmail[email] para decidir el rol (si no, 'client').
 * - Guarda email y displayName en orgs/{orgId}/members/{uid}.
 */
export async function ensureMemberOnLogin({ uid, email, displayName }: Args) {
  if (!uid) return;

  const orgId = getOrgId();
  const ref = doc(db, "orgs", orgId, "members", uid);
  const snap = await getDoc(ref);

  const cleanEmail = (email || "").trim().toLowerCase();

  // 1) Allowlist de roles por email
  let desiredRole: DBRole | null = null;
  try {
    const st = await getDoc(doc(db, "settings", orgId));
    const map = (st.exists() ? (st.data() as any).roleByEmail : null) || {};
    if (cleanEmail && map[cleanEmail]) desiredRole = map[cleanEmail] as DBRole;
  } catch {
    // no-op
  }

  const fallbackRole: DBRole = "client";

  // 2) Crear o actualizar member
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        orgId,
        uid,
        role: (desiredRole || fallbackRole) as DBRole,
        email: cleanEmail || null,
        displayName: displayName || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const current = snap.data() as any;
  const patch: Record<string, any> = { updatedAt: serverTimestamp() };

  if ((current.email || null) !== (cleanEmail || null)) patch.email = cleanEmail || null;
  if ((current.displayName || null) !== (displayName || null)) patch.displayName = displayName || null;
  if (desiredRole && current.role !== desiredRole) patch.role = desiredRole;

  if (Object.keys(patch).length > 0) {
    await updateDoc(ref, patch);
  }
}

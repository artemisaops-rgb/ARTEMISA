// src/lib/memberships.ts
import {
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import type { DBRole } from "@/lib/roles";

export type Membership = {
  orgId: string;
  role: DBRole;              // 'owner' | 'worker' | 'client'
  uid: string;
  email?: string | null;
  displayName?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

/** Escucha SOLO la membresía anidada: /orgs/{orgId}/members/{uid} */
export function listenMyMembership(
  uid: string,
  cb: (m: Membership | null) => void
): Unsubscribe {
  const orgId = getOrgId();
  const ref = doc(db, "orgs", orgId, "members", uid);
  return onSnapshot(
    ref,
    (s) => cb(s.exists() ? ({ uid, ...(s.data() as any) } as Membership) : null),
    () => cb(null)
  );
}

export async function getMyMembership(uid: string): Promise<Membership | null> {
  const orgId = getOrgId();
  const snap = await getDoc(doc(db, "orgs", orgId, "members", uid));
  return snap.exists() ? ({ uid, ...(snap.data() as any) } as Membership) : null;
}

/** Lee el rol deseado por allowlist (orgSettings.roleByEmail). Fallback a settings/{orgId} por legacy. */
async function readDesiredRoleByEmail(orgId: string, email: string | null | undefined): Promise<DBRole | null> {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return null;

  // 1) Colección nueva: orgSettings/{orgId}
  try {
    const st = await getDoc(doc(db, "orgSettings", orgId));
    const map = (st.exists() ? (st.data() as any).roleByEmail : null) || {};
    if (map && map[clean]) return map[clean] as DBRole;
  } catch {
    // ignore permission-denied (aún no hay membresía) o inexistente
  }

  // 2) Legacy: settings/{orgId}
  try {
    const stLegacy = await getDoc(doc(db, "settings", orgId));
    const map = (stLegacy.exists() ? (stLegacy.data() as any).roleByEmail : null) || {};
    if (map && map[clean]) return map[clean] as DBRole;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Crea/actualiza la membresía del usuario al iniciar sesión.
 * Solo escribe en /orgs/{orgId}/members/{uid}.
 */
export async function ensureMemberOnLogin({
  uid,
  email,
  displayName,
}: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}) {
  if (!uid) return;

  const orgId = getOrgId();
  const ref = doc(db, "orgs", orgId, "members", uid);
  const cleanEmail = (email || "").trim().toLowerCase();

  // Allowlist por email (puede fallar por permisos al no tener aún membresía; es OK)
  const desiredRole = await readDesiredRoleByEmail(orgId, cleanEmail);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        orgId,
        uid,
        role: (desiredRole || "client") as DBRole,
        email: cleanEmail || null,
        displayName: displayName || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const cur = snap.data() as any;
  const patch: Record<string, any> = { updatedAt: serverTimestamp() };

  if ((cur.email || null) !== (cleanEmail || null)) patch.email = cleanEmail || null;
  if ((cur.displayName || null) !== (displayName || null)) patch.displayName = displayName || null;
  if (desiredRole && cur.role !== desiredRole) patch.role = desiredRole;

  await updateDoc(ref, patch);
}

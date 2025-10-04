import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import type { DBRole } from "@/lib/roles";

type UseRoleOut = { role: DBRole | null; loading: boolean };

export function useRole(): UseRoleOut {
  const [role, setRole] = useState<DBRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = (window as any)?.__firebaseAuthUid || null;
    setLoading(true);
    const orgId = getOrgId();
    if (!orgId || !uid) {
      setRole(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, "orgs", orgId, "members", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const r = (snap.exists() ? (snap.data() as any)?.role : null) as DBRole | null;
        setRole(r ?? null);
        setLoading(false);
      },
      () => {
        setRole(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { role, loading };
}
export default useRole;

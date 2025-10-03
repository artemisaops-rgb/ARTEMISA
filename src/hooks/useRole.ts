import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<"owner"|"worker"|"client"|null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) { setRole(null); setLoading(false); return; }
    const ref = doc(db, "orgs", getOrgId(), "members", user.uid);
    const unsub = onSnapshot(ref, s => {
      const r = (s.exists() ? (s.data() as any).role : null) as any;
      setRole(r ?? "client");
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);
  return { role, loading };
}

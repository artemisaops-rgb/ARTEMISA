import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import type { DBRole } from "@/lib/roles";

type Args = { uid: string; email?: string | null };

export async function ensureMemberOnLogin({ uid, email }: Args) {
  const orgId = getOrgId();
  const ref = doc(db, "orgs", orgId, "members", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const role: DBRole = email === "artemisa.ops@gmail.com" ? "owner" : "worker";
    await setDoc(ref, { role, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

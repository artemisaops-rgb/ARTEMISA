// src/lib/safeUpdate.ts
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { scrub } from "./safe";

/** setDoc merge con updatedAt automático */
export async function safeUpdate(path: string, data: Record<string, any>) {
  const db = getFirestore();
  const payload = scrub({ ...data, updatedAt: serverTimestamp() });
  await setDoc(doc(db, path), payload, { merge: true });
}

export default safeUpdate;

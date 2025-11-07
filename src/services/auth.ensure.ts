import { getAuth, browserLocalPersistence, setPersistence, signInAnonymously } from "firebase/auth";
export async function ensureAuth() {
  const auth = getAuth();
  await setPersistence(auth, browserLocalPersistence);
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
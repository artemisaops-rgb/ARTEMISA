import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

/**
 * Ensures Firebase Auth is initialized with local persistence.
 * Returns the current user if logged in, or null if not.
 * Note: We removed anonymous signin to avoid auth/admin-restricted-operation errors.
 */
export async function ensureAuth() {
  const auth = getAuth();
  await setPersistence(auth, browserLocalPersistence);
  return auth.currentUser;
}
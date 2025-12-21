import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { auth, db } from "@/services/firebase";
import { ensureMemberOnLogin } from "@/lib/memberships";
import { ensureCustomerDoc } from "@/lib/customers";

export type LoginGoogleOpts = {
  preferredEmail?: string;
  forceSelect?: boolean;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  loginGoogle: (opts?: LoginGoogleOpts) => Promise<void>;
  switchGoogleAccount: (loginHint?: string) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // MOCK USER FOR TESTING
  const MOCK_USER = {
    uid: "mock-owner-uid",
    email: "mock@artemisa.app",
    displayName: "Mock Owner",
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: "",
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => "mock-token",
    getIdTokenResult: async () => ({
      token: "mock-token",
      signInProvider: "custom",
      claims: {},
      authTime: Date.now().toString(),
      issuedAtTime: Date.now().toString(),
      expirationTime: (Date.now() + 3600000).toString(),
    }),
    reload: async () => {},
    toJSON: () => ({}),
    phoneNumber: null,
    photoURL: null,
    providerId: "firebase",
  } as unknown as User;

  const [user, setUser] = useState<User | null>(MOCK_USER); // Start with mock user
  const [loading, setLoading] = useState(false); // No loading needed

  useEffect(() => {
    // setPersistence(auth, browserSessionPersistence).catch(() => {});
    // const unsub = onAuthStateChanged(auth, (u) => {
    //   setUser(u ?? null);
    //   setLoading(false);
    //   (window as any).__firebaseAuthUid = u?.uid ?? null; // para hooks que lo leen

    //   if (u) {
    //     // ⬇️ Aquí sincronizamos membresía (con displayName) y perfil de cliente
    //     Promise.allSettled([
    //       ensureMemberOnLogin({
    //         uid: u.uid,
    //         email: u.email,
    //         displayName: u.displayName,
    //       }),
    //       ensureCustomerDoc(db, u.uid, {
    //         email: u.email ?? null,
    //         displayName: u.displayName ?? null,
    //         photoURL: u.photoURL ?? null,
    //       }),
    //     ]).catch(() => {});
    //   }
    // });
    // return () => unsub();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,

      async loginGoogle(opts?: LoginGoogleOpts) {
        const provider = new GoogleAuthProvider();
        const params: Record<string, string> = {};
        if (opts?.forceSelect) params.prompt = "select_account";
        if (opts?.preferredEmail) params.login_hint = opts.preferredEmail;
        provider.setCustomParameters(params);

        try {
          await signInWithPopup(auth, provider);
        } catch {
          await signInWithRedirect(auth, provider);
        }
      },

      async switchGoogleAccount(loginHint?: string) {
        try { await signOut(auth); } catch {}
        const provider = new GoogleAuthProvider();
        const params: Record<string, string> = { prompt: "select_account" };
        if (loginHint) params.login_hint = loginHint;
        provider.setCustomParameters(params);
        await signInWithRedirect(auth, provider);
      },

      async loginEmail(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password);
      },

      async logout() {
        await signOut(auth);
      },
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return v;
}

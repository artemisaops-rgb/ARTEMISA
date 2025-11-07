// src/services/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, onIdTokenChanged,
  connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

/** Fallback del proyecto (artemisa-f65f0) */
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCnIt7Q2qoFg0TYfNBel_OyMbriuDtvU7s",
  authDomain: "artemisa-f65f0.firebaseapp.com",
  projectId: "artemisa-f65f0",
  storageBucket: "artemisa-f65f0.appspot.com",
  messagingSenderId: "1074389759165",
  appId: "1:1074389759165:web:6f836d4eb1105f93b3b3d4",
  measurementId: "G-QFRSGHKRPN",
};

/** Env-first con fallback seguro */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? DEFAULT_FIREBASE_CONFIG.measurementId,
};

export const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

// ---- DEV: desregistrar SW que puede romper HMR / streams en localhost ----
(function maybeUnregisterSWInDev() {
  try {
    if (
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      (location.hostname === "localhost" || location.hostname.startsWith("127."))
    ) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          if (/\/sw(\.js)?($|\?)/.test(url) || /workbox/i.test(url)) r.unregister().catch(() => {});
        });
      });
    }
  } catch {}
})();

// ---- Auth ----
export const auth = getAuth(app);
auth.useDeviceLanguage?.();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ---- Firestore + Storage ----
let _db: ReturnType<typeof getFirestore>;
try {
  if (typeof window !== "undefined") {
    const host = (typeof location !== "undefined" && location.hostname) || "";
    const isLocal =
      host === "localhost" ||
      host.startsWith("127.") ||
      host.startsWith("192.168.") ||
      host.endsWith(".local");

    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
      ...(isLocal
        ? { experimentalForceLongPolling: true, useFetchStreams: false }
        : { experimentalForceLongPolling: false }),
      ignoreUndefinedProperties: true,
    } as any);
  } else {
    _db = getFirestore(app);
  }
} catch {
  _db = getFirestore(app);
}
export const db = _db;

export const storage = getStorage(app);

/** Compat: no-op para persistencia offline (ya usamos localCache). */
export function ensureOfflinePersistence(): Promise<boolean> {
  return Promise.resolve(true);
}

/** Conexión a emuladores (opcional) */
(function maybeConnectEmulators() {
  try {
    const use = String(import.meta.env.VITE_USE_FIREBASE_EMULATORS || "").trim() === "1";
    if (!use) return;
    const host = import.meta.env.VITE_EMULATOR_HOST || "localhost";
    const authPort = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099);
    const fsPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    const stPort = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199);

    // Importante: conectar antes de cualquier operación I/O
    connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, fsPort);
    connectStorageEmulator(storage, host, stPort);
    if (typeof window !== "undefined") console.info("[Firebase] Emuladores conectados");
  } catch (e) {
    console.warn("[Firebase] No se pudieron conectar emuladores:", e);
  }
})();

// ---- Monitoring (Analytics + Performance) ----
let _analytics: any = null;
let _perf: unknown = null;

export async function initMonitoring() {
  if (typeof window === "undefined") return { analytics: null, perf: null };
  try {
    const a = await import("firebase/analytics");
    const ok = (await (a.isSupported?.() ?? Promise.resolve(true))) && !_analytics;
    if (ok) _analytics = a.getAnalytics(app);
  } catch {}
  try {
    const p = await import("firebase/performance");
    if (!_perf) _perf = p.getPerformance(app);
  } catch {}
  return { analytics: _analytics, perf: _perf };
}

export async function gaLog(eventName: string, params?: Record<string, any>) {
  try {
    if (!_analytics) await initMonitoring();
    if (_analytics) {
      const a = await import("firebase/analytics");
      a.logEvent(_analytics, eventName as any, params);
    }
  } catch {}
}

// ---- Organización (multi-tenant) ----
export function getOrgId(): string {
  const envOrg = (import.meta as any)?.env?.VITE_ORG_ID;
  const lsOrg =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("orgId") ?? undefined
      : undefined;
  return String((lsOrg ?? envOrg ?? "artemisa")).trim() || "artemisa";
}

export function setOrgId(orgId: string) {
  try { localStorage.setItem("orgId", String(orgId)); } catch {}
}

export function getCurrentRole(): "owner" | "worker" | "client" | string {
  try { return (localStorage.getItem("myRole") as any) || "client"; } catch { return "client"; }
}

/** Lee el orgId del token actual (soporta orgId|org|org_id). */
export async function getClaimedOrgId(): Promise<string | null> {
  const u = auth.currentUser; if (!u) return null;
  try {
    const tok = await u.getIdTokenResult(true);
    const c: any = tok.claims || {};
    const org = (c.orgId ?? c.org ?? c.org_id ?? null);
    return org ? String(org) : null;
  } catch { return null; }
}

/** Valida que el claim del token coincida con orgId (por defecto, con getOrgId()). */
export async function hasOrgClaimMatch(targetOrg?: string): Promise<boolean> {
  const org = targetOrg ?? getOrgId();
  const claimed = await getClaimedOrgId();
  return !!org && !!claimed && org === claimed;
}

/** Suscripción a cambios de claims (evento de alto nivel). */
export function onClaimsUpdated(handler: (e: { orgId?: string; role?: string }) => void): () => void {
  const cb = (ev: Event) => {
    try {
      const detail = (ev as CustomEvent).detail || {};
      handler(detail);
    } catch {}
  };
  window.addEventListener("claims:updated", cb as EventListener);
  return () => window.removeEventListener("claims:updated", cb as EventListener);
}

/** Sincroniza claims → localStorage (acepta orgId|org|org_id y role|app_role) y emite claims:updated */
export function startAuthClaimsSync() {
  onIdTokenChanged(auth, async (user) => {
    if (!user) return;
    try {
      const tok = await user.getIdTokenResult(true);
      const c: any = tok.claims || {};
      const org = String(c.orgId ?? c.org ?? c.org_id ?? "").trim();
      const role = String(c.role ?? c.app_role ?? "").trim();

      if (org) setOrgId(org);
      if (role) {
        try { localStorage.setItem("myRole", role); } catch {}
        document?.documentElement?.setAttribute?.("data-role", role);
      }

      // Notificar a la app que hay claims frescos
      try {
        const ev = new CustomEvent("claims:updated", { detail: { orgId: org || undefined, role: role || undefined } });
        window.dispatchEvent(ev);
      } catch {}
    } catch {}
  });
}

// ---- Fechas locales coherentes ----
export const TZ = import.meta.env.VITE_TZ || "America/Bogota";
export function toDateKey(d = new Date(), tz: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

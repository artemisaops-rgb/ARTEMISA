// src/services/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, onIdTokenChanged } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

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

// ---- DEV: desregistrar SW que rompa el HMR de Vite en localhost ----
(function maybeUnregisterSWInDev() {
  try {
    if (
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      location.hostname === "localhost"
    ) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => {
          // Si es un sw de nuestra app (sw.js o workbox) lo desregistramos en dev
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          if (/\/sw(\.js)?($|\?)/.test(url) || /workbox/i.test(url)) {
            r.unregister().catch(() => {});
          }
        });
      });
    }
  } catch {
    // no-op
  }
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
    const onLocalhost = typeof location !== "undefined" && location.hostname === "localhost";

    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      // Evita websockets en ambientes problemáticos (VPN / proxys / SW viejos)
      experimentalAutoDetectLongPolling: true,
      ...(onLocalhost ? { experimentalForceLongPolling: true } : {}),
      ignoreUndefinedProperties: true,
    });
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

/** Permite forzar/guardar la org en localStorage (útil en debug) */
export function setOrgId(orgId: string) {
  try { localStorage.setItem("orgId", String(orgId)); } catch {}
}

/** Rol actual (fallback worker si no hay claim) */
export function getCurrentRole(): "owner" | "worker" | "client" | string {
  try { return (localStorage.getItem("myRole") as any) || "worker"; } catch { return "worker"; }
}

/** Sincroniza orgId y role desde custom claims (orgId/org, role/app_role) */
export function startAuthClaimsSync() {
  onIdTokenChanged(auth, async (user) => {
    if (!user) return;
    try {
      const tok = await user.getIdTokenResult(true);
      const c: any = tok.claims || {};
      const org = String(c.orgId || c.org || "").trim();
      const role = String(c.role || c.app_role || "").trim();

      if (org) setOrgId(org);
      if (role) {
        try { localStorage.setItem("myRole", role); } catch {}
        // útil para los estilos por rol en index.css
        document?.documentElement?.setAttribute?.("data-role", role);
      }
    } catch {
      // no-op
    }
  });
}

// ---- Fechas locales coherentes ----
export const TZ = import.meta.env.VITE_TZ || "America/Bogota";
/** YYYY-MM-DD en zona TZ (por defecto America/Bogota) */
export function toDateKey(d = new Date(), tz: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

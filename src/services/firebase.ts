// src/services/firebase.ts — REEMPLAZA COMPLETO
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
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
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? DEFAULT_FIREBASE_CONFIG.measurementId,
};

export const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

// ---- Auth ----
export const auth = getAuth(app);
auth.useDeviceLanguage?.();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ---- Firestore (caché persistente, multi-pestaña) + Storage ----
let _db: ReturnType<typeof getFirestore>;
try {
  if (typeof window !== "undefined") {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } else {
    _db = getFirestore(app);
  }
} catch {
  // Si ya estaba inicializado por otro lado, obtenlo sin reconfigurar
  _db = getFirestore(app);
}
export const db = _db;

export const storage = getStorage(app);

/** Compat: ya no necesitamos enableIndexedDbPersistence; dejamos un no-op. */
export function ensureOfflinePersistence(): Promise<boolean> {
  return Promise.resolve(true);
}

// ---- Monitoring (Analytics + Performance) con imports dinámicos ----
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
    typeof localStorage !== "undefined" ? localStorage.getItem("orgId") ?? undefined : undefined;
  return String((lsOrg ?? envOrg ?? "default")).trim() || "default";
}

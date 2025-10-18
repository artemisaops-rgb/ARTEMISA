// src/lib/policy.ts
import { doc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

export type OrgPolicy = {
  /** Caja mínima operativa (COP) */
  cashMin: number;
  /** Límite de cambio de precio semanal por SKU (0.05 = 5%) */
  priceChangeCapPct?: number;
  /** Tope semanal de compras (COP) */
  weeklyPurchaseCap?: number;
};

const DEFAULTS: OrgPolicy = {
  cashMin: 0,
  priceChangeCapPct: 0.05,
  weeklyPurchaseCap: undefined,
};

// ---------- helpers ----------
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function normalize(v: any): OrgPolicy {
  const cashMin = Math.max(0, Math.floor(Number(v?.cashMin ?? DEFAULTS.cashMin)));
  const priceChangeCapPct =
    typeof v?.priceChangeCapPct === "number"
      ? clamp(v.priceChangeCapPct, 0, 0.5) // 0%..50%
      : DEFAULTS.priceChangeCapPct;

  const weeklyPurchaseCap =
    typeof v?.weeklyPurchaseCap === "number" && Number.isFinite(v.weeklyPurchaseCap)
      ? Math.max(0, Math.floor(v.weeklyPurchaseCap))
      : DEFAULTS.weeklyPurchaseCap;

  return { cashMin, priceChangeCapPct, weeklyPurchaseCap };
}

// ---------- cache en memoria (suave) ----------
const CACHE_MS = 60_000; // 1 min
let _cache:
  | { orgId: string; at: number; data: OrgPolicy }
  | null = null;

export function clearPolicyCache() {
  _cache = null;
}

// ---------- API ----------
export async function getPolicy(force = false): Promise<OrgPolicy> {
  const orgId = getOrgId();

  if (!force && _cache && _cache.orgId === orgId && Date.now() - _cache.at < CACHE_MS) {
    return _cache.data;
  }

  try {
    const ref = doc(db, "orgSettings", orgId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const policy = normalize(data);
    _cache = { orgId, at: Date.now(), data: policy };
    return policy;
  } catch {
    return DEFAULTS;
  }
}

/** Atajo: sólo el mínimo de caja actual. */
export async function getCashMin(): Promise<number> {
  const p = await getPolicy();
  return p.cashMin;
}

/** Suscribirse a cambios de la política de la org. Actualiza la caché. */
export function onPolicyChange(cb: (p: OrgPolicy) => void): Unsubscribe {
  const orgId = getOrgId();
  const ref = doc(db, "orgSettings", orgId);
  return onSnapshot(ref, (snap) => {
    const p = normalize(snap.exists() ? snap.data() : {});
    _cache = { orgId, at: Date.now(), data: p };
    cb(p);
  });
}

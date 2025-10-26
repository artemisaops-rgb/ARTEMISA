// src/utils/firestoreSafe.ts
/** Convierte a número finito; si no, usa fallback (0 por defecto). */
export function safeNumber(n: any, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * scrub(obj): clona el objeto:
 * - reemplaza undefined -> null (Firestore no acepta undefined)
 * - convierte NaN/Infinity -> 0
 * - mantiene objetos especiales (p.ej. serverTimestamp()) tal cual
 */
export function scrub<T = any>(obj: T): T {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((v: any) => scrub(v)) as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj as any)) {
    const v = (obj as any)[k];
    if (v === undefined) { out[k] = null; continue; }
    if (typeof v === "number" && !Number.isFinite(v)) { out[k] = 0; continue; }
    if (v && typeof v === "object") { out[k] = scrub(v); continue; }
    out[k] = v;
  }
  return out as T;
}

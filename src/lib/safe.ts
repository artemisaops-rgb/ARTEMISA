export function scrub<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined || (typeof v === "number" && Number.isNaN(v))) continue;
    out[k] = v;
  }
  return out as T;
}





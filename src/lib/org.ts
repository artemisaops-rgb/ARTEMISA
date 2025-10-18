// src/lib/org.ts
// Compat: evita duplicados. Usa SIEMPRE la fuente única en services/firebase.
export { getOrgId } from "@/services/firebase";

// (opcional) helper para cambiarla en runtime desde un admin
export function setOrgId(org: string) {
  try {
    localStorage.setItem("orgId", String(org || "artemisa"));
  } catch {}
}

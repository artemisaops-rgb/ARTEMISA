// src/lib/roles.ts

/** Roles de UI (etiquetas visibles) */
export type UIRole = "admin" | "trabajador" | "cliente";

/** Roles en BD/rules y permisos */
export type DBRole  = "owner" | "worker" | "client";

/** Alias útil para guards/rutas (en el código solemos usar Role como DBRole) */
export type Role = DBRole;

/** Mapeos UI ⇄ DB */
export const uiToDb: Record<UIRole, DBRole> = {
  admin: "owner",
  trabajador: "worker",
  cliente: "client",
};

export const dbToUi: Record<DBRole, UIRole> = {
  owner: "admin",
  worker: "trabajador",
  client: "cliente",
};

/** Validadores/normalizadores */
export const isDbRole = (r: any): r is DBRole =>
  r === "owner" || r === "worker" || r === "client";

/** Normaliza strings arbitrarios a DBRole seguro (fallback: client) */
export function normalizeDbRole(role?: string | null): DBRole {
  const r = String(role || "").toLowerCase();
  if (r === "owner" || r === "worker" || r === "client") return r;
  // tolerancia a sinónimos
  if (r === "admin") return "owner";
  if (r === "trabajador") return "worker";
  if (r === "cliente") return "client";
  return "client";
}

/** Atajos semánticos */
export const isOwner = (r: DBRole) => r === "owner";
export const isWorker = (r: DBRole) => r === "worker";
export const isClient = (r: DBRole) => r === "client";

/**
 * Helper opcional para UI: describe si un owner en modo "control" puede operar como worker.
 * (Lo usamos en componentes, aunque la regla final la aplica RoleGuard.)
 */
export function ownerEmulaWorker(ownerMode?: "monitor" | "control" | null) {
  return ownerMode === "control";
}

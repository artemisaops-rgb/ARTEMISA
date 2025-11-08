/**
 * Sistema de impersonación de roles para desarrollo
 * Solo activo en modo DEV (import.meta.env.DEV)
 * Permite cambiar de rol sin crear múltiples cuentas
 */

export type UserRole = "worker" | "client" | "owner" | "admin";

/**
 * Override de rol para desarrollo
 * Lee de localStorage la clave DEV_FORCE_ROLE
 * Solo aplica en modo desarrollo
 */
export function devOverrideRole(realRole: string | undefined): string | undefined {
  // Solo en desarrollo
  if (!import.meta.env.DEV) {
    return realRole;
  }

  // Intentar leer del localStorage
  if (typeof localStorage === "undefined") {
    return realRole;
  }

  const devRole = localStorage.getItem("DEV_FORCE_ROLE");
  
  // Si hay un rol forzado en dev, usarlo
  if (devRole && ["worker", "client", "owner", "admin"].includes(devRole)) {
    console.log(`[DEV] Rol forzado: ${devRole} (real: ${realRole || "ninguno"})`);
    return devRole;
  }

  return realRole;
}

/**
 * Establece el rol de desarrollo
 * Solo funciona en modo DEV
 */
export function setDevRole(role: UserRole | null): void {
  if (!import.meta.env.DEV) {
    console.warn("[DEV] setDevRole solo funciona en desarrollo");
    return;
  }

  if (typeof localStorage === "undefined") {
    return;
  }

  if (role === null) {
    localStorage.removeItem("DEV_FORCE_ROLE");
    console.log("[DEV] Rol de desarrollo eliminado");
  } else {
    localStorage.setItem("DEV_FORCE_ROLE", role);
    console.log(`[DEV] Rol de desarrollo establecido: ${role}`);
  }

  // Recargar la página para aplicar el cambio
  window.location.reload();
}

/**
 * Obtiene el rol de desarrollo actual
 */
export function getDevRole(): UserRole | null {
  if (!import.meta.env.DEV || typeof localStorage === "undefined") {
    return null;
  }

  const role = localStorage.getItem("DEV_FORCE_ROLE");
  return role as UserRole | null;
}

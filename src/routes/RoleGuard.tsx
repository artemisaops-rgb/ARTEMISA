// src/routes/RoleGuard.tsx
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import type { Role } from "@/types";

/**
 * Reglas:
 * - allow === ["owner"] → Owner permitido (monitor o control).
 * - allow incluye "worker" → worker real u owner en **modo control**.
 * - allow incluye "client" → cliente real u owner simulando cliente.
 */
export default function RoleGuard({
  allow,
  redirectTo = "/menu",
  children,
}: {
  allow: Role[];
  redirectTo?: string;
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { role, realRole, loading } = useRole(user?.uid);
  const { uiRole } = usePreviewRole(); // solo para simular cliente
  const { mode } = useOwnerMode();

  if (!user) return <Navigate to="/login" replace />;
  if (loading) return null;

  const allowSet = new Set<Role>(allow);

  const isOwnerTotal = realRole === "owner" && mode === "control";

  // 1) Owner-only (monitor o control)
  if (allowSet.has("owner") && realRole === "owner") {
    return children ? <>{children}</> : <Outlet />;
  }

  // 2) Worker: worker real u owner en control
  if (allowSet.has("worker")) {
    if (role === "worker" || isOwnerTotal) {
      return children ? <>{children}</> : <Outlet />;
    }
    // seguimos por si también permite client
  }

  // 3) Client: cliente real u owner simulando cliente (toggle de Vista)
  if (allowSet.has("client")) {
    if (role === "client" || (realRole === "owner" && uiRole === "client")) {
      return children ? <>{children}</> : <Outlet />;
    }
  }

  // 4) Match directo
  if (allowSet.has(role)) {
    return children ? <>{children}</> : <Outlet />;
  }

  return <Navigate to={redirectTo} replace />;
}

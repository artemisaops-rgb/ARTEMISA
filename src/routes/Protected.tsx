// src/routes/Protected.tsx
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
import { ensureAuth } from "@/services/auth.ensure";
import { ensureCustomerRecord } from "@/services/customers";
import { ensureMemberOnLogin } from "@/lib/memberships";
import { useRole } from "@/hooks/useRole";

export default function Protected() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  // 👈 Llamar SIEMPRE los hooks al inicio (evita "Rendered more hooks…")
  const { role, loading: roleLoading } = useRole(user?.uid);

  // Garantiza auth una sola vez
  const didEnsureRef = useRef(false);
  useEffect(() => {
    if (!didEnsureRef.current) {
      didEnsureRef.current = true;
      ensureAuth().catch(() => {});
    }
  }, []);

  // Sincroniza ficha cliente + membresía al cambiar de usuario
  const lastUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (user?.uid && lastUidRef.current !== user.uid) {
      lastUidRef.current = user.uid;
      Promise.allSettled([
        ensureCustomerRecord(user),
        ensureMemberOnLogin({
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        }),
      ]).catch(() => {});
    }
  }, [user?.uid, user?.email, user?.displayName]);

  // Espera auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando…
      </div>
    );
  }

  // Redirección a login si no hay sesión
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;

  // Clientes no deben caer en /menu como home
  if (!roleLoading) {
    const p = loc.pathname;
    if (role === "client" && (p === "/menu" || p === "/")) {
      return <Navigate to="/start" replace />;
    }
  }

  return <Outlet />;
}

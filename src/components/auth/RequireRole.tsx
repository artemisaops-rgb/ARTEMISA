import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function RequireRole({ role, children }: { role: "worker" | "admin" | "client"; children: React.ReactNode }) {
  const { user, role: userRole, loading } = useAuth();
  if (loading) return <div className="min-h-dvh grid place-items-center">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (userRole !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

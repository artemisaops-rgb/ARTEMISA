import { Navigate, Outlet } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
type R = "owner"|"worker"|"client";
export default function RoleGuard({ allow }: { allow: R[] }) {
  const { role, loading } = useRole();
  if (loading) return null;
  if (!role) return <Navigate to="/login" replace />;
  return allow.includes(role) ? <Outlet/> : <Navigate to="/menu" replace />;
}

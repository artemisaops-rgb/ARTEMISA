import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";

export default function Protected() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando???</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }

  return <Outlet />;
}

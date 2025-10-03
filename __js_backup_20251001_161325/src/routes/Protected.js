import { jsx as _jsx } from "react/jsx-runtime";
// src/routes/Protected.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
export default function Protected() {
    const { user, loading } = useAuth();
    const loc = useLocation();
    // Mientras verificamos sesión, muestra algo (evita “pantalla blanca”)
    if (loading) {
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center text-gray-500", children: "Cargando\u2026" }));
    }
    // Si no hay usuario, manda a login y recuerda a dónde quería ir
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: loc } });
    }
    // ¡Importante! Aquí se renderizan las páginas hijas
    return _jsx(Outlet, {});
}

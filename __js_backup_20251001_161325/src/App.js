import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
// Páginas
import Menu from "@/pages/Menu";
import Carrito from "@/pages/Carrito";
import Bodega from "@/pages/Bodega";
import Productos from "@/pages/Productos";
import Ventas from "@/pages/Ventas";
import Apertura from "@/pages/Apertura";
import Cierre from "@/pages/Cierre";
import Compras from "@/pages/Compras";
import Horarios from "@/pages/Horarios";
import Estadisticas from "@/pages/Estadisticas";
import AdminSeed from "@/pages/AdminSeed";
import DevSeed from "@/pages/DevSeed";
import Exportes from "@/pages/Exportes";
import Bootstrap from "@/pages/Bootstrap";
import Login from "@/pages/Login";
import Mas from "@/pages/Mas";
import Caja from "@/pages/Caja";
// Rutas/Layouts
import Protected from "@/routes/Protected";
import NavBar from "@/components/NavBar";
export default function App() {
    return (_jsxs("div", { className: "min-h-screen bg-slate-50", children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/menu", replace: true }) }), _jsxs(Route, { element: _jsx(Protected, {}), children: [_jsx(Route, { path: "/menu", element: _jsx(Menu, {}) }), _jsx(Route, { path: "/carrito", element: _jsx(Carrito, {}) }), _jsx(Route, { path: "/bodega", element: _jsx(Bodega, {}) }), _jsx(Route, { path: "/productos", element: _jsx(Productos, {}) }), _jsx(Route, { path: "/ventas", element: _jsx(Ventas, {}) }), _jsx(Route, { path: "/apertura", element: _jsx(Apertura, {}) }), _jsx(Route, { path: "/cierre", element: _jsx(Cierre, {}) }), _jsx(Route, { path: "/compras", element: _jsx(Compras, {}) }), _jsx(Route, { path: "/horarios", element: _jsx(Horarios, {}) }), _jsx(Route, { path: "/estadisticas", element: _jsx(Estadisticas, {}) }), _jsx(Route, { path: "/stats", element: _jsx(Navigate, { to: "/estadisticas", replace: true }) }), _jsx(Route, { path: "/admin-seed", element: _jsx(AdminSeed, {}) }), _jsx(Route, { path: "/dev-seed", element: _jsx(DevSeed, {}) }), _jsx(Route, { path: "/exportes", element: _jsx(Exportes, {}) }), _jsx(Route, { path: "/bootstrap", element: _jsx(Bootstrap, {}) }), _jsx(Route, { path: "/mas", element: _jsx(Mas, {}) }), _jsx(Route, { path: "/caja", element: _jsx(Caja, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/menu", replace: true }) })] }), _jsx(NavBar, {})] }));
}

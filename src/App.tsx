import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Menu from "@/pages/Menu";
import Carrito from "@/pages/Carrito";
import Bodega from "@/pages/Bodega";
import Productos from "@/pages/Productos";
import Ventas from "@/pages/Ventas";
import Apertura from "@/pages/Apertura";
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
import Clientes from "@/pages/Clientes";
import ClienteHome from "@/pages/ClienteHome";

import Privacidad from "@/pages/legal/Privacidad";
import Terminos from "@/pages/legal/Terminos";

import Protected from "@/routes/Protected";
import RoleGuard from "@/routes/RoleGuard";
import NavBar from "@/components/NavBar";

function Shell() {
  return (
    <>
      <Outlet />
      <NavBar />
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        {/* Públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/legal/privacidad" element={<Privacidad />} />
        <Route path="/legal/terminos" element={<Terminos />} />
        <Route path="/" element={<Navigate to="/menu" replace />} />

        {/* Protegidas */}
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            {/* Cliente o Staff */}
            <Route element={<RoleGuard allow={["client","worker","owner"]} />}>
              <Route path="/menu" element={<Menu />} />
              <Route path="/carrito" element={<Carrito />} />
              <Route path="/mas" element={<Mas />} />
              <Route path="/cliente" element={<ClienteHome />} />
            </Route>

            {/* Trabajador/Admin */}
            <Route element={<RoleGuard allow={["worker","owner"]} />}>
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/bodega" element={<Bodega />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/horarios" element={<Horarios />} />
              <Route path="/apertura" element={<Apertura />} />
              <Route path="/caja" element={<Caja />} />
            </Route>

            {/* Solo Admin */}
            <Route element={<RoleGuard allow={["owner"]} />}>
              <Route path="/estadisticas" element={<Estadisticas />} />
              <Route path="/exportes" element={<Exportes />} />
              <Route path="/bootstrap" element={<Bootstrap />} />
              <Route path="/admin-seed" element={<AdminSeed />} />
              <Route path="/dev-seed" element={<DevSeed />} />
            </Route>

            {/* Compatibilidad */}
            <Route path="/cierre" element={<Navigate to="/caja" replace />} />
            <Route path="/stats" element={<Navigate to="/estadisticas" replace />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </div>
  );
}

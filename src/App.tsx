// src/App.tsx
import React, { Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

/* Páginas (carga directa) */
import ClientStart from "@/pages/ClientStart";
import Menu from "@/pages/Menu";
import Carrito from "@/pages/Carrito";
import Bodega from "@/pages/Bodega";
import Productos from "@/pages/Productos";
import Ventas from "@/pages/Ventas";
import Apertura from "@/pages/Apertura";
import Compras from "@/pages/Compras";
import ComprasDetalle from "@/pages/ComprasDetalle";
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
import Tareas from "@/pages/tareas";
import Historial from "@/pages/historial";
import Proveedores from "@/pages/proveedores";

/* Builder/Kiosk */
import BuilderClient from "@/pages/BuilderClient";
import Kiosk from "@/pages/Kiosk";
import BuilderConfigPage from "@/pages/Admin/BuilderConfig";
import Presets from "@/pages/Presets";

/* Legales */
import Privacidad from "@/pages/legal/Privacidad";
import Terminos from "@/pages/legal/Terminos";

/* Rutas / Shell */
import Protected from "@/routes/Protected";
import RoleGuard from "@/routes/RoleGuard";
import NavBar from "@/components/NavBar";
import AtlBackground from "@/components/AtlBackground";
import RoleSwitch from "@/components/RoleSwitch";
import ModeSwitch from "@/components/ModeSwitch";
import SupervisionBanner from "@/components/SupervisionBanner";

/* Para decidir destinos por rol */
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";

// Shell con NavBar solo para worker/owner
function Shell() {
  const { user } = useAuth();
  const { role, realRole, loading: roleLoading } = useRole(user?.uid);

  // Mostrar NavBar solo si es owner o worker
  const showNav = !roleLoading && (realRole === "owner" || role === "worker");

  return (
    <div className="app-root">
      <AtlBackground />
      <SupervisionBanner />
      <main className="app-shell">
        <Outlet />
      </main>

      {/* Toggles arriba a la derecha (solo Owner ve ambos) */}
      <RoleSwitch />
      <ModeSwitch />

      {showNav && <NavBar />}
    </div>
  );
}

/** Decide home por rol: clientes -> /start, staff/owner -> /menu */
function HomeDecider() {
  const { user } = useAuth();
  const { role, loading } = useRole(user?.uid);
  if (loading) return <div className="p-6">Cargando…</div>;
  return <Navigate to={role === "client" ? "/start" : "/menu"} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <Routes>
        {/* Públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/legal/privacidad" element={<Privacidad />} />
        <Route path="/legal/terminos" element={<Terminos />} />

        {/* Raíz decide según rol */}
        <Route path="/" element={<HomeDecider />} />

        {/* Protegidas */}
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            {/* Comunes */}
            <Route element={<RoleGuard allow={["client", "worker", "owner"]} />}>
              <Route path="/menu" element={<Menu />} />
              <Route path="/mas" element={<Mas />} />
              <Route path="/builder" element={<BuilderClient />} />
            </Route>

            {/* Solo Cliente */}
            <Route element={<RoleGuard allow={["client"]} />}>
              <Route path="/start" element={<ClientStart />} />
              <Route path="/cliente" element={<ClienteHome />} />
            </Route>

            {/* Staff */}
            <Route element={<RoleGuard allow={["worker", "owner"]} />}>
              <Route path="/carrito" element={<Carrito />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/bodega" element={<Bodega />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/compras/:purchaseId" element={<ComprasDetalle />} />
              <Route path="/horarios" element={<Horarios />} />
              <Route path="/apertura" element={<Apertura />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/tareas" element={<Tareas />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/kiosk" element={<Kiosk />} />
            </Route>

            {/* Solo Owner */}
            <Route element={<RoleGuard allow={["owner"]} />}>
              <Route path="/estadisticas" element={<Estadisticas />} />
              <Route path="/exportes" element={<Exportes />} />
              <Route path="/bootstrap" element={<Bootstrap />} />
              <Route path="/admin-seed" element={<AdminSeed />} />
              <Route path="/dev-seed" element={<DevSeed />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/admin/builder" element={<BuilderConfigPage />} />
              <Route path="/presets" element={<Presets />} />
            </Route>

            {/* Compat */}
            <Route path="/cierre" element={<Navigate to="/caja" replace />} />
            <Route path="/stats" element={<Navigate to="/estadisticas" replace />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

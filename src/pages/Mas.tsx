import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import InstallPWA from "@/components/InstallPWA";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import { usePreviewRole } from "@/contexts/PreviewRole";

function NavTile({ to, title, desc }: { to: string; title: string; desc?: string }) {
  return (
    <Link to={to} className="card" style={{ textDecoration: "none" }}>
      <div className="card-title">{title}</div>
      {desc ? <div className="muted">{desc}</div> : null}
    </Link>
  );
}

export default function Mas() {
  const { user, logout, switchGoogleAccount } = useAuth();
  const { role, realRole } = useRole(user?.uid);
  const { mode } = useOwnerMode();
  const { uiRole } = usePreviewRole();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => setEmail(user?.email ?? null), [user]);

  const isClientReal = role === "client";
  const isOwnerReal = realRole === "owner";
  const clientView = isClientReal || (isOwnerReal && uiRole === "client");

  // Worker real o Owner en modo control (solo si NO está en vista cliente)
  const staffView = !clientView && (role === "worker" || (isOwnerReal && mode === "control"));

  return (
    <div className="container-app p-6 space-y-5">
      <h1 className="text-2xl font-bold">Más</h1>
      <InstallPWA />

      <section className="space-y-2">
        <div className="font-semibold">Secciones</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {/* Operación */}
          {staffView && <NavTile to="/productos" title="Productos" desc="Catálogo y recetas por tamaño" />}
          {staffView && <NavTile to="/ventas" title="Ventas" desc="Entregar / anular / eliminar" />}
          {staffView && <NavTile to="/compras" title="Compras" desc="Reabastecer inventario" />}
          {staffView && <NavTile to="/proveedores" title="Proveedores" desc="Contactos y presentaciones" />}
          {staffView && <NavTile to="/horarios" title="Horarios" desc="Agenda por horas y colores" />}
          {staffView && <NavTile to="/apertura" title="Apertura" desc="Inicio de caja" />}
          {staffView && <NavTile to="/caja" title="Caja" desc="Ingresos/egresos y cierre" />}
          {staffView && <NavTile to="/tareas" title="Tareas del turno" desc="Apertura / durante / cierre / compras" />}

          {/* Owner (monitor / contable) — oculto en vista cliente */}
          {!clientView && isOwnerReal && <NavTile to="/estadisticas" title="Estadísticas" desc="Reportes rápidos" />}
          {!clientView && isOwnerReal && <NavTile to="/exportes" title="Exportes" desc="Descargar CSV/backup" />}
          {!clientView && isOwnerReal && <NavTile to="/historial" title="Historial diario" desc="Ventas, gastos y utilidad" />}
          {!clientView && isOwnerReal && <NavTile to="/admin-seed" title="AdminSeed" desc="Semillas / allowlist / costos" />}

          {/* Cliente */}
          {clientView && <NavTile to="/cliente" title="Mi perfil" desc="Sellos y créditos" />}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="card-title">Cuenta</div>
        <div className="muted">Sesión: {email ?? "(sin email)"}</div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-danger" onClick={logout}>Cerrar sesión</button>
          <button className="btn" onClick={() => switchGoogleAccount("artemisa.ops@gmail.com")} title="Forzar selector de Google">
            Cambiar de cuenta
          </button>
        </div>
      </section>
    </div>
  );
}

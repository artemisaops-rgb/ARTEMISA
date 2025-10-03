import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import InstallPWA from "@/components/InstallPWA";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";

function NavTile({ to, title, desc }: { to: string; title: string; desc?: string }) {
  return (
    <Link to={to} className="rounded-2xl border bg-white p-4 hover:shadow-sm transition">
      <div className="font-semibold">{title}</div>
      {desc ? <div className="text-sm text-slate-500">{desc}</div> : null}
    </Link>
  );
}

export default function Mas() {
  const { user, logout, switchGoogleAccount } = useAuth();
  const { role } = useRole();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => setEmail(user?.email ?? null), [user]);

  const isStaff = role === "owner" || role === "worker";

  return (
    <div className="container-app p-6 space-y-5">
      <h1 className="text-2xl font-bold">Más</h1>

      <InstallPWA />

      <section className="space-y-2">
        <div className="font-semibold">Secciones</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NavTile to="/clientes" title={isStaff ? "Clientes" : "Mi perfil"} desc={isStaff ? "Listado y canjes" : "Puntos y datos"} />

          {isStaff && <NavTile to="/productos" title="Productos" desc="Catálogo y recetas por tamaño" />}
          {isStaff && <NavTile to="/ventas" title="Ventas" desc="Entregar / anular / eliminar" />}
          {isStaff && <NavTile to="/compras" title="Compras" desc="Reabastecer inventario" />}
          {isStaff && <NavTile to="/horarios" title="Horarios" desc="Agenda por horas y colores" />}
          {isStaff && <NavTile to="/apertura" title="Apertura" desc="Inicio de caja" />}
          {isStaff && <NavTile to="/caja" title="Caja" desc="Ingresos/egresos y cierre" />}
          {isStaff && <NavTile to="/estadisticas" title="Estadísticas" desc="Reportes rápidos" />}
          {isStaff && <NavTile to="/exportes" title="Exportes" desc="Descargar CSV/backup" />}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Cuenta</div>
        <div className="text-sm text-slate-600">Sesión: {email ?? "(sin email)"}</div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-danger" onClick={logout}>Cerrar sesión</button>
          <button
            className="btn"
            onClick={() => switchGoogleAccount("artemisa.ops@gmail.com")}
            title="Forzar selector de Google"
          >
            Cambiar de cuenta
          </button>
        </div>
      </section>
    </div>
  );
}

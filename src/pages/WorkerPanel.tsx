import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
// import { collection, doc, onSnapshot, query, where, orderBy, getDoc } from "firebase/firestore"; // <-- eliminado
import { getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { subscribeToOpeningStatus, subscribeToLowStockCount } from "@/services/worker";
import { subscribeToPendingOrdersCount } from "@/services/order";

export default function WorkerPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgId = getOrgId();
  const uid = user?.uid || "";

  const [openingStatus, setOpeningStatus] =
    useState<"unknown" | "absent" | "open" | "closed">("unknown");
  const [pendingCount, setPendingCount] = useState(0);
  const [lowCount, setLowCount] = useState(0);

  // 1. Estado de apertura (Worker Service)
  useEffect(() => {
    return subscribeToOpeningStatus(uid, setOpeningStatus);
  }, [uid]);

  // 2. Pedidos pendientes (Order Service - migrado lógica aquí)
  useEffect(() => {
    return subscribeToPendingOrdersCount(orgId, setPendingCount);
  }, [orgId]);

  // 3. Insumos bajo mínimo (Worker Service)
  useEffect(() => {
    return subscribeToLowStockCount(orgId, setLowCount);
  }, [orgId]);

  const openLabel = useMemo(() => {
    if (openingStatus === "unknown") return "Cargando…";
    if (openingStatus === "absent") return "Apertura pendiente";
    if (openingStatus === "open") return "Turno abierto";
    return "Turno cerrado";
  }, [openingStatus]);

  return (
    <div className="container-app p-6 space-y-5">
      <section className="hero">
        <div className="row-between">
          <div>
            <h2>Turno</h2>
            <p>Estado de hoy</p>
          </div>
          {openingStatus === "absent" && (
            <button className="btn btn-primary" onClick={() => navigate("/apertura")}>Ir a Apertura</button>
          )}
        </div>
        <div style={{ marginTop: 12 }} className="row-between">
          <div className="text-xl font-semibold">{openLabel}</div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Pedidos pendientes" value={pendingCount} to="/ventas" />
        <Kpi title="Insumos bajo mínimo" value={lowCount} to="/compras" />
      </div>

      <div className="card">
        <div className="card-title">Atajos de turno</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink to="/ventas" label="Ventas" />
          <QuickLink to="/compras" label="Compras" />
          <QuickLink to="/bodega" label="Bodega" />
          <QuickLink to="/caja" label="Caja" />
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, to }: { title: string; value: number; to: string }) {
  return (
    <Link to={to} className="card hover:shadow-sm transition">
      <div className="muted text-sm">{title}</div>
      <div className="text-2xl font-bold">{Number(value || 0).toLocaleString()}</div>
    </Link>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="btn" style={{ textAlign: "center" }}>
      {label}
    </Link>
  );
}


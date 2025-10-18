import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, where, orderBy, getDoc } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

export default function WorkerPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgId = getOrgId();
  const uid = user?.uid || "";

  const [openingStatus, setOpeningStatus] =
    useState<"unknown" | "absent" | "open" | "closed">("unknown");
  const [pendingCount, setPendingCount] = useState(0);
  const [lowCount, setLowCount] = useState(0);

  useEffect(() => {
    if (!uid) { setOpeningStatus("absent"); return; }
    const ref = doc(collection(db, "openings"), `${ymd()}_${uid}`);
    getDoc(ref).then((s) => {
      if (!s.exists()) return setOpeningStatus("absent");
      const v: any = s.data();
      setOpeningStatus(v?.status === "closed" ? "closed" : "open");
    }).catch(() => setOpeningStatus("absent"));
  }, [uid]);

  useEffect(() => {
    const qy = query(
      collection(db, "orders"),
      where("orgId", "==", orgId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) => setPendingCount(snap.size));
    return () => unsub();
  }, [orgId]);

  useEffect(() => {
    const qy = query(collection(db, "inventoryItems"), where("orgId", "==", orgId));
    const unsub = onSnapshot(qy, (snap) => {
      let n = 0;
      snap.forEach((d) => {
        const x: any = d.data();
        const stock = Number(x?.stock || 0);
        const min = x?.minStock != null ? Number(x.minStock) : Number(x.min || 0);
        if (!Number.isNaN(min) && stock <= min) n += 1;
      });
      setLowCount(n);
    });
    return () => unsub();
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
        <div style={{marginTop:12}} className="row-between">
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
    <Link to={to} className="btn" style={{textAlign:"center"}}>
      {label}
    </Link>
  );
}

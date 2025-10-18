// src/pages/ClienteHome.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { ensureCustomerDoc } from "@/lib/customers";
import { useNavigate } from "react-router-dom";

type LoyaltyEvent = {
  id: string;
  type: "earn" | "redeem";
  delta: number;
  at?: Timestamp | null;
  orderId?: string | null;
  staffId?: string | null;
};
type CustomerDoc = {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  stampsProgress?: number;
  totalStamps?: number;
  freeCredits?: number;
};

const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;
const fmtTime = (ts?: Timestamp | null) => {
  const d = ts?.toDate?.() ? ts!.toDate() : null;
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ClienteHome() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const uid = user?.uid || null;
  const orgId = getOrgId();

  const [me, setMe] = useState<CustomerDoc | null>(null);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const [orders, setOrders] = useState<
    { id: string; total: number; createdAt?: Timestamp | null; status?: string | null }[]
  >([]);

  // banners/errores de permisos o índices
  const [errProfile, setErrProfile] = useState<string | null>(null);
  const [errEvents, setErrEvents] = useState<string | null>(null);
  const [errOrders, setErrOrders] = useState<string | null>(null);

  // Asegura perfil en /customers/{uid}
  useEffect(() => {
    if (!uid) return;
    ensureCustomerDoc(db, uid, {
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      photoURL: user?.photoURL ?? null,
    }).catch(() => {});
  }, [uid, user?.email, user?.displayName, user?.photoURL]);

  // Perfil
  useEffect(() => {
    if (!uid) {
      setMe(null);
      return;
    }
    const ref = doc(db, "customers", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const v: any = snap.data() || {};
        setMe({
          displayName: v.displayName ?? user?.displayName ?? null,
          email: v.email ?? user?.email ?? null,
          photoURL: v.photoURL ?? user?.photoURL ?? null,
          stampsProgress: Number(v.stampsProgress || 0),
          totalStamps: Number(v.totalStamps || 0),
          freeCredits: Number(v.freeCredits || 0),
        });
        setErrProfile(null);
      },
      (err) => setErrProfile(err?.message || "No se pudo leer tu perfil.")
    );
    return () => unsub();
  }, [uid, user?.displayName, user?.email, user?.photoURL]);

  // Eventos fidelización (nota: filtrar por orgId requiere índice compuesto: orgId+at)
  useEffect(() => {
    if (!uid) {
      setEvents([]);
      return;
    }
    const qy = query(
      collection(db, "customers", uid, "loyaltyEvents"),
      where("orgId", "==", orgId),
      orderBy("at", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const xs: LoyaltyEvent[] = [];
        snap.forEach((d) => {
          const v: any = d.data();
          xs.push({
            id: d.id,
            type: v.type === "redeem" ? "redeem" : "earn",
            delta: Number(v.delta || 0),
            at: v.at ?? null,
            orderId: v.orderId ?? null,
            staffId: v.staffId ?? null,
          });
        });
        setEvents(xs);
        setErrEvents(null);
      },
      (err) => setErrEvents(err?.message || "No se pudo leer tu historial de sellos.")
    );
    return () => unsub();
  }, [uid, orgId]);

  // Mis pedidos (nota: requiere índice compuesto: orgId+customerUid+createdAt)
  useEffect(() => {
    if (!uid) {
      setOrders([]);
      return;
    }
    const qy = query(
      collection(db, "orders"),
      where("orgId", "==", orgId),
      where("customerUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const xs: any[] = [];
        snap.forEach((d) => {
          const v: any = d.data();
          xs.push({
            id: d.id,
            total: Number(v.total || 0),
            createdAt: v.createdAt ?? v.at ?? null,
            status: String(v.status || ""),
          });
        });
        setOrders(xs as any);
        setErrOrders(null);
      },
      (err) => setErrOrders(err?.message || "No se pudieron leer tus pedidos.")
    );
    return () => unsub();
  }, [uid, orgId]);

  const progressPct = useMemo(
    () => Math.max(0, Math.min(100, (Number(me?.stampsProgress || 0) / 10) * 100)),
    [me?.stampsProgress]
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div className="container-app space-y-4" style={{ paddingBottom: "var(--bottom-bar-space,140px)" }}>
      {/* HERO */}
      <header className="hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ opacity: 0.9, fontSize: 14 }}>{greeting}</div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.2 }}>
              {me?.displayName || "Cliente"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" title="Mi cuenta" onClick={() => nav("/mas")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5 0-8 2.5-8 5v1h16v-1c0-2.5-3-5-8-5Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
            <button className="btn" title="Cerrar sesión" onClick={logout}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16, background: "#ffffff22", backdropFilter: "blur(6px)", borderRadius: 18, padding: 14 }}>
          <div style={{ opacity: 0.9, fontSize: 14, marginBottom: 6 }}>Sellos a tu próximo beneficio</div>
          <div className="progress-brand"><div style={{ width: `${progressPct}%` }} /></div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            {me?.stampsProgress ?? 0}/10 · Créditos: <b>{me?.freeCredits ?? 0}</b>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="btn-primary">Explorar beneficios</button>
        </div>
      </header>

      {/* Mensajes de error (si los hay) */}
      {errProfile && (
        <div className="rounded-2xl border bg-rose-50 text-rose-700 p-3 text-sm">
          Perfil: {errProfile}
        </div>
      )}
      {errEvents && (
        <div className="rounded-2xl border bg-amber-50 text-amber-800 p-3 text-sm">
          Fidelización: {errEvents} {errEvents.includes("index") ? "· Crea el índice compuesto orgId/at para loyaltyEvents." : ""}
        </div>
      )}
      {errOrders && (
        <div className="rounded-2xl border bg-amber-50 text-amber-800 p-3 text-sm">
          Pedidos: {errOrders} {errOrders.includes("index") ? "· Crea el índice orgId+customerUid+createdAt." : ""}
        </div>
      )}

      {/* Historial fidelización */}
      <section className="card">
        <div className="card-title">Historial de fidelización</div>
        {!events.length && <div className="text-sm" style={{ color: "#64748b" }}>Aún no hay movimientos.</div>}
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={
                    "text-xs px-2 py-0.5 rounded-full border " +
                    (ev.type === "earn" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")
                  }
                >
                  {ev.type === "earn" ? "Sello" : "Canje"}
                </span>
                <span className="text-sm">{ev.type === "earn" ? `+${ev.delta} sello(s)` : `${ev.delta} sellos`}</span>
                {ev.orderId && (
                  <span className="text-xs" style={{ color: "#94a3b8" }}>
                    · orden {ev.orderId.slice(0, 6)}
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: "#94a3b8" }}>{fmtTime(ev.at)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pedidos */}
      <section className="card">
        <div className="card-title">Mis pedidos recientes</div>
        {!orders.length && <div className="text-sm" style={{ color: "#64748b" }}>Aún no has hecho pedidos.</div>}
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
              <div>
                <div className="font-medium">#{o.id.slice(0, 6)} · {money(o.total)}</div>
                <div className="text-xs" style={{ color: "#94a3b8" }}>
                  {fmtTime(o.createdAt)} · {o.status || "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

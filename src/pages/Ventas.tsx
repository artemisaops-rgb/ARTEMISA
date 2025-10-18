import React, { useEffect, useMemo, useState } from "react";
import { db, getOrgId } from "@/services/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { cancelOrder, deleteOrder, markDelivered } from "@/lib/pos.helpers";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { useOwnerMode } from "@/contexts/OwnerMode";

type PayMethod = "cash" | "qr" | "card" | "other";
type OrderStatus = "pending" | "delivered" | "canceled";

type OrderItem = {
  productId?: string;
  id?: string;
  name: string;
  qty: number;
  price: number;
  isBeverage?: boolean;
  category?: string;
};

type Order = {
  id: string;
  total: number;
  status: OrderStatus;
  payMethod?: PayMethod;
  createdAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  items?: OrderItem[];
};

const BEV_CATS = ["frappes", "coldbrew", "bebidas calientes"] as const;

function fixText(s?: string): string {
  if (!s) return "";
  try { return s.normalize("NFC"); } catch { return s; }
}

const fmtMoney = (n: number) => `$${(Number(n) || 0).toLocaleString()}`;
const fmtTime = (ts?: Timestamp | null) => {
  const d = ts?.toDate?.() ? ts!.toDate() : null;
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

function startOfDay(d0 = new Date()) {
  const d = new Date(d0);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d0: Date, n: number) {
  const d = new Date(d0);
  d.setDate(d.getDate() + n);
  return d;
}
function monthRange(d0 = new Date()) {
  const d = new Date(d0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const next = new Date(d);
  next.setMonth(d.getMonth() + 1);
  return { from: d, to: next };
}

type Preset = "today" | "yesterday" | "7d" | "month" | "custom";

export default function Ventas() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("pending");
  const [pay, setPay] = useState<PayMethod | "all">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { mode } = useOwnerMode();

  const ownerMonitor = realRole === "owner" && mode === "monitor";
  const ownerTotal   = realRole === "owner" && mode === "control";
  const isWorker     = realRole === "worker";

  const ORG_ID = getOrgId();

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const range = useMemo(() => {
    let fromD: Date, toD: Date;
    if (preset === "today") {
      fromD = startOfDay(new Date());
      toD = addDays(fromD, 1);
    } else if (preset === "yesterday") {
      toD = startOfDay(new Date());
      fromD = addDays(toD, -1);
    } else if (preset === "7d") {
      toD = addDays(startOfDay(new Date()), 1);
      fromD = addDays(toD, -7);
    } else if (preset === "month") {
      const r = monthRange(new Date());
      fromD = r.from;
      toD = r.to;
    } else {
      const f = customFrom ? new Date(customFrom) : startOfDay(new Date());
      const t = customTo ? addDays(new Date(customTo), 1) : addDays(startOfDay(new Date()), 1);
      fromD = startOfDay(f);
      toD = startOfDay(t);
    }
    return {
      from: Timestamp.fromDate(fromD),
      to: Timestamp.fromDate(toD),
      label:
        preset === "custom"
          ? `${customFrom || "?"} → ${customTo || "?"}`
          : preset === "today"
          ? "Hoy"
          : preset === "yesterday"
          ? "Ayer"
          : preset === "7d"
          ? "Últimos 7 días"
          : "Este mes",
    };
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    setErr(null);

    const qy = query(
      collection(db, "orders"),
      where("orgId", "==", ORG_ID),
      where("createdAt", ">=", range.from),
      where("createdAt", "<", range.to),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const xs: Order[] = [];
        snap.forEach((d) => {
          const v: any = d.data();
          const createdAt: Timestamp | null =
            v?.createdAt && typeof v.createdAt?.toDate === "function"
              ? (v.createdAt as Timestamp)
              : v?.at && typeof v.at?.toDate === "function"
              ? (v.at as Timestamp)
              : null;
          const deliveredAt: Timestamp | null =
            v?.deliveredAt && typeof v.deliveredAt?.toDate === "function"
              ? (v.deliveredAt as Timestamp)
              : null;
          xs.push({
            id: d.id,
            total: Number(v.total) || 0,
            status: (v.status || "pending") as OrderStatus,
            payMethod: (v.payMethod || undefined) as PayMethod | undefined,
            createdAt,
            deliveredAt,
            items: Array.isArray(v.items) ? v.items : [],
          });
        });
        setOrders(xs);
      },
      (e: any) => {
        if (e?.code === "failed-precondition") {
          setErr(
            "Falta índice de Firestore para orders: [orgId ASC, createdAt DESC]. " +
            "Agrega el índice en firestore.indexes.json."
          );
        } else {
          setErr(e?.message || String(e));
        }
      }
    );
    return () => unsub();
  }, [ORG_ID, range.from, range.to]);

  const list = useMemo(() => {
    return orders
      .filter((o) => (filter === "all" ? true : o.status === filter))
      .filter((o) => (pay === "all" ? true : o.payMethod === pay));
  }, [orders, filter, pay]);

  const act = async (fn: (id: string) => Promise<any>, id: string) => {
    try {
      setLoadingId(id);
      await fn(id);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setLoadingId(null);
    }
  };

  const chipPay = (p?: PayMethod) => {
    const base = "text-xs px-2 py-0.5 rounded-full border";
    if (p === "cash") return <span className={base}>Efectivo</span>;
    if (p === "qr") return <span className={base}>QR</span>;
    if (p === "card") return <span className={base}>Tarjeta</span>;
    if (p === "other") return <span className={base}>Otro</span>;
    return <span className={base + " opacity-60"}>—</span>;
  };

  const countBeverages = (items?: OrderItem[]) =>
    (items || []).reduce((acc, it) => {
      const isB =
        Boolean(it.isBeverage) ||
        (it.category ? BEV_CATS.includes(String(it.category).toLowerCase() as any) : false);
      return acc + (isB ? Number(it.qty || 0) : 0);
    }, 0);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {ownerMonitor && (
        <div className="p-3 rounded-xl border bg-amber-50 text-amber-800 text-sm">
          Estás en <b>modo Owner (monitor)</b>. Acciones deshabilitadas.
        </div>
      )}
      {isWorker && !ownerMonitor && (
        <div className="p-3 rounded-xl border bg-sky-50 text-sky-800 text-sm">
          Vista <b>Worker</b>: solo puedes <b>Entregar</b>. Anular/Eliminar están restringidas al Owner (control total).
        </div>
      )}
      {err && (
        <div className="p-3 rounded-xl border bg-amber-50 text-amber-800 text-sm">
          {err}
        </div>
      )}

      {/* filtros superiores */}
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "delivered", "canceled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1 rounded-full border text-sm " +
              (filter === f
                ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]"
                : "bg-white")
            }
            title={
              f === "pending" ? "Aún sin entregar"
              : f === "delivered" ? "Entregadas"
              : f === "canceled" ? "Anuladas"
              : "Todas del rango"
            }
          >
            {f === "pending" ? "Pendiente" : f === "delivered" ? "Entregada" : f === "canceled" ? "Anulada" : "Todas"}
          </button>
        ))}
        <div className="h-5 w-px bg-slate-200 mx-1" />
        {(["all", "cash", "qr", "card", "other"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setPay(m as any)}
            className={
              "px-3 py-1 rounded-full border text-sm " +
              (pay === m
                ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]"
                : "bg-white")
            }
            title={m === "all" ? "Todos los métodos" : undefined}
          >
            {m === "all" ? "Todos" : m === "cash" ? "Efectivo" : m === "qr" ? "QR" : m === "card" ? "Tarjeta" : "Otro"}
          </button>
        ))}
      </div>

      {/* listado */}
      {list.map((o) => {
        const busy = loadingId === o.id;
        const bevCount = countBeverages(o.items);

        // Permisos UI por fila basados en MODO
        const canDeliverUI = !ownerMonitor && (ownerTotal || isWorker) && o.status === "pending";
        const canCancelUI  = !ownerMonitor && ownerTotal && o.status === "pending";
        const canDeleteUI  = !ownerMonitor && ownerTotal && o.status !== "delivered";

        return (
          <div key={o.id} className="bg-white border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">
                {fmtTime(o.createdAt)} · Venta {o.id.slice(0, 6)} · {fmtMoney(o.total)}
                {o.deliveredAt ? (
                  <span className="ml-2 text-xs text-slate-600">(Entregada {fmtTime(o.deliveredAt)})</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {bevCount > 0 && (
                  <span title={`Incluye bebidas (${bevCount})`} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border">
                    ☕ {bevCount}
                  </span>
                )}
                {chipPay(o.payMethod)}
                <span
                  className={
                    "text-xs px-2 py-0.5 rounded-full " +
                    (o.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : o.status === "delivered"
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-600")
                  }
                >
                  {o.status === "pending" ? "Pendiente" : o.status === "delivered" ? "Entregada" : "Anulada"}
                </span>
              </div>
            </div>

            {o.items?.length ? (
              <div className="mt-2 text-sm text-slate-600">
                {o.items.map((it, idx) => (
                  <div key={(it.productId || it.id || "") + idx} className="flex justify-between">
                    <div>{fixText(it.name)} — {it.qty}</div>
                    <div>{fmtMoney(Number(it.price) * Number(it.qty))}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={!canDeliverUI || busy}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                onClick={() => act((id) => markDelivered(db, id), o.id)}
                title="Marcar como entregada"
              >
                {busy ? "Procesando..." : "Entregar"}
              </button>

              <button
                disabled={!canCancelUI || busy}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                onClick={() => act((id) => cancelOrder(db, id), o.id)}
                title="Anular venta (devuelve insumos al stock)"
              >
                {busy ? "Procesando..." : "Anular"}
              </button>

              <button
                disabled={!canDeleteUI || busy}
                className="px-3 py-1.5 rounded-lg border text-red-600 disabled:opacity-50"
                onClick={() => {
                  if (!confirm("¿Eliminar la venta? Esto devolverá el stock si corresponde.")) return;
                  return act((id) => deleteOrder(db, id), o.id);
                }}
                title={canDeleteUI ? "Eliminar definitivamente" : "No permitido"}
              >
                {busy ? "Procesando..." : "Eliminar"}
              </button>
            </div>
          </div>
        );
      })}

      {!list.length && !err && (
        <div className="text-slate-500">
          No hay ventas {filter !== "all" ? (filter === "pending" ? "pendientes" : filter) : ""} en el rango.
        </div>
      )}
    </div>
  );
}

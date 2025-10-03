import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/services/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
  where,
} from "firebase/firestore";
import { cancelOrder, deleteOrder, markDelivered } from "@/lib/pos.helpers";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "default";

type PayMethod = "cash" | "qr" | "card" | "other";
type OrderStatus = "pending" | "delivered" | "canceled";

type Order = {
  id: string;
  total: number;
  status: OrderStatus;
  payMethod?: PayMethod;
  createdAt?: Timestamp | null;
  items?: { productId?: string; id?: string; name: string; qty: number; price: number }[];
};

const fmtMoney = (n: number) => `$${(Number(n) || 0).toLocaleString()}`;
const fmtTime = (ts?: Timestamp | null) => {
  const d = ts?.toDate?.() ? ts!.toDate() : null;
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const isToday = (ts?: Timestamp | null) => {
  const d = ts?.toDate?.();
  if (!d) return true;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
};

export default function Ventas() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("pending");
  const [pay, setPay] = useState<PayMethod | "all">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const qy = query(
      collection(db, "orders"),
      where("orgId", "==", ORG_ID),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const xs: Order[] = [];
      snap.forEach((d) => {
        const v: any = d.data();
        const ca =
          v?.createdAt && typeof v.createdAt?.toDate === "function"
            ? (v.createdAt as Timestamp)
            : v?.at && typeof v.at?.toDate === "function"
            ? (v.at as Timestamp)
            : null;
        xs.push({
          id: d.id,
          total: Number(v.total) || 0,
          status: (v.status || "pending") as OrderStatus,
          payMethod: (v.payMethod || undefined) as PayMethod | undefined,
          createdAt: ca,
          items: Array.isArray(v.items) ? v.items : [],
        });
      });
      setOrders(xs);
    });
    return () => unsub();
  }, []);

  const list = useMemo(() => {
    return orders
      .filter((o) => isToday(o.createdAt))
      .filter((o) => (filter === "all" ? true : o.status === filter))
      .filter((o) => (pay === "all" ? true : o.payMethod === pay));
  }, [orders, filter, pay]);

  const canDelete = (_o: Order) => true;

  const act = async (fn: (id: string) => Promise<any>, id: string) => {
    try { setLoadingId(id); await fn(id); }
    catch (e: any) { alert(e?.message || String(e)); }
    finally { setLoadingId(null); }
  };

  const chipPay = (p?: PayMethod) => {
    const base = "text-xs px-2 py-0.5 rounded-full border";
    if (p === "cash") return <span className={base}>Efectivo</span>;
    if (p === "qr") return <span className={base}>QR</span>;
    if (p === "card") return <span className={base}>Tarjeta</span>;
    return <span className={base + " opacity-60"}>�?"</span>;
  };

  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar la venta? Esto devolverá el stock si corresponde.")) return;
    await act((x) => deleteOrder(db, x), id);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["pending", "delivered", "canceled", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={"px-3 py-1 rounded-full border text-sm " +
              (filter === f ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white")}>
            {f === "pending" ? "Pendiente" : f === "delivered" ? "Entregada" : f === "canceled" ? "Anulada" : "Todas"}
          </button>
        ))}
        <div className="h-5 w-px bg-slate-200 mx-1" />
        {(["all", "cash", "qr", "card"] as const).map((m) => (
          <button key={m} onClick={() => setPay(m as any)}
            className={"px-3 py-1 rounded-full border text-sm " +
              (pay === m ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white")}>
            {m === "all" ? "Todos" : m === "cash" ? "Efectivo" : m.toUpperCase()}
          </button>
        ))}
      </div>

      {list.map((o) => {
        const busy = loadingId === o.id;
        return (
          <div key={o.id} className="bg-white border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">
                {fmtTime(o.createdAt)} · Venta {o.id.slice(0, 6)} �?" {fmtMoney(o.total)}
              </div>
              <div className="flex items-center gap-2">
                {chipPay(o.payMethod)}
                <span className={
                    "text-xs px-2 py-0.5 rounded-full " +
                    (o.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : o.status === "delivered"
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-600")
                  }>
                  {o.status === "pending" ? "Pendiente" : o.status === "delivered" ? "Entregada" : "Anulada"}
                </span>
              </div>
            </div>

            {o.items?.length ? (
              <div className="mt-2 text-sm text-slate-600">
                {o.items.map((it, idx) => (
                  <div key={(it.productId || it.id || "") + idx} className="flex justify-between">
                    <div>{it.name} �- {it.qty}</div>
                    <div>{fmtMoney(Number(it.price) * Number(it.qty))}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={o.status !== "pending" || busy}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                onClick={() => act((id) => markDelivered(db, id), o.id)}>
                {busy ? "Procesando�?�" : "Entregar"}
              </button>
              <button disabled={o.status !== "pending" || busy}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-50"
                onClick={() => act((id) => cancelOrder(db, id), o.id)}>
                {busy ? "Procesando�?�" : "Anular"}
              </button>
              <button disabled={!canDelete(o) || busy}
                className="px-3 py-1.5 rounded-lg border text-red-600 disabled:opacity-50"
                onClick={() => onDelete(o.id)}
                title={!canDelete(o) ? "Solo pendiente o dentro de 48h" : ""}>
                {busy ? "Procesando�?�" : "Eliminar"}
              </button>
            </div>
          </div>
        );
      })}

      {!list.length && <div className="text-slate-500">No hay ventas {filter !== "all" ? filter : ""}.</div>}
    </div>
  );
}

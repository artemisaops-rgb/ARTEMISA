// src/pages/Exportes.tsx
import { useState } from "react";
import { db } from "@/services/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";

/** CSV robusto y tipado */
type Row = Record<string, any>;

const toCSV = (rows: Row[]) => {
  if (!rows.length) return "";
  const headerSet = rows.reduce<Set<string>>((set, r) => {
    Object.keys(r || {}).forEach((k) => set.add(k));
    return set;
  }, new Set<string>());
  const headers: string[] = Array.from(headerSet);

  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const body = rows
    .map((r) => headers.map((h) => esc((r as Row)[h])).join(","))
    .join("\n");

  return headers.join(",") + "\n" + body;
};

const download = (name: string, text: string) => {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function Exportes() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const needRange = () => {
    if (!desde || !hasta) throw new Error("Selecciona rango");
    const from = new Date(`${desde}T00:00:00`);
    const to = new Date(`${hasta}T00:00:00`);
    to.setDate(to.getDate() + 1);
    return { from: Timestamp.fromDate(from), to: Timestamp.fromDate(to) };
  };

  // ---- Export: Inventario ----
  const exportInventario = async () => {
    const snap = await getDocs(collection(db, "inventoryItems"));
    const rows = snap.docs.map((d) => {
      const v: any = d.data();
      return {
        id: d.id,
        name: v.name ?? "",
        unit: v.unit ?? "",
        stock: Number(v.stock ?? 0),
        min: Number(v.min ?? 0),
        costPerUnit: Number(v.costPerUnit ?? 0),
        provider: v.provider ?? "",
        updatedAt: v.updatedAt?.toDate?.() ? fmtDate(v.updatedAt.toDate()) : "",
      };
    });
    download("inventario.csv", toCSV(rows));
  };

  // ---- Export: Productos ----
  const exportProductos = async () => {
    const snap = await getDocs(collection(db, "products"));
    const rows = snap.docs.map((d) => {
      const v: any = d.data();
      const sizes = Array.isArray(v.sizes)
        ? v.sizes.map((s: any) => `${s.name}:${Number(s.price || 0)}`).join("|")
        : "";
      return {
        id: d.id,
        name: v.name ?? "",
        category: v.category ?? "",
        active: Boolean(v.active ?? true),
        sizes,
      };
    });
    download("productos.csv", toCSV(rows));
  };

  // ---- �"rdenes por rango ----
  const qOrdersByRange = () => {
    const { from, to } = needRange();
    return query(
      collection(db, "orders"),
      where("createdAt", ">=", from),
      where("createdAt", "<", to),
      orderBy("createdAt", "asc")
    );
  };

  // ---- Export: Ventas (una fila por orden) ----
  const exportVentas = async () => {
    try {
      const snap = await getDocs(qOrdersByRange());
      const rows = snap.docs.map((d) => {
        const v: any = d.data();
        const created = v.createdAt?.toDate?.() ? v.createdAt.toDate() : new Date(0);
        return {
          id: d.id,
          createdAt: fmtDate(created),
          status: String(v.status || ""),
          payMethod: String(v.payMethod || ""),
          total: Number(v.total) || 0,
          cogs: Number(v.cogs) || 0,
          itemCount: Array.isArray(v.items) ? v.items.length : 0,
          items: Array.isArray(v.items)
            ? v.items.map((it: any) => `${it.name} x ${it.qty}`).join("; ")
            : "",
          deliveredAt: v.deliveredAt?.toDate?.() ? fmtDate(v.deliveredAt.toDate()) : "",
          canceledAt: v.canceledAt?.toDate?.() ? fmtDate(v.canceledAt.toDate()) : "",
        };
      });
      download(`ventas_${desde}_a_${hasta}.csv`, toCSV(rows));
    } catch (e: any) {
      alert(e?.message || "Error");
    }
  };

  // ---- Export: Ventas (detalle de ítems) ----
  const exportVentasItems = async () => {
    try {
      const snap = await getDocs(qOrdersByRange());
      const rows: Row[] = [];
      snap.docs.forEach((d) => {
        const v: any = d.data();
        const created = v.createdAt?.toDate?.() ? v.createdAt.toDate() : new Date(0);
        const base = {
          orderId: d.id,
          createdAt: fmtDate(created),
          status: String(v.status || ""),
          payMethod: String(v.payMethod || ""),
        };
        (v.items || []).forEach((it: any) => {
          rows.push({
            ...base,
            productId: String(it.productId || ""),
            name: String(it.name || ""),
            size: String(it.sizeName || ""),
            qty: Number(it.qty || 0),
            price: Number(it.price || 0),
            total: Number(it.total || Number(it.price || 0) * Number(it.qty || 0)),
          });
        });
      });
      download(`ventas_items_${desde}_a_${hasta}.csv`, toCSV(rows));
    } catch (e: any) {
      alert(e?.message || "Error");
    }
  };

  // ---- Export: Movimientos de stock ----
  const exportMovimientos = async () => {
    try {
      const { from, to } = needRange();
      const qy = query(
        collection(db, "stockMovements"),
        where("at", ">=", from),
        where("at", "<", to),
        orderBy("at", "asc")
      );
      const snap = await getDocs(qy);
      const rows = snap.docs.map((d) => {
        const v: any = d.data();
        return {
          id: d.id,
          at: v.at?.toDate?.() ? fmtDate(v.at.toDate()) : "",
          type: v.type || "",
          ingredientId: v.ingredientId || "",
          qty: Number(v.qty || 0),
          reason: v.reason || "",
          orderId: v.orderId || "",
        };
      });
      download(`stock_movimientos_${desde}_a_${hasta}.csv`, toCSV(rows));
    } catch (e: any) {
      alert(e?.message || "Error");
    }
  };

  // ---- NEW: Export Movimientos de Caja ----
  const exportCaja = async () => {
    try {
      const { from, to } = needRange();
      const qy = query(
        collection(db, "cashMovements"),
        where("at", ">=", from),
        where("at", "<", to),
        orderBy("at", "asc")
      );
      const snap = await getDocs(qy);
      const rows = snap.docs.map((d) => {
        const v: any = d.data();
        const at = v.at?.toDate?.() ? fmtDate(v.at.toDate()) : "";
        return {
          id: d.id,
          at,
          userId: String(v.userId || ""),
          type: String(v.type || ""),
          amount: Number(v.amount || 0),
          reason: v.reason || "",
          orderId: v.orderId || "",
        };
      });
      download(`caja_${desde}_a_${hasta}.csv`, toCSV(rows));
    } catch (e:any) {
      alert(e?.message || "Error");
    }
  };

  // ---- Export: Resúmenes diarios ----
  const exportResumenes = async () => {
    try {
      if (!desde || !hasta) throw new Error("Selecciona rango");
      const qy = query(
        collection(db, "dailySummary"),
        where("date", ">=", desde),
        where("date", "<=", hasta),
        orderBy("date", "asc")
      );
      const snap = await getDocs(qy);
      const rows = snap.docs.map((d) => {
        const v: any = d.data();
        const t = v.totals || {};
        return {
          date: v.date || d.id,
          sales: Number(t.sales || 0),
          refunds: Number(t.refunds || 0),
          cogs: Number(t.cogs || 0),
          expectedCash: Number(t.expectedCash || 0),
          deliveredCount: Number(t.deliveredCount || 0),
          ticketAvg: Number(t.ticketAvg || 0),
          profit: Number(t.profit || 0),
          cashFinal: Number(v.finalCash || 0),
          cashDiff: Number(v.cashDiff || 0),
        };
      });
      download(`resumenes_${desde}_a_${hasta}.csv`, toCSV(rows));
    } catch (e: any) {
      alert(e?.message || "Error");
    }
  };

  return (
    <main className="p-4 space-y-4">
      <div className="rounded-2xl border p-4 bg-white shadow-sm space-y-3">
        <div className="font-medium">Exportes</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <span>�?"</span>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />

          <button onClick={exportVentas} className="rounded-xl bg-orange-600 text-white px-4 py-2">
            Ventas CSV
          </button>
          <button onClick={exportVentasItems} className="rounded-xl border px-4 py-2">
            Ventas (detalle ítems)
          </button>
          <button onClick={exportMovimientos} className="rounded-xl border px-4 py-2">
            Mov. de stock
          </button>
          <button onClick={exportCaja} className="rounded-xl border px-4 py-2">
            Caja (ingresos/egresos)
          </button>
          <button onClick={exportProductos} className="rounded-xl border px-4 py-2">
            Productos CSV
          </button>
          <button onClick={exportInventario} className="rounded-xl border px-4 py-2">
            Inventario CSV
          </button>
          <button onClick={exportResumenes} className="rounded-xl border px-4 py-2">
            Resúmenes diarios
          </button>
        </div>
      </div>
    </main>
  );
}

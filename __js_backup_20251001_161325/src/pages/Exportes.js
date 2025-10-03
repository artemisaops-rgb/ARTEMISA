import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { db } from "@/services/firebase";
import { collection, getDocs, query, where, orderBy, Timestamp, } from "firebase/firestore";
const toCSV = (rows) => {
    if (!rows.length)
        return "";
    // <- Tipado explícito: evita 'unknown[]'
    const headerSet = rows.reduce((set, r) => {
        Object.keys(r || {}).forEach((k) => set.add(k));
        return set;
    }, new Set());
    const headers = Array.from(headerSet);
    const esc = (v) => {
        if (v === null || v === undefined)
            return "";
        if (typeof v === "object")
            v = JSON.stringify(v);
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        //       ↑ escapa comillas y newlines
    };
    const body = rows
        .map((r) => headers.map((h) => esc(r[h])).join(","))
        .join("\n");
    return headers.join(",") + "\n" + body;
};
const download = (name, text) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
};
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export default function Exportes() {
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const needRange = () => {
        if (!desde || !hasta)
            throw new Error("Selecciona rango");
        const from = new Date(`${desde}T00:00:00`);
        const to = new Date(`${hasta}T00:00:00`);
        to.setDate(to.getDate() + 1);
        return { from: Timestamp.fromDate(from), to: Timestamp.fromDate(to) };
    };
    // ---- Export: Inventario ----
    const exportInventario = async () => {
        const snap = await getDocs(collection(db, "inventoryItems"));
        const rows = snap.docs.map((d) => {
            const v = d.data();
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
            const v = d.data();
            const sizes = Array.isArray(v.sizes)
                ? v.sizes.map((s) => `${s.name}:${Number(s.price || 0)}`).join("|")
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
    // ---- Órdenes por rango ----
    const qOrdersByRange = () => {
        const { from, to } = needRange();
        return query(collection(db, "orders"), where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "asc"));
    };
    // ---- Export: Ventas (una fila por orden) ----
    const exportVentas = async () => {
        try {
            const snap = await getDocs(qOrdersByRange());
            const rows = snap.docs.map((d) => {
                const v = d.data();
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
                        ? v.items.map((it) => `${it.name} x ${it.qty}`).join("; ")
                        : "",
                    deliveredAt: v.deliveredAt?.toDate?.() ? fmtDate(v.deliveredAt.toDate()) : "",
                    canceledAt: v.canceledAt?.toDate?.() ? fmtDate(v.canceledAt.toDate()) : "",
                };
            });
            download(`ventas_${desde}_a_${hasta}.csv`, toCSV(rows));
        }
        catch (e) {
            alert(e?.message || "Error");
        }
    };
    // ---- Export: Ventas (detalle de ítems) ----
    const exportVentasItems = async () => {
        try {
            const snap = await getDocs(qOrdersByRange());
            const rows = [];
            snap.docs.forEach((d) => {
                const v = d.data();
                const created = v.createdAt?.toDate?.() ? v.createdAt.toDate() : new Date(0);
                const base = {
                    orderId: d.id,
                    createdAt: fmtDate(created),
                    status: String(v.status || ""),
                    payMethod: String(v.payMethod || ""),
                };
                (v.items || []).forEach((it) => {
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
        }
        catch (e) {
            alert(e?.message || "Error");
        }
    };
    // ---- Export: Movimientos de stock ----
    const exportMovimientos = async () => {
        try {
            const { from, to } = needRange();
            const qy = query(collection(db, "stockMovements"), where("at", ">=", from), where("at", "<", to), orderBy("at", "asc"));
            const snap = await getDocs(qy);
            const rows = snap.docs.map((d) => {
                const v = d.data();
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
        }
        catch (e) {
            alert(e?.message || "Error");
        }
    };
    // ---- Export: Resúmenes diarios ----
    const exportResumenes = async () => {
        try {
            if (!desde || !hasta)
                throw new Error("Selecciona rango");
            const qy = query(collection(db, "dailySummary"), where("date", ">=", desde), where("date", "<=", hasta), orderBy("date", "asc"));
            const snap = await getDocs(qy);
            const rows = snap.docs.map((d) => {
                const v = d.data();
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
        }
        catch (e) {
            alert(e?.message || "Error");
        }
    };
    return (_jsx("main", { className: "p-4 space-y-4", children: _jsxs("div", { className: "rounded-2xl border p-4 bg-white shadow-sm space-y-3", children: [_jsx("div", { className: "font-medium", children: "Exportes" }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("input", { type: "date", className: "border rounded px-2 py-1", value: desde, onChange: (e) => setDesde(e.target.value) }), _jsx("span", { children: "\u2014" }), _jsx("input", { type: "date", className: "border rounded px-2 py-1", value: hasta, onChange: (e) => setHasta(e.target.value) }), _jsx("button", { onClick: exportVentas, className: "rounded-xl bg-orange-600 text-white px-4 py-2", children: "Ventas CSV" }), _jsx("button", { onClick: exportVentasItems, className: "rounded-xl border px-4 py-2", children: "Ventas (detalle \u00EDtems)" }), _jsx("button", { onClick: exportMovimientos, className: "rounded-xl border px-4 py-2", children: "Mov. de stock" }), _jsx("button", { onClick: exportProductos, className: "rounded-xl border px-4 py-2", children: "Productos CSV" }), _jsx("button", { onClick: exportInventario, className: "rounded-xl border px-4 py-2", children: "Inventario CSV" }), _jsx("button", { onClick: exportResumenes, className: "rounded-xl border px-4 py-2", children: "Res\u00FAmenes diarios" })] })] }) }));
}

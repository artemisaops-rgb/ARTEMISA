import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/pages/Caja.tsx
import { useEffect, useState } from "react";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { addCashMovement, getTodayCashSnapshot, dayRange } from "@/lib/cashbox";
import { collection, onSnapshot, orderBy, query, where, } from "firebase/firestore";
const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const fmt = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export default function Caja() {
    const { user } = useAuth();
    const uid = user?.uid ?? null;
    const [type, setType] = useState("in");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [orderId, setOrderId] = useState("");
    const [movs, setMovs] = useState([]);
    const [summary, setSummary] = useState({
        openingCash: 0,
        cashSales: 0,
        inTotal: 0,
        outTotal: 0,
        expectedCash: 0,
    });
    const [loading, setLoading] = useState(false);
    // Live: movimientos de hoy
    useEffect(() => {
        const { from, to } = dayRange();
        const qy = query(collection(db, "cashMovements"), where("at", ">=", from), where("at", "<", to), orderBy("at", "desc"));
        const unsub = onSnapshot(qy, (snap) => {
            const xs = [];
            snap.forEach((d) => {
                const v = d.data();
                xs.push({
                    id: d.id,
                    at: v.at ?? null,
                    type: v.type,
                    amount: Number(v.amount || 0),
                    reason: v.reason ?? null,
                    orderId: v.orderId ?? null,
                });
            });
            setMovs(xs);
        });
        return () => unsub();
    }, []);
    const refreshSummary = async () => {
        const s = await getTodayCashSnapshot(db, uid);
        setSummary(s);
    };
    useEffect(() => {
        refreshSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid]);
    const submit = async () => {
        if (!uid)
            return alert("Debes iniciar sesión");
        try {
            setLoading(true);
            await addCashMovement(db, {
                userId: uid,
                type,
                amount: Number(amount),
                reason: reason || undefined,
                orderId: orderId || undefined,
            });
            setAmount("");
            setReason("");
            setOrderId("");
            await refreshSummary();
        }
        catch (e) {
            alert(e?.message || "No se pudo registrar el movimiento");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "container-app p-6 pb-28 space-y-5", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Caja" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3", children: [_jsxs("div", { className: "bg-white border rounded-2xl p-4", children: [_jsx("div", { className: "text-slate-500", children: "Efectivo inicial" }), _jsx("div", { className: "text-2xl font-semibold", children: money(summary.openingCash) })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4", children: [_jsx("div", { className: "text-slate-500", children: "Ventas (efectivo)" }), _jsx("div", { className: "text-2xl font-semibold", children: money(summary.cashSales) })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4", children: [_jsx("div", { className: "text-slate-500", children: "Ingresos \u2212 Egresos" }), _jsx("div", { className: "text-2xl font-semibold", children: money(summary.inTotal - summary.outTotal) })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4", children: [_jsx("div", { className: "text-slate-500", children: "Efectivo esperado" }), _jsx("div", { className: "text-2xl font-semibold", children: money(summary.expectedCash) })] })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4 space-y-3", children: [_jsx("div", { className: "font-medium", children: "Nuevo movimiento" }), _jsx("div", { className: "flex flex-wrap gap-2", children: ["in", "out"].map((t) => (_jsx("button", { onClick: () => setType(t), className: `px-3 py-1 rounded-xl border ${type === t ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white"}`, children: t === "in" ? "Ingreso" : "Egreso" }, t))) }), _jsxs("div", { className: "grid md:grid-cols-4 gap-3", children: [_jsx("input", { className: "border rounded-xl px-3 py-2", placeholder: "Monto", type: "number", inputMode: "decimal", value: amount, onChange: (e) => setAmount(e.target.value) }), _jsx("input", { className: "border rounded-xl px-3 py-2 md:col-span-2", placeholder: "Motivo (opcional)", value: reason, onChange: (e) => setReason(e.target.value) }), _jsx("input", { className: "border rounded-xl px-3 py-2", placeholder: "OrderId (opcional)", value: orderId, onChange: (e) => setOrderId(e.target.value) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn btn-primary", onClick: submit, disabled: loading || !amount, children: loading ? "Guardando…" : "Registrar" }), _jsx("button", { className: "btn", onClick: refreshSummary, children: "Actualizar resumen" })] })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4 space-y-2", children: [_jsx("div", { className: "font-medium", children: "Movimientos de hoy" }), !movs.length && _jsx("div", { className: "text-slate-500", children: "Sin movimientos." }), movs.map((m) => {
                        const d = m.at && typeof m.at.toDate === "function" ? m.at.toDate() : null;
                        return (_jsxs("div", { className: "flex items-center justify-between border rounded-xl px-3 py-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: `text-xs px-2 py-0.5 rounded-full border ${m.type === "in" ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"}`, children: m.type === "in" ? "Ingreso" : "Egreso" }), _jsx("span", { className: "font-medium", children: money(m.amount) }), m.reason ? _jsxs("span", { className: "text-slate-600 text-sm", children: ["\u00B7 ", m.reason] }) : null, m.orderId ? _jsxs("span", { className: "text-slate-400 text-xs", children: ["\u00B7 ", m.orderId] }) : null] }), _jsx("div", { className: "text-slate-500 text-xs", children: d ? fmt(d) : "" })] }, m.id));
                    })] })] }));
}

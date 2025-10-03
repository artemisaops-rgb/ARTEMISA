import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, where, orderBy, Timestamp, serverTimestamp, setDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/services/firebase";
function dayRange(d = new Date()) {
    const from = new Date(d);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: Timestamp.fromDate(from), to: Timestamp.fromDate(to) };
}
const ymd = (d = new Date()) => d.toISOString().slice(0, 10);
const money = (n) => `$${(n || 0).toLocaleString()}`;
export default function Cierre() {
    const [finalCash, setFinalCash] = useState(0);
    const [totals, setTotals] = useState({
        sales: 0, refunds: 0, cogs: 0, deliveredCount: 0,
        byMethod: { cash: { total: 0, count: 0 }, qr: { total: 0, count: 0 }, card: { total: 0, count: 0 }, other: { total: 0, count: 0 } },
        expectedCash: 0,
    });
    useEffect(() => {
        (async () => {
            const { from, to } = dayRange();
            const qy = query(collection(db, "orders"), where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "asc"));
            const snap = await getDocs(qy);
            let sales = 0, refunds = 0, cogs = 0, deliveredCount = 0, expectedCash = 0;
            const byMethod = {
                cash: { total: 0, count: 0 }, qr: { total: 0, count: 0 }, card: { total: 0, count: 0 }, other: { total: 0, count: 0 }
            };
            snap.forEach((d) => {
                const v = d.data();
                const total = Number(v.total) || 0;
                const status = String(v.status || "");
                const pm = (v.payMethod || "other");
                const c = Number(v.cogs || 0);
                if (status === "delivered") {
                    sales += total;
                    cogs += c;
                    deliveredCount += 1;
                    byMethod[pm].total += total;
                    byMethod[pm].count += 1;
                    if (pm === "cash")
                        expectedCash += total;
                }
                else if (status === "canceled") {
                    refunds += total;
                    if (pm === "cash")
                        expectedCash -= total;
                }
            });
            setTotals({ sales, refunds, cogs, deliveredCount, byMethod, expectedCash });
        })();
    }, []);
    const ticketAvg = useMemo(() => (totals.deliveredCount ? Math.round(totals.sales / totals.deliveredCount) : 0), [totals]);
    const profit = useMemo(() => totals.sales - totals.cogs - totals.refunds, [totals]);
    const cashDiff = useMemo(() => finalCash - totals.expectedCash, [finalCash, totals.expectedCash]);
    const handleClose = async () => {
        const user = getAuth().currentUser;
        const id = ymd();
        await setDoc(doc(db, "dailySummary", id), {
            date: id,
            totals: {
                sales: totals.sales,
                refunds: totals.refunds,
                cogs: totals.cogs,
                deliveredCount: totals.deliveredCount,
                byMethod: totals.byMethod,
                expectedCash: totals.expectedCash,
                ticketAvg,
                profit
            },
            finalCash,
            cashDiff,
            user: user ? user.uid : null,
            createdAt: serverTimestamp()
        }, { merge: true });
        alert("Cierre de caja registrado ✨");
        setFinalCash(0);
    };
    return (_jsxs("div", { className: "container-app p-6 pb-28", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Cierre de caja" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mb-6", children: [_jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-slate-500", children: "Ventas (entregadas)" }), _jsx("div", { className: "text-3xl font-semibold", children: money(totals.sales) }), _jsxs("div", { className: "text-xs text-slate-500", children: [totals.deliveredCount, " tickets \u00B7 prom ", money(ticketAvg)] })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-slate-500", children: "Devoluciones (anuladas)" }), _jsx("div", { className: "text-3xl font-semibold", children: money(totals.refunds) })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-slate-500", children: "Costos (COGS)" }), _jsx("div", { className: "text-3xl font-semibold", children: money(totals.cogs) })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-slate-500", children: "Ganancia estimada" }), _jsx("div", { className: "text-3xl font-semibold", children: money(profit) })] })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-lg font-semibold mb-2", children: "Por m\u00E9todo (entregadas)" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Efectivo" }), _jsxs("span", { children: [_jsx("b", { children: money(totals.byMethod.cash.total) }), " (", totals.byMethod.cash.count, ")"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "QR" }), _jsxs("span", { children: [_jsx("b", { children: money(totals.byMethod.qr.total) }), " (", totals.byMethod.qr.count, ")"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Tarjeta" }), _jsxs("span", { children: [_jsx("b", { children: money(totals.byMethod.card.total) }), " (", totals.byMethod.card.count, ")"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Otro" }), _jsxs("span", { children: [_jsx("b", { children: money(totals.byMethod.other.total) }), " (", totals.byMethod.other.count, ")"] })] })] })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4 max-w-md", children: [_jsxs("div", { className: "text-sm text-slate-500 mb-1", children: ["Efectivo esperado hoy: ", _jsx("b", { children: money(totals.expectedCash) })] }), _jsx("label", { className: "block text-sm mb-1", children: "Efectivo final contado" }), _jsx("input", { type: "number", value: finalCash, onChange: (e) => setFinalCash(Number(e.target.value)), className: "w-full border rounded-lg px-3 py-2 mb-2" }), _jsxs("div", { className: `text-sm mb-3 ${cashDiff === 0 ? "text-green-600" : cashDiff > 0 ? "text-amber-600" : "text-red-600"}`, children: ["Diferencia: ", _jsx("b", { children: money(cashDiff) })] }), _jsx("button", { onClick: handleClose, className: "w-full py-2 rounded-xl bg-[var(--brand,#f97316)] text-white", children: "Cerrar caja" })] })] }));
}

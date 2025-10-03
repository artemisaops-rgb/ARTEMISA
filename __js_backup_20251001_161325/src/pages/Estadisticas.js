import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/pages/Estadisticas.tsx
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, PieChart, Pie } from "recharts";
export default function Estadisticas() {
    const db = getFirestore();
    const [data, setData] = useState({ today: 0, week: 0, cogs: 0, margin: 0 });
    const [series7d, setSeries7d] = useState([]);
    const [series30d, setSeries30d] = useState([]);
    const [payDonut, setPayDonut] = useState([]);
    const [bep, setBep] = useState({ fixed: 0, margin30d: 0 });
    useEffect(() => {
        (async () => {
            const snaps = await getDocs(collection(db, "orders"));
            const now = new Date();
            const dayStart = new Date(now);
            dayStart.setHours(0, 0, 0, 0);
            const wd = (now.getDay() + 6) % 7;
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - wd);
            weekStart.setHours(0, 0, 0, 0);
            // helpers 7d & 30d
            const mkDays = (n) => {
                const arr = [];
                const map = {};
                for (let i = n - 1; i >= 0; i--) {
                    const d = new Date(now);
                    d.setDate(now.getDate() - i);
                    d.setHours(0, 0, 0, 0);
                    const key = d.toISOString().slice(5, 10); // "MM-DD"
                    arr.push({ day: key, sales: 0 });
                    map[key] = 0;
                }
                return { arr, map };
            };
            const d7 = mkDays(7);
            const d30 = mkDays(30);
            let today = 0, week = 0;
            let pay = { cash: 0, card: 0, other: 0 };
            let sum30 = 0;
            snaps.forEach(s => {
                const v = s.data();
                const total = Number(v.total) || 0;
                let ts = 0;
                const ca = v.createdAt ?? v.at;
                if (ca?.toMillis)
                    ts = ca.toMillis();
                else if (typeof ca === "number")
                    ts = ca;
                else if (typeof ca === "string")
                    ts = Date.parse(ca);
                if (!ts)
                    return;
                const d = new Date(ts);
                d.setHours(0, 0, 0, 0);
                const key = d.toISOString().slice(5, 10);
                if (key in d7.map)
                    d7.map[key] += total;
                if (key in d30.map) {
                    d30.map[key] += total;
                    sum30 += total;
                }
                if (ts >= dayStart.getTime())
                    today += total;
                if (ts >= weekStart.getTime())
                    week += total;
                const pm = String(v.payMethod || "other");
                pay[pm] += total;
            });
            const cogs = Math.round(week * 0.35);
            const margin = week - cogs;
            setData({ today, week, cogs, margin });
            setSeries7d(d7.arr.map(d => ({ day: d.day, sales: d7.map[d.day] })));
            setSeries30d(d30.arr.map(d => ({ day: d.day, sales: d30.map[d.day] })));
            setPayDonut([
                { name: "Efectivo", value: pay.cash },
                { name: "Tarjeta", value: pay.card },
                { name: "Otros", value: pay.other },
            ]);
            // BEP (fixed monthly from settings/fixedCosts.monthly)
            let fixed = 0;
            try {
                const docSnap = await getDoc(doc(db, "settings", "fixedCosts"));
                fixed = Number(docSnap.data()?.monthly || 0);
            }
            catch { }
            const margin30d = Math.round(sum30 - sum30 * 0.35);
            setBep({ fixed, margin30d });
        })();
    }, []);
    const totalsBar = useMemo(() => ([
        { name: "Ventas", value: data.week },
        { name: "COGS", value: data.cogs },
        { name: "Margen", value: data.margin },
    ]), [data]);
    const Card = ({ t, v }) => (_jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "text-slate-500", children: t }), _jsxs("div", { className: "text-2xl font-semibold", children: ["$", v.toLocaleString()] })] }));
    return (_jsxs("div", { className: "container-app p-6 pb-28 space-y-6", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Estad\u00EDsticas" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4", children: [_jsx(Card, { t: "Ventas hoy", v: data.today }), _jsx(Card, { t: "Ventas semana", v: data.week }), _jsx(Card, { t: "COGS (estimado)", v: data.cogs }), _jsx(Card, { t: "Margen (estimado)", v: data.margin })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "mb-2 font-medium", children: "Ventas \u00FAltimos 30 d\u00EDas" }), _jsx("div", { style: { width: "100%", height: 260 }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { data: series30d, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "day" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Line, { type: "monotone", dataKey: "sales" })] }) }) })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "mb-2 font-medium", children: "M\u00E9todos de pago" }), _jsx("div", { style: { width: "100%", height: 260 }, children: _jsx(ResponsiveContainer, { children: _jsxs(PieChart, { children: [_jsx(Pie, { data: payDonut, dataKey: "value", nameKey: "name", innerRadius: 60, outerRadius: 100 }), _jsx(Tooltip, {}), _jsx(Legend, {})] }) }) })] })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "mb-2 font-medium", children: "Semana: Ventas / COGS / Margen" }), _jsx("div", { style: { width: "100%", height: 260 }, children: _jsx(ResponsiveContainer, { children: _jsxs(BarChart, { data: totalsBar, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "name" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "value", name: "Monto" })] }) }) })] }), _jsxs("div", { className: "bg-white rounded-2xl border p-4", children: [_jsx("div", { className: "font-medium mb-1", children: "Punto de equilibrio (mensual)" }), _jsxs("div", { className: "text-sm text-slate-600 mb-2", children: ["Costos fijos: $", bep.fixed.toLocaleString()] }), _jsxs("div", { className: "text-sm", children: ["Margen \u00FAltimos 30d: ", _jsxs("b", { children: ["$", bep.margin30d.toLocaleString()] })] }), _jsx("div", { className: "text-sm", children: bep.margin30d >= bep.fixed
                            ? "✅ ¡Cubriste tus fijos este mes!"
                            : `⏳ Te faltan $${(bep.fixed - bep.margin30d).toLocaleString()} para cubrir los fijos.` })] })] }));
}

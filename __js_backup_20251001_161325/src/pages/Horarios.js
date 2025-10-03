import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/pages/Horarios.tsx
import { useEffect, useMemo, useState } from "react";
import { getFirestore, collection, doc, onSnapshot, serverTimestamp, addDoc, deleteDoc, } from "firebase/firestore";
import { useAuth } from "@/contexts/Auth";
const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;
const ROW_H = 64;
function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function getMonday(d) {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const x = new Date(d);
    x.setDate(d.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function hoursArray() {
    const xs = [];
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++)
        xs.push(`${String(h).padStart(2, "0")}:00`);
    return xs;
}
function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}
function clampBlock(start, end) {
    const s = Math.max(toMinutes(start), OPEN_HOUR * 60);
    const e = Math.max(s + 30, Math.min(toMinutes(end), CLOSE_HOUR * 60));
    return [s, e];
}
function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++)
    h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0) % 360; }
function colorForUid(uid) {
    const hue = hashHue(uid);
    return {
        bg: `hsla(${hue}, 90%, 55%, .16)`,
        bd: `hsl(${hue}, 85%, 52%)`,
        txt: `hsl(${hue}, 60%, 26%)`,
    };
}
export default function Horarios() {
    const db = getFirestore();
    const { user } = useAuth();
    const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
    const hours = useMemo(() => hoursArray(), []);
    const [week, setWeek] = useState({});
    // ⬇️ OJO: schedules/{date}/blocks  (3 segmentos → colección válida)
    useEffect(() => {
        const unsubs = days.map((d) => {
            const date = fmtDate(d);
            const col = collection(db, "schedules", date, "blocks");
            return onSnapshot(col, (snap) => {
                const arr = [];
                snap.forEach((x) => arr.push({ id: x.id, data: x.data() }));
                setWeek(prev => ({ ...prev, [date]: arr }));
            });
        });
        return () => unsubs.forEach(u => u && u());
    }, [db, days]);
    const [sheet, setSheet] = useState({ open: false, dayIdx: 0, start: "08:00", end: "12:00", note: "" });
    const openNew = (dayIdx = 0, hh = 8) => setSheet({ open: true, dayIdx, start: `${String(hh).padStart(2, "0")}:00`, end: `${String(Math.min(hh + 4, CLOSE_HOUR)).padStart(2, "0")}:00`, note: "" });
    const createBlock = async () => {
        if (!user?.uid)
            return;
        const d = days[sheet.dayIdx];
        const date = fmtDate(d);
        const [sMin, eMin] = clampBlock(sheet.start, sheet.end);
        const start = `${String(Math.floor(sMin / 60)).padStart(2, "0")}:${String(sMin % 60).padStart(2, "0")}`;
        const end = `${String(Math.floor(eMin / 60)).padStart(2, "0")}:${String(eMin % 60).padStart(2, "0")}`;
        await addDoc(collection(db, "schedules", date, "blocks"), {
            uid: user.uid,
            userName: user.displayName || (user.email ? user.email.split("@")[0] : "usuario"),
            start, end,
            note: sheet.note.trim() || null,
            updatedAt: serverTimestamp(),
        });
        setSheet(s => ({ ...s, open: false }));
    };
    const tryDelete = async (date, id, ownerUid) => {
        if (!user?.uid || user.uid !== ownerUid)
            return;
        if (!window.confirm("¿Eliminar este bloque?"))
            return;
        await deleteDoc(doc(db, "schedules", date, "blocks", id));
    };
    return (_jsxs("div", { className: "max-w-5xl mx-auto p-4", style: { paddingBottom: "var(--bottom-bar-space,160px)" }, children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-3", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Horarios" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { className: "btn btn-sm", onClick: () => setWeekStart(addDays(weekStart, -7)), children: "\u2190 Semana anterior" }), _jsx("button", { className: "btn btn-sm", onClick: () => setWeekStart(getMonday(new Date())), children: "Esta semana" }), _jsx("button", { className: "btn btn-sm", onClick: () => setWeekStart(addDays(weekStart, +7)), children: "Semana siguiente \u2192" })] })] }), _jsx(Legend, { week: week }), _jsx(WeekGrid, { days: days, hours: hours, week: week, onDelete: tryDelete }), _jsx("button", { className: "fixed right-5 bottom-[calc(20px+var(--bottom-bar-space,160px))] rounded-full shadow-xl", style: { background: "linear-gradient(180deg,var(--brand,#ff7a1a), var(--brand-600,#ea580c))", color: "#fff", width: 56, height: 56, display: "grid", placeItems: "center" }, onClick: () => openNew(0, 8), title: "Nuevo bloque", children: "+" }), sheet.open && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center", onClick: (e) => { if (e.target === e.currentTarget)
                    setSheet(s => ({ ...s, open: false })); }, children: _jsxs("div", { className: "bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-3", style: { marginBottom: "var(--bottom-bar-space,160px)" }, children: [_jsx("div", { className: "font-semibold text-lg", children: "Nuevo bloque" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsx("label", { className: "label", children: "D\u00EDa" }), _jsx("select", { className: "input", value: sheet.dayIdx, onChange: (e) => setSheet(s => ({ ...s, dayIdx: Number(e.target.value) })), children: days.map((d, i) => (_jsxs("option", { value: i, children: [DAYS_ES[i], " ", fmtDate(d)] }, i))) }), _jsx("label", { className: "label", children: "Inicio" }), _jsx("input", { type: "time", className: "input", step: 900, min: `${String(OPEN_HOUR).padStart(2, "0")}:00`, max: `${String(CLOSE_HOUR).padStart(2, "0")}:00`, value: sheet.start, onChange: (e) => setSheet(s => ({ ...s, start: e.target.value })) }), _jsx("label", { className: "label", children: "Fin" }), _jsx("input", { type: "time", className: "input", step: 900, min: `${String(OPEN_HOUR).padStart(2, "0")}:15`, max: `${String(CLOSE_HOUR).padStart(2, "0")}:00`, value: sheet.end, onChange: (e) => setSheet(s => ({ ...s, end: e.target.value })) })] }), _jsx("label", { className: "label", children: "Nota (opcional)" }), _jsx("input", { className: "input", placeholder: "Ej. turno ma\u00F1ana, entrega, etc.", value: sheet.note, onChange: (e) => setSheet(s => ({ ...s, note: e.target.value })) }), _jsxs("div", { className: "hstack", style: { gap: 8 }, children: [_jsx("button", { className: "btn flex-1", onClick: () => setSheet(s => ({ ...s, open: false })), children: "Cancelar" }), _jsx("button", { className: "btn btn-primary flex-1", onClick: createBlock, children: "Guardar" })] })] }) }))] }));
}
function WeekGrid({ days, hours, week, onDelete }) {
    const dayColStyle = { position: "relative", borderLeft: "1px solid var(--border)", overflow: "hidden" };
    return (_jsxs("div", { className: "w-full overflow-auto", style: { borderRadius: 16, border: "1px solid var(--border)", background: "#fff" }, children: [_jsxs("div", { className: "grid", style: { gridTemplateColumns: "80px repeat(7, minmax(140px,1fr))" }, children: [_jsx("div", { className: "px-3 py-3 text-sm font-semibold bg-slate-50 border-b border-[var(--border)]", children: "Hora" }), days.map((d, i) => (_jsxs("div", { className: "px-3 py-3 text-sm font-semibold bg-slate-50 border-b border-l border-[var(--border)]", style: { whiteSpace: "nowrap" }, children: [DAYS_ES[i], " ", _jsx("span", { className: "text-slate-500", children: fmtDate(d) })] }, i)))] }), _jsxs("div", { className: "grid", style: { gridTemplateColumns: "80px repeat(7, minmax(140px,1fr))" }, children: [_jsx("div", { className: "border-r border-[var(--border)]", children: hours.map((h) => (_jsx("div", { style: { height: ROW_H, borderTop: "1px solid var(--border)", padding: "6px 10px", fontSize: 12, color: "#475569" }, children: h }, h))) }), days.map((d) => {
                        const date = fmtDate(d);
                        const blocks = (week[date] || []).slice().sort((a, b) => toMinutes(a.data.start) - toMinutes(b.data.start));
                        return (_jsxs("div", { style: dayColStyle, children: [hours.map((h, idx) => (_jsx("div", { style: { position: "absolute", left: 0, right: 0, top: idx * ROW_H, height: ROW_H, borderTop: "1px solid var(--border)" } }, h))), blocks.map(({ id, data }) => {
                                    const [sMin, eMin] = clampBlock(data.start, data.end);
                                    const top = ((sMin - OPEN_HOUR * 60) / 60) * ROW_H;
                                    const height = ((eMin - sMin) / 60) * ROW_H - 6;
                                    const { bg, bd, txt } = colorForUid(data.uid);
                                    return (_jsxs("div", { onClick: () => onDelete(date, id, data.uid), title: `${data.userName || "Usuario"} · ${data.start}–${data.end}${data.note ? " · " + data.note : ""}\nToca para eliminar si es tuyo.`, style: { position: "absolute", left: 8, right: 8, top, height,
                                            background: bg, border: `1.5px solid ${bd}`, color: txt,
                                            borderRadius: 12, padding: "8px 10px", overflow: "hidden",
                                            display: "flex", flexDirection: "column", justifyContent: "space-between",
                                            cursor: "pointer", backdropFilter: "saturate(1.1)" }, children: [_jsx("div", { className: "text-[12px] font-semibold leading-none", children: data.userName || "Usuario" }), _jsxs("div", { className: "text-[11px] leading-3 opacity-80", children: [data.start, " \u2013 ", data.end, data.note ? ` · ${data.note}` : ""] })] }, id));
                                })] }, date));
                    })] })] }));
}
function Legend({ week }) {
    const users = useMemo(() => {
        const m = new Map();
        for (const arr of Object.values(week)) {
            for (const { data } of arr) {
                if (!m.has(data.uid))
                    m.set(data.uid, data.userName || undefined);
            }
        }
        return Array.from(m.entries()).map(([uid, name]) => ({ uid, name }));
    }, [week]);
    if (!users.length)
        return null;
    return (_jsx("div", { className: "card mb-3", style: { padding: 10, display: "flex", gap: 8, flexWrap: "wrap" }, children: users.map(({ uid, name }) => {
            const { bg, bd, txt } = colorForUid(uid);
            return (_jsxs("span", { className: "text-sm", style: { background: bg, border: `1px solid ${bd}`, color: txt, padding: "4px 8px", borderRadius: 999 }, children: ["\u25CF ", name || "Usuario"] }, uid));
        }) }));
}

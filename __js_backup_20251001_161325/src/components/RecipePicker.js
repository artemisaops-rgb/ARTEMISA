import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
export default function RecipePicker({ productId, value, onChange, }) {
    const db = getFirestore();
    const [open, setOpen] = useState(false);
    const [inv, setInv] = useState([]);
    const [q, setQ] = useState("");
    const [grams, setGrams] = useState(0);
    useEffect(() => {
        (async () => {
            const snap = await getDocs(collection(db, "inventory"));
            const list = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
            setInv(list);
        })();
    }, []);
    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t)
            return [];
        return inv.filter((i) => (i.name || i.id).toLowerCase().includes(t)).slice(0, 10);
    }, [inv, q]);
    const add = (id) => {
        if (!id || !Number.isFinite(grams) || grams <= 0)
            return;
        onChange({ ...value, [id]: grams });
        setQ("");
        setGrams(0);
    };
    const remove = (id) => {
        const copy = { ...value };
        delete copy[id];
        onChange(copy);
    };
    const entries = Object.entries(value);
    return (_jsxs("div", { className: "mt-3 border rounded-xl", children: [_jsxs("button", { type: "button", onClick: () => setOpen((o) => !o), className: "w-full flex items-center justify-between px-4 py-3", children: [_jsx("span", { className: "font-semibold", children: "Receta" }), _jsx("span", { className: "text-xs text-slate-500", children: open ? "Ocultar" : "Editar" })] }), open && (_jsxs("div", { className: "px-4 pb-4", children: [_jsxs("div", { className: "flex flex-col md:flex-row gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { className: "w-full border rounded-lg px-3 py-2", placeholder: "Buscar insumo...", value: q, onChange: (e) => setQ(e.target.value) }), q && filtered.length > 0 && (_jsx("div", { className: "absolute z-10 left-0 right-0 mt-1 border rounded-lg bg-white max-h-44 overflow-auto", children: filtered.map((i) => (_jsxs("div", { className: "px-3 py-2 hover:bg-slate-50 cursor-pointer", onClick: () => setQ(i.name || i.id), children: [i.name || i.id, " ", _jsxs("span", { className: "text-xs text-slate-400", children: ["(", i.id, ")"] })] }, i.id))) }))] }), _jsx("input", { type: "number", className: "w-28 border rounded-lg px-3 py-2", placeholder: "g/ml/u", value: grams || "", onChange: (e) => setGrams(Number(e.target.value)) }), _jsx("button", { type: "button", className: "px-4 py-2 rounded-lg bg-[var(--brand,#f97316)] text-white", onClick: () => {
                                    // si escribió el nombre, buscar id
                                    const match = inv.find((i) => (i.name || i.id).toLowerCase() === q.trim().toLowerCase());
                                    add(match ? match.id : q.trim());
                                }, children: "A\u00F1adir" })] }), _jsx("div", { className: "mt-3 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-slate-500", children: [_jsx("th", { className: "py-2", children: "Ingrediente" }), _jsx("th", { className: "py-2 w-32", children: "Cantidad" }), _jsx("th", { className: "py-2 w-20" })] }) }), _jsxs("tbody", { children: [entries.length === 0 && (_jsx("tr", { children: _jsx("td", { className: "py-2 text-slate-500", colSpan: 3, children: "Sin insumos todav\u00EDa." }) })), entries.map(([id, g]) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "py-2", children: inv.find((i) => i.id === id)?.name || id }), _jsx("td", { className: "py-2", children: _jsx("input", { type: "number", className: "w-28 border rounded-lg px-2 py-1", value: g, onChange: (e) => onChange({ ...value, [id]: Number(e.target.value) }) }) }), _jsx("td", { className: "py-2", children: _jsx("button", { className: "text-red-600", onClick: () => remove(id), children: "Quitar" }) })] }, id)))] })] }) })] }))] }));
}

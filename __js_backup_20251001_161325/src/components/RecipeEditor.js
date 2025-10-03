import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { safeUpdate } from "@/lib/safeUpdate";
export default function RecipeEditor({ product }) {
    const db = getFirestore();
    const [inventory, setInventory] = useState([]);
    const [query, setQuery] = useState("");
    const [grams, setGrams] = useState(0);
    const [selected, setSelected] = useState(null);
    useEffect(() => {
        (async () => {
            const snap = await getDocs(collection(db, "inventory"));
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            setInventory(list);
        })();
    }, []);
    const filtered = useMemo(() => inventory.filter(i => (i.name ?? i.id).toLowerCase().includes(query.toLowerCase())), [inventory, query]);
    const add = async () => {
        if (!selected || !Number.isFinite(grams) || grams <= 0)
            return;
        const recipe = { ...(product.recipe || {}), [selected.id]: grams };
        await safeUpdate(`products/${product.id}`, { recipe });
        setSelected(null);
        setQuery("");
        setGrams(0);
    };
    const remove = async (id) => {
        const r = { ...(product.recipe || {}) };
        delete r[id];
        await safeUpdate(`products/${product.id}`, { recipe: r });
    };
    const entries = Object.entries(product.recipe || {});
    return (_jsxs("div", { className: "mt-3 p-3 rounded-xl border bg-slate-50", children: [_jsx("div", { className: "font-medium mb-2", children: "Receta" }), _jsxs("div", { className: "flex gap-2 mb-2", children: [_jsx("input", { value: query, onChange: e => setQuery(e.target.value), placeholder: "Buscar insumo...", className: "flex-1 border rounded-lg px-3 py-2" }), _jsx("input", { value: grams || "", onChange: e => setGrams(Number(e.target.value)), type: "number", placeholder: "g/ml/u", className: "w-32 border rounded-lg px-3 py-2" }), _jsx("button", { onClick: add, className: "px-3 py-2 rounded-lg bg-orange-500 text-white", children: "A\u00EF\u00BF\u00BDadir" })] }), query && (_jsx("div", { className: "max-h-40 overflow-auto border rounded-lg bg-white", children: filtered.map(i => (_jsxs("div", { className: "px-3 py-2 hover:bg-slate-50 cursor-pointer", onClick: () => { setSelected(i); setQuery(i.name || i.id); }, children: [(i.name || i.id), " ", _jsxs("span", { className: "text-slate-400 text-xs", children: ["(", i.id, ")"] })] }, i.id))) })), _jsxs("div", { className: "mt-3 space-y-2", children: [entries.length === 0 && _jsx("div", { className: "text-slate-500 text-sm", children: "Sin insumos a\u00EF\u00BF\u00BDn." }), entries.map(([id, g]) => (_jsxs("div", { className: "flex items-center justify-between bg-white border rounded-lg px-3 py-2", children: [_jsx("div", { className: "text-sm", children: id }), _jsxs("div", { className: "text-sm text-slate-600", children: [g, " g/ml/u"] }), _jsx("button", { onClick: () => remove(id), className: "text-red-600 text-sm", children: "Quitar" })] }, id)))] })] }));
}

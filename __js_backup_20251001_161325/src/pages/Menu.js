import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query as fsQuery } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useCart } from "@/contexts/CartContext";
const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"];
export default function Menu() {
    const { addProduct } = useCart();
    const [raw, setRaw] = useState([]);
    const [q, setQ] = useState("");
    const [cat, setCat] = useState(CATS[0]);
    const [onlyActive, setOnlyActive] = useState(false);
    const [chooser, setChooser] = useState(null);
    useEffect(() => {
        const qy = fsQuery(collection(db, "products"), orderBy("name"));
        const unsub = onSnapshot(qy, (snap) => {
            const list = [];
            snap.forEach((d) => {
                const x = d.data();
                list.push({
                    id: d.id,
                    name: String(x.name ?? ""),
                    price: Number(x.price) || 0,
                    active: Boolean(x.active),
                    photoUrl: x.photoUrl ?? "",
                    category: String(x.category ?? ""),
                    recipe: x.recipe ?? {},
                    sizes: Array.isArray(x.sizes) ? x.sizes : [],
                });
            });
            setRaw(list);
        });
        return () => unsub();
    }, []);
    const products = useMemo(() => {
        const text = q.trim().toLowerCase();
        return raw
            .filter((p) => (onlyActive ? p.active : true))
            .filter((p) => String(p.category ?? "").toLowerCase() === cat)
            .filter((p) => p.name.toLowerCase().includes(text));
    }, [raw, q, cat, onlyActive]);
    const onAdd = (p) => {
        const hasSizes = (p.sizes?.length ?? 0) > 0;
        if (hasSizes) {
            setChooser(p);
            return;
        }
        addProduct({
            // id de línea = productId (sin tamaño)
            id: p.id,
            name: p.name,
            price: Number(p.price) || 0,
            qty: 1,
            recipe: p.recipe || {},
            sizeId: "",
            sizeName: "",
        });
    };
    const sizeName = (s, idx) => String(s?.name ?? s?.label ?? `tamaño ${idx + 1}`);
    const sizeKey = (s, idx) => String(s?.id ?? s?.name ?? s?.label ?? idx);
    return (_jsxs("div", { className: "max-w-5xl mx-auto p-4 space-y-4", style: { paddingBottom: "var(--bottom-bar-space, 160px)" }, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { className: "flex-1 border rounded-xl px-4 py-3", placeholder: "Buscar productos...", value: q, onChange: (e) => setQ(e.target.value) }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: onlyActive, onChange: (e) => setOnlyActive(e.target.checked) }), "Solo activos"] })] }), _jsx("div", { className: "flex gap-2 overflow-auto no-scrollbar", children: CATS.map((c) => (_jsx("button", { onClick: () => setCat(c), className: "px-3 py-1 rounded-full border whitespace-nowrap " +
                        (cat === c
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-white"), children: c }, c))) }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4", children: [products.map((p) => {
                        const hasSizes = (p.sizes?.length ?? 0) > 0;
                        return (_jsxs("div", { className: "bg-white border rounded-2xl overflow-hidden flex flex-col", children: [p.photoUrl ? (_jsx("img", { src: p.photoUrl, alt: p.name, className: "h-40 w-full object-cover" })) : (_jsx("div", { className: "h-40 w-full bg-slate-100 flex items-center justify-center text-slate-400", children: "Sin foto" })), _jsxs("div", { className: "p-3 flex-1 flex flex-col", children: [_jsx("div", { className: "font-semibold", children: p.name }), _jsx("div", { className: "text-sm text-slate-600 mt-1", children: hasSizes
                                                ? "Con tamaños"
                                                : `$${Number(p.price || 0).toLocaleString()}` }), _jsx("div", { className: "mt-auto pt-3", children: _jsx("button", { onClick: () => onAdd(p), className: "w-full rounded-xl bg-[var(--brand,#f97316)] text-white py-2", children: "A\u00F1adir" }) })] })] }, p.id));
                    }), products.length === 0 && (_jsx("div", { className: "text-sm text-slate-500", children: "Sin resultados." }))] }), _jsx("div", { "aria-hidden": true, style: { height: 8 } }), chooser && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center", onClick: (e) => {
                    if (e.target === e.currentTarget)
                        setChooser(null);
                }, children: _jsxs("div", { className: "bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-3 max-h-[85vh] overflow-auto md:mb-0", style: { marginBottom: "var(--bottom-bar-space, 160px)" }, children: [_jsx("div", { className: "font-semibold text-lg", children: "Elegir tama\u00F1o" }), _jsx("div", { className: "space-y-2", children: (chooser.sizes || []).map((s, idx) => {
                                const displayName = sizeName(s, idx);
                                const key = sizeKey(s, idx);
                                const price = Number(s?.price || 0);
                                return (_jsxs("button", { onClick: () => {
                                        // id de línea único (producto+tamaño) para el carrito,
                                        // pero Carrito lo normaliza antes de crear la orden (ver parche abajo)
                                        addProduct({
                                            id: `${chooser.id}:${key}`,
                                            name: chooser.name,
                                            sizeId: String(key),
                                            sizeName: displayName,
                                            price,
                                            qty: 1,
                                            recipe: s?.recipe || {},
                                        });
                                        setChooser(null);
                                    }, className: "w-full border rounded-xl px-4 py-3 flex items-center justify-between hover:bg-slate-50", children: [_jsx("span", { className: "font-medium", children: displayName }), _jsxs("span", { className: "text-slate-600", children: ["$", price.toLocaleString()] })] }, `${chooser.id}-${key}`));
                            }) }), _jsx("button", { className: "w-full py-2 border rounded-xl", onClick: () => setChooser(null), children: "Cancelar" })] }) }))] }));
}

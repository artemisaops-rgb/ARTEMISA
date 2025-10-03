import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, orderBy, query as fsQuery, setDoc, deleteDoc, addDoc, serverTimestamp, } from "firebase/firestore";
import { db } from "@/services/firebase";
const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"];
const emptyProduct = () => ({ id: "", name: "", category: "frappes", active: true, sizes: [] });
export default function Productos() {
    const [items, setItems] = useState([]);
    const [qtext, setQtext] = useState("");
    const [cat, setCat] = useState(CATS[0]);
    const [open, setOpen] = useState(null);
    const [saving, setSaving] = useState(false);
    // NUEVO: control por producto para mostrar/ocultar la lista de tamaños
    const [sizesOpen, setSizesOpen] = useState({});
    const isSizesOpen = (productId) => sizesOpen[productId] ?? true;
    const toggleSizes = (productId) => setSizesOpen((m) => ({ ...m, [productId]: !(m[productId] ?? true) }));
    useEffect(() => {
        (async () => {
            const snap = await getDocs(fsQuery(collection(db, "products"), orderBy("name")));
            const list = snap.docs.map((d) => {
                const x = d.data();
                const sizes = (x.sizes || []).map((s, i) => ({
                    id: String(s.id ?? i + 1),
                    name: String(s.name ?? ""),
                    price: Number(s.price || 0),
                    recipe: (s.recipe || {}),
                }));
                return {
                    id: d.id,
                    name: String(x.name ?? ""),
                    category: String(x.category ?? "frappes"),
                    active: !!x.active,
                    sizes,
                };
            });
            setItems(list);
        })();
    }, []);
    const filtered = useMemo(() => {
        const t = qtext.trim().toLowerCase();
        return items.filter((p) => p.category === cat).filter((p) => p.name.toLowerCase().includes(t));
    }, [items, qtext, cat]);
    const upsert = async (p) => {
        setSaving(true);
        try {
            const payload = {
                name: p.name,
                category: p.category,
                active: !!p.active,
                sizes: (p.sizes || []).map((s, i) => ({
                    id: String(s.id ?? i + 1),
                    name: s.name,
                    price: Number(s.price || 0),
                    recipe: s.recipe || {},
                })),
                updatedAt: serverTimestamp(),
            };
            let id = p.id;
            if (!id) {
                const ref = await addDoc(collection(db, "products"), payload);
                id = ref.id;
            }
            else {
                await setDoc(doc(db, "products", id), payload, { merge: true });
            }
            setItems((cur) => {
                const next = cur.filter((x) => x.id !== id);
                return [...next, { ...p, id }].sort((a, b) => a.name.localeCompare(b.name));
            });
            setOpen(null);
        }
        finally {
            setSaving(false);
        }
    };
    const remove = async (id) => {
        if (!confirm("¿Eliminar producto?"))
            return;
        await deleteDoc(doc(db, "products", id));
        setItems((cur) => cur.filter((x) => x.id !== id));
    };
    return (_jsxs("main", { className: "container-app p-6 pb-28 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Productos" }), _jsx("button", { className: "btn", onClick: () => {
                            const draft = { ...emptyProduct(), id: crypto.randomUUID(), name: "Nuevo producto" };
                            setItems((cur) => [draft, ...cur]);
                            setOpen(draft.id);
                        }, children: "Nuevo" })] }), _jsx("div", { className: "flex gap-2 overflow-auto pb-1", children: CATS.map((c) => (_jsx("button", { onClick: () => setCat(c), className: "px-3 py-1 rounded-full border whitespace-nowrap " +
                        (cat === c ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white"), children: c }, c))) }), _jsx("div", { className: "flex items-center gap-2", children: _jsx("input", { className: "input flex-1", placeholder: "Buscar producto\u2026", value: qtext, onChange: (e) => setQtext(e.target.value) }) }), _jsx("ul", { className: "space-y-3", children: filtered.map((p) => (_jsxs("li", { className: "rounded-2xl border bg-white", children: [_jsxs("div", { className: "px-4 py-3 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium", children: p.name || "(sin nombre)" }), _jsxs("div", { className: "text-xs text-slate-500", children: [p.active ? "Activo" : "Inactivo", " \u00B7 ", p.sizes.length, " tama\u00F1o(s)"] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { className: "btn btn-ghost", onClick: () => setOpen(p.id), children: "Editar" }), p.id && (_jsx("button", { className: "btn btn-danger", onClick: () => remove(p.id), children: "Eliminar" }))] })] }), open === p.id && (_jsx(ProductEditor, { p: p, isSizesOpen: isSizesOpen, toggleSizes: toggleSizes, setItems: setItems, onCancel: () => setOpen(null), onSave: () => upsert(p), saving: saving }))] }, p.id))) })] }));
}
function ProductEditor({ p, isSizesOpen, toggleSizes, setItems, onCancel, onSave, saving }) {
    return (_jsxs("div", { className: "border-t bg-slate-50/50 px-4 pb-4 space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: "Nombre" }), _jsx("input", { className: "input", value: p.name, onChange: (e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x))) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Categor\u00EDa" }), _jsx("select", { className: "input", value: p.category, onChange: (e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, category: e.target.value } : x))), children: CATS.map((c) => (_jsx("option", { value: c, children: c }, c))) })] }), _jsx("div", { className: "flex items-end", children: _jsxs("label", { className: "inline-flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: p.active, onChange: (e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x))) }), "Activo"] }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "font-medium", children: "Tama\u00F1os" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn btn-ghost", onClick: () => toggleSizes(p.id), children: isSizesOpen(p.id) ? "Ocultar tamaños" : "Mostrar tamaños" }), _jsx("button", { className: "btn btn-ghost", onClick: () => {
                                            const s = { id: crypto.randomUUID(), name: "nuevo", price: 0, recipe: {} };
                                            setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, sizes: [...x.sizes, s] } : x)));
                                        }, children: "A\u00F1adir tama\u00F1o" })] })] }), !isSizesOpen(p.id) && (_jsxs("div", { className: "flex flex-wrap gap-2", children: [p.sizes.map((s) => (_jsxs("span", { className: "px-2 py-1 rounded-full border text-xs text-slate-700 bg-white", title: `Precio: $${Number(s.price || 0).toLocaleString()}`, children: [s.name, " \u00B7 $", Number(s.price || 0).toLocaleString()] }, s.id))), p.sizes.length === 0 && (_jsx("span", { className: "text-sm text-slate-500", children: "Sin tama\u00F1os." }))] })), isSizesOpen(p.id) && (_jsxs(_Fragment, { children: [p.sizes.length === 0 && _jsx("div", { className: "text-sm text-slate-500", children: "Sin tama\u00F1os." }), _jsx("div", { className: "space-y-3", children: p.sizes.map((s) => (_jsx(SizeEditor, { p: p, s: s, setItems: setItems }, s.id))) })] }))] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { className: "btn", onClick: onCancel, children: "Cancelar" }), _jsx("button", { className: "btn btn-primary", disabled: saving, onClick: onSave, children: saving ? "Guardando…" : "Guardar" })] })] }));
}
function SizeEditor({ p, s, setItems, }) {
    const [inv, setInv] = useState([]);
    const [collapsed, setCollapsed] = useState(false);
    // Combobox mejorado
    const [search, setSearch] = useState("");
    const [comboOpen, setComboOpen] = useState(false);
    const [picked, setPicked] = useState(null);
    const [qAdd, setQAdd] = useState(0);
    useEffect(() => {
        (async () => {
            const snap = await getDocs(fsQuery(collection(db, "inventoryItems"), orderBy("name")));
            setInv(snap.docs.map((d) => {
                const x = d.data();
                return {
                    id: d.id,
                    name: String(x.name || ""),
                    unit: x.unit,
                    costPerUnit: Number(x.costPerUnit || 0),
                };
            }));
        })();
    }, []);
    const unitOf = (id) => inv.find((x) => x.id === id)?.unit || "";
    const cpuOf = (id) => Number(inv.find((x) => x.id === id)?.costPerUnit || 0);
    const nameOf = (id) => inv.find((x) => x.id === id)?.name || id;
    const rows = Object.entries(s.recipe || {});
    const filtered = inv.filter((x) => x.name?.toLowerCase().includes(search.toLowerCase()));
    const update = (patch) => setItems((cur) => cur.map((x) => {
        if (x.id !== p.id)
            return x;
        return { ...x, sizes: x.sizes.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) };
    }));
    const setAmount = (ing, amount) => {
        const recipe = { ...(s.recipe || {}) };
        const v = Math.max(0, Number(amount) || 0);
        if (v > 0)
            recipe[ing] = v;
        else
            delete recipe[ing];
        update({ recipe });
    };
    const recipeCost = useMemo(() => {
        return rows.reduce((sum, [ing, amount]) => sum + cpuOf(ing) * Number(amount || 0), 0);
    }, [rows]);
    const margin = useMemo(() => {
        const m = Number(s.price || 0) - Number(recipeCost || 0);
        const pct = Number(s.price || 0) > 0 ? (m / Number(s.price)) * 100 : 0;
        return { m, pct };
    }, [s.price, recipeCost]);
    return (_jsxs("div", { className: "rounded-xl border p-3 bg-white", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-6 gap-2 items-end", children: [_jsxs("div", { className: "md:col-span-2", children: [_jsx("div", { className: "label", children: "Nombre del tama\u00F1o" }), _jsx("input", { className: "input", value: s.name, onChange: (e) => update({ name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Precio" }), _jsx("input", { className: "input", type: "number", inputMode: "numeric", value: String(s.price), onChange: (e) => update({ price: Number(e.target.value || 0) }) })] }), _jsxs("div", { className: "md:col-span-3 flex items-center justify-end gap-2", children: [_jsxs("div", { className: "hidden md:block text-sm text-slate-600", children: ["Costo receta: ", _jsxs("span", { className: "font-semibold", children: ["$", recipeCost.toLocaleString()] }), " \u00B7 Margen:", " ", _jsxs("span", { className: `font-semibold ${margin.m < 0 ? "text-red-600" : "text-emerald-600"}`, children: ["$", margin.m.toLocaleString()] }), " ", "\u00B7", " ", _jsxs("span", { className: `font-semibold ${margin.m < 0 ? "text-red-600" : "text-emerald-600"}`, children: [margin.pct.toFixed(1), "%"] })] }), _jsx("button", { className: "btn btn-ghost", onClick: () => setCollapsed((c) => !c), children: collapsed ? "Mostrar receta" : "Ocultar receta" })] })] }), _jsxs("div", { className: "mt-3 rounded-xl border p-3 bg-white", children: [_jsx("div", { className: "label", children: "A\u00F1adir ingrediente" }), picked ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "px-3 py-2 border rounded-lg bg-slate-50", children: [_jsx("div", { className: "text-sm font-medium", children: picked.name }), _jsxs("div", { className: "text-xs text-slate-500", children: ["Unidad: ", picked.unit || "—", " \u00B7 Costo/u: $", Number(picked.costPerUnit || 0).toLocaleString()] })] }), _jsx("input", { className: "input w-32", type: "number", inputMode: "numeric", placeholder: `Cant. (${picked.unit || "u"})`, value: String(qAdd), onChange: (e) => setQAdd(Number(e.target.value || 0)), autoFocus: true }), _jsx("div", { className: "flex items-center gap-1", children: [5, 10, 25].map((n) => (_jsxs("button", { className: "btn btn-sm", onClick: () => setQAdd((v) => Number(v || 0) + n), children: ["+", n] }, n))) }), _jsx("button", { className: "btn btn-primary", onClick: () => {
                                    if (!picked || qAdd <= 0)
                                        return;
                                    setAmount(picked.id, qAdd);
                                    setPicked(null);
                                    setQAdd(0);
                                    setSearch("");
                                    setComboOpen(false);
                                }, children: "A\u00F1adir" }), _jsx("button", { className: "btn", onClick: () => { setPicked(null); setQAdd(0); }, children: "Cambiar" })] })) : (_jsxs("div", { className: "relative", children: [_jsx("input", { className: "input w-full", placeholder: "Buscar ingrediente por nombre\u2026", value: search, onFocus: () => setComboOpen(true), onChange: (e) => {
                                    setSearch(e.target.value);
                                    setComboOpen(true);
                                } }), comboOpen && (_jsxs("div", { className: "absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-xl border bg-white shadow", onMouseDown: (e) => e.preventDefault(), children: [filtered.length === 0 && (_jsx("div", { className: "px-3 py-2 text-sm text-slate-500", children: "Sin resultados." })), filtered.map((it) => (_jsxs("button", { className: "w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between", onClick: () => {
                                            setPicked(it);
                                            setComboOpen(false);
                                        }, children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-sm", children: it.name }), _jsxs("div", { className: "text-xs text-slate-500", children: ["Unidad: ", it.unit || "—"] })] }), _jsxs("div", { className: "text-xs text-slate-600", children: ["Costo/u: $", Number(it.costPerUnit || 0).toLocaleString()] })] }, it.id)))] }))] }))] }), !collapsed && (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-auto mt-3 rounded-lg border", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "bg-slate-100", children: _jsxs("tr", { className: "text-left", children: [_jsx("th", { className: "px-3 py-2", children: "Ingrediente" }), _jsx("th", { className: "px-3 py-2", children: "Unidad" }), _jsx("th", { className: "px-3 py-2", children: "Cantidad" }), _jsx("th", { className: "px-3 py-2", children: "Costo/u" }), _jsx("th", { className: "px-3 py-2", children: "Subtotal" }), _jsx("th", { className: "px-3 py-2 w-24", children: "Acciones" })] }) }), _jsxs("tbody", { children: [rows.length === 0 && (_jsx("tr", { children: _jsx("td", { className: "px-3 py-2 text-slate-500", colSpan: 6, children: "Sin receta." }) })), rows.map(([ing, amount]) => {
                                            const cpu = cpuOf(ing);
                                            const subtotal = cpu * Number(amount || 0);
                                            return (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "px-3 py-2", children: nameOf(ing) }), _jsx("td", { className: "px-3 py-2", children: unitOf(ing) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { className: "input w-24", type: "number", inputMode: "numeric", value: String(amount), onChange: (e) => setAmount(ing, Number(e.target.value || 0)) }) }), _jsxs("td", { className: "px-3 py-2", children: ["$", cpu.toLocaleString()] }), _jsxs("td", { className: "px-3 py-2", children: ["$", subtotal.toLocaleString()] }), _jsx("td", { className: "px-3 py-2", children: _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => setAmount(ing, 0), children: "Quitar" }) })] }, ing));
                                        })] }), _jsx("tfoot", { children: _jsxs("tr", { className: "border-t bg-slate-50", children: [_jsx("td", { className: "px-3 py-2 font-medium", colSpan: 4, children: "Costo receta" }), _jsxs("td", { className: "px-3 py-2 font-semibold", children: ["$", recipeCost.toLocaleString()] }), _jsx("td", {})] }) })] }) }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-4 text-sm", children: [_jsxs("div", { children: ["Precio: ", _jsxs("span", { className: "font-semibold", children: ["$", Number(s.price || 0).toLocaleString()] })] }), _jsxs("div", { children: ["Costo: ", _jsxs("span", { className: "font-semibold", children: ["$", recipeCost.toLocaleString()] })] }), _jsxs("div", { children: ["Margen:", " ", _jsxs("span", { className: `font-semibold ${margin.m < 0 ? "text-red-600" : "text-emerald-600"}`, children: ["$", margin.m.toLocaleString()] })] }), _jsxs("div", { children: ["Margen %:", " ", _jsxs("span", { className: `font-semibold ${margin.m < 0 ? "text-red-600" : "text-emerald-600"}`, children: [margin.pct.toFixed(1), "%"] })] })] })] })), _jsx("div", { className: "text-right mt-3", children: _jsx("button", { className: "btn btn-danger", onClick: () => {
                        setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, sizes: x.sizes.filter((y) => y.id !== s.id) } : x)));
                    }, children: "Quitar tama\u00F1o" }) }), _jsx("div", { className: "text-right", children: _jsx("button", { className: "btn btn-ghost text-xs", onClick: () => setCollapsed((c) => !c), children: collapsed ? "Mostrar receta" : "Ocultar receta" }) })] }));
}

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, orderBy, query, serverTimestamp, runTransaction } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/services/firebase";
const FREQ_LABEL = {
    daily: "Diario",
    weekly: "Semanal",
    monthly: "Mensual",
};
export default function Bodega() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    // filtros
    const [filterKind, setFilterKind] = useState("all");
    const [filterFreq, setFilterFreq] = useState("all");
    // orden
    const [sortBy, setSortBy] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    // edición por fila
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState({});
    // modal Nuevo
    const [showNew, setShowNew] = useState(false);
    const [newItem, setNewItem] = useState({
        name: "",
        unit: "g",
        stock: 0,
        minStock: 0,
        costPerUnit: 0,
        supplier: "",
        kind: "consumable",
        frequency: "daily",
    });
    // modal movimiento de stock
    const [moveOpen, setMoveOpen] = useState(false);
    const [moveType, setMoveType] = useState("in");
    const [moveQty, setMoveQty] = useState(0);
    const [moveReason, setMoveReason] = useState("");
    const [moveItem, setMoveItem] = useState(null);
    // -------- data --------
    useEffect(() => {
        const qy = query(collection(db, "inventoryItems"), orderBy("name"));
        const unsub = onSnapshot(qy, (snap) => {
            const list = snap.docs.map((d) => {
                const x = d.data();
                const frequency = x.frequency ||
                    x.periodicity ||
                    "daily";
                const kind = x.kind || "consumable";
                const unit = x.unit || "g";
                const stock = Number(x.stock) || 0;
                const minStock = Number(x.minStock) || 0;
                const costPerUnit = Number(x.costPerUnit) || 0;
                const supplier = String(x.supplier ?? x.provider ?? "");
                return {
                    id: d.id,
                    name: String(x.name ?? ""),
                    unit,
                    stock,
                    minStock,
                    costPerUnit,
                    supplier,
                    provider: x.provider,
                    periodicity: x.periodicity,
                    frequency,
                    kind,
                };
            });
            setItems(list);
        });
        return () => unsub();
    }, []);
    // helpers edición
    const startEdit = (row) => {
        setEditingId(row.id);
        setDraft({ ...row });
    };
    const cancelEdit = () => {
        setEditingId(null);
        setDraft({});
    };
    const saveEdit = async () => {
        if (!editingId)
            return;
        const nm = String(draft.name || "").trim();
        if (!nm)
            return alert("Nombre requerido.");
        const payload = {
            name: nm,
            unit: draft.unit || "g",
            stock: Math.max(0, Number(draft.stock) || 0),
            minStock: Math.max(0, Number(draft.minStock) || 0),
            costPerUnit: Math.max(0, Number(draft.costPerUnit) || 0),
            // guardamos ambas por compatibilidad
            supplier: String(draft.supplier ?? draft.provider ?? ""),
            provider: String(draft.supplier ?? draft.provider ?? ""),
            frequency: draft.frequency ||
                (draft.periodicity || "daily"),
            // Compat opcional legacy
            periodicity: (draft.frequency || "daily") === "daily"
                ? "daily"
                : (draft.frequency || "daily") === "monthly"
                    ? "monthly"
                    : "weekly",
            kind: draft.kind || "consumable",
            updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, "inventoryItems", editingId), payload);
        setEditingId(null);
        setDraft({});
    };
    const borrar = async (id) => {
        if (!confirm("¿Eliminar ítem? Esta acción no se puede deshacer."))
            return;
        await deleteDoc(doc(db, "inventoryItems", id));
    };
    // crear nuevo
    const crear = async (e) => {
        e.preventDefault();
        const nm = String(newItem.name || "").trim();
        if (!nm)
            return;
        const payload = {
            name: nm,
            unit: newItem.unit || "g",
            stock: Math.max(0, Number(newItem.stock) || 0),
            minStock: Math.max(0, Number(newItem.minStock) || 0),
            costPerUnit: Math.max(0, Number(newItem.costPerUnit) || 0),
            supplier: String(newItem.supplier ?? ""),
            provider: String(newItem.supplier ?? ""), // compat con modelo
            frequency: newItem.frequency || "daily",
            periodicity: (newItem.frequency || "daily") === "daily"
                ? "daily"
                : (newItem.frequency || "daily") === "monthly"
                    ? "monthly"
                    : "weekly",
            kind: newItem.kind || "consumable",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, "inventoryItems"), payload);
        setShowNew(false);
        setNewItem({
            name: "",
            unit: "g",
            stock: 0,
            minStock: 0,
            costPerUnit: 0,
            supplier: "",
            kind: "consumable",
            frequency: "daily",
        });
    };
    // movimientos de stock (en transacción + movimientos válidos para reglas)
    const openMove = (it, type) => {
        setMoveItem(it);
        setMoveType(type);
        setMoveQty(0);
        setMoveReason("");
        setMoveOpen(true);
    };
    const confirmMove = async () => {
        if (!moveOpen || !moveItem)
            return;
        const qty = Math.abs(Number(moveQty) || 0);
        if (qty <= 0)
            return;
        const user = getAuth().currentUser;
        const itemRef = doc(db, "inventoryItems", moveItem.id);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(itemRef);
            if (!snap.exists())
                throw new Error("Ítem no existe");
            const cur = Number(snap.data()?.stock || 0);
            const sign = moveType === "in" ? 1 : -1;
            const next = cur + sign * qty;
            if (next < 0)
                throw new Error("La salida dejaría el stock negativo.");
            tx.update(itemRef, {
                stock: next,
                updatedAt: serverTimestamp(),
            });
            const mref = doc(collection(db, "stockMovements"));
            tx.set(mref, {
                id: mref.id,
                at: serverTimestamp(),
                // ⚠️ reglas: solo "consume" | "revert"
                type: moveType === "in" ? "revert" : "consume",
                ingredientId: moveItem.id, // ⚠️ reglas: string requerido
                qty, // qty >= 0
                reason: moveType === "in" ? "manual_in" : "manual_out",
                note: moveReason || null,
                userId: user?.uid || null,
                // compat para lectura/UI (no requerido por reglas)
                itemName: moveItem.name,
                unit: moveItem.unit,
            });
        });
        setMoveOpen(false);
        setMoveItem(null);
    };
    // -------- derived --------
    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        return items
            .filter((i) => (filterKind === "all" ? true : (i.kind || "consumable") === filterKind))
            .filter((i) => (filterFreq === "all" ? true : (i.frequency || i.periodicity || "daily") === filterFreq))
            .filter((i) => (t ? i.name.toLowerCase().includes(t) : true));
    }, [items, q, filterKind, filterFreq]);
    const sorted = useMemo(() => {
        const arr = [...filtered];
        const dir = sortDir === "asc" ? 1 : -1;
        arr.sort((a, b) => {
            let va, vb;
            switch (sortBy) {
                case "name":
                    va = a.name.toLowerCase();
                    vb = b.name.toLowerCase();
                    return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
                case "stock":
                    return (a.stock - b.stock) * dir;
                case "minStock":
                    return (a.minStock - b.minStock) * dir;
                case "costPerUnit":
                    return (a.costPerUnit - b.costPerUnit) * dir;
                default:
                    return 0;
            }
        });
        return arr;
    }, [filtered, sortBy, sortDir]);
    const toggleSort = (k) => {
        if (sortBy === k)
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortBy(k);
            setSortDir("asc");
        }
    };
    // -------- UI atoms --------
    const SegBtn = ({ active, children, onClick }) => (_jsx("button", { className: `px-3 py-1.5 rounded-full border text-sm transition
      ${active ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)] shadow-sm"
            : "bg-white hover:bg-slate-50"}`, onClick: onClick, children: children }));
    const Th = ({ label, sortKey }) => {
        const active = sortKey && sortBy === sortKey;
        return (_jsxs("th", { className: `cursor-pointer select-none ${active ? "underline" : ""}`, onClick: () => sortKey && toggleSort(sortKey), title: sortKey ? "Ordenar" : "", children: [label, " ", active ? (sortDir === "asc" ? "▲" : "▼") : ""] }));
    };
    const isLow = (it) => Number(it.stock) <= Number(it.minStock || 0);
    // -------- render --------
    return (_jsxs("div", { className: "container-app space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Bodega" }), _jsx("button", { className: "btn btn-primary", onClick: () => setShowNew(true), children: "Nuevo \u00EDtem" })] }), _jsx("div", { className: "rounded-2xl border bg-white p-4 shadow-sm", children: _jsxs("div", { className: "grid gap-3 md:grid-cols-3", children: [_jsx("input", { className: "input w-full", placeholder: "Buscar por nombre\u2026", value: q, onChange: (e) => setQ(e.target.value) }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(SegBtn, { active: filterKind === "all", onClick: () => setFilterKind("all"), children: "Todo" }), _jsx(SegBtn, { active: filterKind === "consumable", onClick: () => setFilterKind("consumable"), children: "Consumibles" }), _jsx(SegBtn, { active: filterKind === "equipment", onClick: () => setFilterKind("equipment"), children: "Maquinaria" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(SegBtn, { active: filterFreq === "all", onClick: () => setFilterFreq("all"), children: "Todas" }), _jsx(SegBtn, { active: filterFreq === "daily", onClick: () => setFilterFreq("daily"), children: "Diario" }), _jsx(SegBtn, { active: filterFreq === "weekly", onClick: () => setFilterFreq("weekly"), children: "Semanal" }), _jsx(SegBtn, { active: filterFreq === "monthly", onClick: () => setFilterFreq("monthly"), children: "Mensual" })] })] }) }), _jsx("div", { className: "rounded-2xl border bg-white overflow-auto", children: _jsxs("table", { className: "table min-w-[1000px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(Th, { label: "Nombre", sortKey: "name" }), _jsx("th", { children: "Unidad" }), _jsx(Th, { label: "Stock", sortKey: "stock" }), _jsx(Th, { label: "M\u00EDn", sortKey: "minStock" }), _jsx(Th, { label: "Costo/u", sortKey: "costPerUnit" }), _jsx("th", { children: "Frecuencia" }), _jsx("th", { children: "Proveedor" }), _jsx("th", { className: "w-56", children: "Acciones" })] }) }), _jsxs("tbody", { children: [sorted.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-3 py-4 text-center text-slate-500", children: "Sin \u00EDtems." }) })), sorted.map((it) => {
                                    const editing = editingId === it.id;
                                    const row = (editing ? draft : it);
                                    return (_jsxs("tr", { className: isLow(it) ? "bg-[#fffbeb]" : "", children: [_jsx("td", { className: "px-3 py-2", children: editing ? (_jsx("input", { className: "input", value: row.name || "", onChange: (e) => setDraft({ ...row, name: e.target.value }) })) : (_jsx("span", { className: "font-medium", children: row.name })) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsxs("select", { className: "input", value: row.unit, onChange: (e) => setDraft({ ...row, unit: e.target.value }), children: [_jsx("option", { value: "g", children: "g" }), _jsx("option", { value: "ml", children: "ml" }), _jsx("option", { value: "u", children: "u" })] })) : (row.unit) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsx("input", { className: "input", type: "number", min: 0, value: String(row.stock ?? 0), onChange: (e) => setDraft({ ...row, stock: Number(e.target.value || 0) }) })) : (row.stock.toLocaleString()) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsx("input", { className: "input", type: "number", min: 0, value: String(row.minStock ?? 0), onChange: (e) => setDraft({ ...row, minStock: Number(e.target.value || 0) }) })) : ((row.minStock ?? 0).toLocaleString()) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsx("input", { className: "input", type: "number", min: 0, step: "0.01", value: String(row.costPerUnit ?? 0), onChange: (e) => setDraft({ ...row, costPerUnit: Number(e.target.value || 0) }) })) : (`$${Number(row.costPerUnit || 0).toLocaleString()}`) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsxs("select", { className: "input", value: row.frequency || "daily", onChange: (e) => setDraft({ ...row, frequency: e.target.value }), disabled: (row.kind || "consumable") === "equipment", children: [_jsx("option", { value: "daily", children: "Diario" }), _jsx("option", { value: "weekly", children: "Semanal" }), _jsx("option", { value: "monthly", children: "Mensual" })] })) : ((row.kind || "consumable") === "equipment"
                                                    ? _jsx("span", { className: "text-slate-400", children: "\u2014" })
                                                    : FREQ_LABEL[(row.frequency || "daily")]) }), _jsx("td", { className: "px-3 py-2", children: editing ? (_jsx("input", { className: "input", value: row.supplier || "", onChange: (e) => setDraft({ ...row, supplier: e.target.value, provider: e.target.value }), placeholder: "Nombre proveedor" })) : (row.supplier || _jsx("span", { className: "text-slate-400", children: "\u2014" })) }), _jsx("td", { className: "px-3 py-2", children: _jsx("div", { className: "flex flex-wrap gap-2", children: !editing ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-ghost btn-sm", onClick: () => startEdit(it), children: "Editar" }), _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => borrar(it.id), children: "Eliminar" }), _jsx("button", { className: "btn btn-sm", onClick: () => openMove(it, "in"), children: "Entrada" }), _jsx("button", { className: "btn btn-sm", onClick: () => openMove(it, "out"), children: "Salida" })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-sm", onClick: cancelEdit, children: "Cancelar" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: saveEdit, children: "Guardar" })] })) }) })] }, it.id));
                                })] })] }) }), showNew && (_jsx("div", { className: "fixed inset-0 z-20 bg-black/40 flex items-end md:items-center justify-center p-3", children: _jsxs("form", { onSubmit: crear, className: "w-full max-w-2xl rounded-2xl bg-white p-4 shadow-lg space-y-3", children: [_jsx("div", { className: "text-lg font-semibold", children: "Nuevo \u00EDtem" }), _jsxs("div", { className: "grid gap-3 md:grid-cols-3", children: [_jsxs("div", { className: "md:col-span-2", children: [_jsx("div", { className: "label", children: "Nombre" }), _jsx("input", { className: "input w-full", value: newItem.name || "", onChange: (e) => setNewItem({ ...newItem, name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Unidad" }), _jsxs("select", { className: "input", value: newItem.unit, onChange: (e) => setNewItem({ ...newItem, unit: e.target.value }), children: [_jsx("option", { value: "g", children: "Gramos (g)" }), _jsx("option", { value: "ml", children: "Mililitros (ml)" }), _jsx("option", { value: "u", children: "Unidades (u)" })] })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Stock" }), _jsx("input", { className: "input", type: "number", min: 0, value: String(newItem.stock ?? 0), onChange: (e) => setNewItem({ ...newItem, stock: Number(e.target.value || 0) }) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "M\u00EDnimo" }), _jsx("input", { className: "input", type: "number", min: 0, value: String(newItem.minStock ?? 0), onChange: (e) => setNewItem({ ...newItem, minStock: Number(e.target.value || 0) }) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Costo por unidad" }), _jsx("input", { className: "input", type: "number", min: 0, step: "0.01", value: String(newItem.costPerUnit ?? 0), onChange: (e) => setNewItem({ ...newItem, costPerUnit: Number(e.target.value || 0) }) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Frecuencia" }), _jsxs("select", { className: "input", value: newItem.frequency || "daily", onChange: (e) => setNewItem({ ...newItem, frequency: e.target.value }), disabled: newItem.kind === "equipment", children: [_jsx("option", { value: "daily", children: "Diario" }), _jsx("option", { value: "weekly", children: "Semanal" }), _jsx("option", { value: "monthly", children: "Mensual" })] })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Proveedor" }), _jsx("input", { className: "input", value: newItem.supplier || "", onChange: (e) => setNewItem({ ...newItem, supplier: e.target.value }), placeholder: "Ej: Distribuidor XYZ" })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Tipo" }), _jsxs("select", { className: "input", value: newItem.kind || "consumable", onChange: (e) => setNewItem({ ...newItem, kind: e.target.value }), children: [_jsx("option", { value: "consumable", children: "Consumible" }), _jsx("option", { value: "equipment", children: "Maquinaria / Activo" })] })] })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", className: "btn", onClick: () => setShowNew(false), children: "Cancelar" }), _jsx("button", { className: "btn btn-primary", children: "Crear" })] })] }) })), moveOpen && moveItem && (_jsx("div", { className: "fixed inset-0 z-20 bg-black/40 flex items-end md:items-center justify-center p-3", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl bg-white p-4 shadow-lg space-y-3", children: [_jsx("div", { className: "text-lg font-semibold", children: moveType === "in" ? "Registrar ENTRADA" : "Registrar SALIDA" }), _jsxs("div", { className: "text-sm text-slate-600", children: ["\u00CDtem: ", _jsx("span", { className: "font-medium", children: moveItem.name }), " \u00B7 Stock actual:", " ", _jsx("span", { className: "font-medium", children: moveItem.stock }), " ", moveItem.unit] }), _jsxs("div", { className: "grid gap-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "label", children: ["Cantidad (", moveItem.unit, ")"] }), _jsx("input", { className: "input", type: "number", min: 0, value: String(moveQty), onChange: (e) => setMoveQty(Number(e.target.value || 0)) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Motivo (opcional)" }), _jsx("input", { className: "input", placeholder: "Compra, merma, ajuste, etc.", value: moveReason, onChange: (e) => setMoveReason(e.target.value) })] })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx("button", { className: "btn", onClick: () => setMoveOpen(false), children: "Cancelar" }), _jsx("button", { className: "btn btn-primary", onClick: confirmMove, children: "Guardar" })] })] }) }))] }));
}

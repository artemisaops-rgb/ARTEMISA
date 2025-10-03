import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, increment } from "firebase/firestore";
import { db } from "@/services/firebase";
export default function Compras() {
    const [lowItems, setLowItems] = useState([]);
    const [restockAmounts, setRestockAmounts] = useState({});
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "inventory"), (snapshot) => {
            const lowList = [];
            snapshot.forEach((d) => {
                const data = d.data();
                const stock = Number(data.stock) || 0;
                const min = data.min == null ? undefined : Number(data.min);
                if (min !== undefined && stock <= min) {
                    lowList.push({ id: d.id, name: data.name, stock, min });
                }
            });
            setLowItems(lowList);
        });
        return () => unsub();
    }, []);
    const handleAmountChange = (id, value) => setRestockAmounts((prev) => ({ ...prev, [id]: Number(value) }));
    const handleRestock = async (item) => {
        const amount = restockAmounts[item.id] || 0;
        if (amount <= 0) {
            alert("Ingresa una cantidad válida para reabastecer");
            return;
        }
        await updateDoc(doc(db, "inventory", item.id), { stock: increment(amount) });
        await addDoc(collection(db, "stockMovements"), {
            ingredientId: item.id,
            qty: amount,
            reason: "purchase",
            at: serverTimestamp(),
        });
        setRestockAmounts((prev) => ({ ...prev, [item.id]: 0 }));
        alert(`Se reabastecieron ${amount} unidades de ${item.name || item.id}`);
    };
    return (_jsxs("div", { className: "max-w-xl mx-auto p-4 space-y-3", children: [_jsx("h1", { className: "text-lg font-semibold", children: "Reabastecer inventario" }), lowItems.length === 0 ? (_jsx("p", { className: "text-slate-500", children: "No hay insumos por debajo del m\u00EDnimo." })) : (_jsx("ul", { className: "space-y-2", children: lowItems.map((it) => (_jsxs("li", { className: "bg-white border rounded-xl p-3 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium", children: it.name || it.id }), _jsxs("div", { className: "text-sm text-slate-600", children: ["Stock: ", it.stock, " / Min: ", it.min] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "number", className: "w-24 border rounded-lg px-2 py-1", value: restockAmounts[it.id] || "", onChange: (e) => handleAmountChange(it.id, e.target.value) }), _jsx("button", { className: "px-3 py-1.5 rounded-lg bg-orange-600 text-white", onClick: () => handleRestock(it), children: "Reabastecer" })] })] }, it.id))) }))] }));
}

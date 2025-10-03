import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/Auth";
import { db } from "@/services/firebase";
import { checkoutStrict, } from "@/lib/pos.helpers";
export default function Carrito() {
    const { items, inc, dec, remove, clear } = useCart();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [payMethod, setPayMethod] = useState("cash"); // efectivo por defecto
    // Normalizar ítems para la UI y el checkout (sin undefined)
    const safeItems = useMemo(() => {
        return (items || []).map((it) => {
            const rawId = String(it.id ?? "");
            const productId = rawId.includes(":") ? rawId.split(":")[0] : rawId;
            const out = {
                id: productId,
                name: String(it.name ?? ""),
                price: Number.isFinite(Number(it.price)) ? Number(it.price) : 0,
                qty: Number(it.qty) || 0,
                recipe: it.recipe || {},
            };
            if (it.sizeId)
                out.sizeId = String(it.sizeId);
            if (it.sizeName)
                out.sizeName = String(it.sizeName);
            return out;
        });
    }, [items]);
    const total = useMemo(() => safeItems.reduce((s, it) => s + Number(it.price) * Number(it.qty || 0), 0), [safeItems]);
    const pagar = async () => {
        if (loading)
            return;
        try {
            if (!safeItems.length)
                return alert("No hay productos en el carrito");
            setLoading(true);
            await checkoutStrict(db, safeItems, payMethod, user?.uid ?? null);
            clear();
            const label = payMethod === "cash" ? "Efectivo" :
                payMethod === "qr" ? "QR" :
                    payMethod === "card" ? "Tarjeta" : "Otro";
            alert(`Venta registrada ✅ (${label})`);
        }
        catch (e) {
            console.error(e);
            alert("No se pudo completar el pago: " + (e?.message || e));
        }
        finally {
            setLoading(false);
        }
    };
    const money = (n) => `$${Number(n || 0).toLocaleString()}`;
    return (_jsxs("div", { className: "container-app p-6 pb-28 space-y-4", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Carrito" }), safeItems.length === 0 && (_jsx("div", { className: "text-slate-500", children: "Tu carrito est\u00E1 vac\u00EDo." })), safeItems.map((it) => (_jsxs("div", { className: "bg-white border rounded-2xl p-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "font-medium", children: [it.name, " ", it.sizeName ? `(${it.sizeName})` : ""] }), _jsxs("div", { className: "text-sm text-slate-600", children: [money(it.price), " c/u"] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { className: "px-3 py-1 border rounded-lg", onClick: () => dec(it.id), children: "-" }), _jsx("div", { className: "w-6 text-center", children: it.qty }), _jsx("button", { className: "px-3 py-1 border rounded-lg", onClick: () => inc(it.id), children: "+" }), _jsx("div", { className: "w-28 text-right font-medium", children: money(it.price * it.qty) }), _jsx("button", { className: "px-3 py-1 border rounded-lg", onClick: () => remove(it.id), children: "Quitar" })] })] }, it.id + (it.sizeId || "")))), safeItems.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bg-white border rounded-2xl p-4", children: [_jsx("div", { className: "text-sm text-slate-600 mb-2", children: "M\u00E9todo de pago" }), _jsx("div", { className: "flex gap-2", children: ["cash", "qr", "card", "other"].map((m) => (_jsx("button", { className: `px-3 py-1 rounded-xl border ${payMethod === m ? "bg-orange-500 text-white border-orange-500" : ""}`, onClick: () => setPayMethod(m), children: m === "cash" ? "Efectivo" : m === "qr" ? "QR" : m === "card" ? "Tarjeta" : "Otro" }, m))) })] }), _jsxs("div", { className: "bg-white border rounded-2xl p-4 flex items-center justify-between", children: [_jsxs("div", { className: "text-xl font-semibold", children: ["Total ", money(total)] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { className: "btn", onClick: clear, disabled: loading, children: "Vaciar" }), _jsx("button", { className: "btn btn-primary", onClick: pagar, disabled: loading || total <= 0, title: total <= 0 ? "Agrega productos" : "", children: loading ? "Pagando..." : "Confirmar pago" })] })] })] }))] }));
}

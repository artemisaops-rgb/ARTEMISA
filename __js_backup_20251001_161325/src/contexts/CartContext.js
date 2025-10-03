import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
const CartCtx = createContext(null);
export const useCart = () => {
    const v = useContext(CartCtx);
    if (!v)
        throw new Error("CartProvider missing");
    return v;
};
const key = "artemisa.cart.v1";
export function CartProvider({ children }) {
    const [items, setItems] = useState([]);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw)
                setItems(JSON.parse(raw));
        }
        catch { }
    }, []);
    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(items));
    }, [items]);
    const addProduct = (p) => {
        const price = Number(p.price) || 0;
        setItems((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
                return copy;
            }
            return [...prev, { id: p.id, name: p.name, price, qty: 1, recipe: p.recipe }];
        });
    };
    const inc = (id) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x)));
    const dec = (id) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)));
    const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
    const clear = () => setItems([]);
    const total = useMemo(() => items.reduce((a, it) => a + (Number(it.price) || 0) * it.qty, 0), [items]);
    return _jsx(CartCtx.Provider, { value: { items, total, addProduct, inc, dec, remove, clear }, children: children });
}

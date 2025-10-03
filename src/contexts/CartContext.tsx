import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "@/types";

type Ctx = {
  items: CartItem[];
  total: number;
  addProduct: (p: Product) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => {
  const v = useContext(CartCtx);
  if (!v) throw new Error("CartProvider missing");
  return v;
};

const key = "artemisa.cart.v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [items]);

  const addProduct = (p: Product) => {
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
  const inc = (id: string) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x)));
  const dec = (id: string) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)));
  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));
  const clear = () => setItems([]);

  const total = useMemo(() => items.reduce((a, it) => a + (Number(it.price) || 0) * it.qty, 0), [items]);

  return <CartCtx.Provider value={{ items, total, addProduct, inc, dec, remove, clear }}>{children}</CartCtx.Provider>;
}

// src/contexts/CartContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem } from "@/lib/pos.helpers";
import { getOrgId } from "@/services/firebase";

/** Producto “flexible” que acepta lo que venga de tu catálogo */
type ProductLike = {
  id: string;
  name: string;
  price: number | string;
  recipe?: Record<string, number>;
  sizeId?: string;
  sizeName?: string;
  category?: string;
  isBeverage?: boolean;
};

/** API del carrito */
type Ctx = {
  items: CartItem[];
  total: number;
  addProduct: (p: ProductLike) => void;
  inc: (cartKey: string) => void;
  dec: (cartKey: string) => void;
  remove: (cartKey: string) => void;
  clear: () => void;
};

const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => {
  const v = useContext(CartCtx);
  if (!v) throw new Error("CartProvider missing");
  return v;
};

/** Storage aislado por organización */
const storageKey = () => `artemisa.cart.v1:${getOrgId() || "default"}`;

/** Construye la clave única del ítem (id o id:sizeId) */
const cartKeyFor = (p: ProductLike) => (p.sizeId ? `${p.id}:${p.sizeId}` : p.id);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Carga inicial
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setItems(parsed);
    } catch {
      // ignore
    }
  }, []);

  // Persistencia
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items]);

  const addProduct = (p: ProductLike) => {
    const key = cartKeyFor(p);
    const price = Number(p.price) || 0;

    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: (copy[idx].qty || 0) + 1 };
        return copy;
      }
      const next: CartItem = {
        id: key, // <- clave del carrito (puede incluir sizeId)
        name: String(p.name ?? ""),
        price,
        qty: 1,
        recipe: p.recipe || {},
        sizeId: p.sizeId,
        sizeName: p.sizeName,
        category: p.category?.toLowerCase(),
        isBeverage: Boolean(p.isBeverage),
      };
      return [...prev, next];
    });
  };

  const inc = (cartKey: string) =>
    setItems((prev) =>
      prev.map((x) => (x.id === cartKey ? { ...x, qty: (x.qty || 0) + 1 } : x))
    );

  const dec = (cartKey: string) =>
    setItems((prev) =>
      prev
        .map((x) =>
          x.id === cartKey ? { ...x, qty: Math.max(0, (x.qty || 0) - 1) } : x
        )
        .filter((x) => (x.qty || 0) > 0)
    );

  const remove = (cartKey: string) =>
    setItems((prev) => prev.filter((x) => x.id !== cartKey));

  const clear = () => setItems([]);

  const total = useMemo(
    () => items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0),
    [items]
  );

  return (
    <CartCtx.Provider value={{ items, total, addProduct, inc, dec, remove, clear }}>
      {children}
    </CartCtx.Provider>
  );
}

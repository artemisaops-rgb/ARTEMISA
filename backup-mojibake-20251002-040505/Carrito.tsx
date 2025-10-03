// src/pages/Carrito.tsx �?" REEMPLAZA COMPLETO (con selector de cliente para staff)
import React, { useEffect, useMemo, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { db, getOrgId } from "@/services/firebase";
import {
  checkoutStrict,
  type CartItem as PosCartItem,
  type PayMethod,
} from "@/lib/pos.helpers";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";

const BEV_CATS = ["frappes", "coldbrew", "bebidas calientes"];

export default function Carrito() {
  const { items, inc, dec, remove, clear } = useCart();
  const { user } = useAuth();
  const { role } = useRole();
  const orgId = getOrgId();

  const isStaff = role === "owner" || role === "worker";

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [loading, setLoading] = useState(false);

  // ---- Selector de cliente (solo staff) ----
  const [q, setQ] = useState("");
  const { results, loading: searching, hasMore, fetchMore } = useCustomerSearch(orgId, q, 12);
  const [selected, setSelected] = useState<ReturnType<typeof useCustomerSearch>["results"][number] | null>(null);

  useEffect(() => {
    if (!isStaff) setSelected(null);
  }, [isStaff]);

  const customerIdForCheckout = useMemo(() => {
    if (isStaff) return selected?.id || user?.uid || null;
    return user?.uid || null;
  }, [isStaff, selected?.id, user?.uid]);

  // ---- Ítems formateados para POS (respetando categorías de bebida) ----
  const safeItems: PosCartItem[] = useMemo(() => {
    return (items || []).map((it: any) => {
      const rawId = String(it.id ?? "");
      const productId = rawId.includes(":") ? rawId.split(":")[0]! : rawId;
      const category = String(it.category || "").toLowerCase();
      const isBeverage = Boolean(it.isBeverage) || BEV_CATS.includes(category);

      const out: PosCartItem = {
        id: productId,
        name: String(it.name ?? ""),
        price: Number.isFinite(Number(it.price)) ? Number(it.price) : 0,
        qty: Number(it.qty) || 0,
        recipe: it.recipe || {},
        category: category || undefined,
        isBeverage,
      };
      if (it.sizeId) out.sizeId = String(it.sizeId);
      if (it.sizeName) out.sizeName = String(it.sizeName);
      return out;
    });
  }, [items]);

  const total = useMemo(
    () => safeItems.reduce((s, it) => s + Number(it.price) * Number(it.qty || 0), 0),
    [safeItems]
  );

  const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;

  const pagar = async () => {
    if (loading) return;
    try {
      if (!safeItems.length) return alert("No hay productos en el carrito");
      if (!user?.uid) return alert("Debes iniciar sesión");
      setLoading(true);

      await checkoutStrict(db, safeItems, payMethod, user.uid, customerIdForCheckout);
      clear();
      alert("Venta registrada �o.");
    } catch (e: any) {
      console.error(e);
      alert("No se pudo completar el pago: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app p-6 pb-28 space-y-4">
      <h1 className="text-2xl font-bold">Carrito</h1>

      {safeItems.length === 0 && (
        <div className="text-slate-500">Tu carrito está vacío.</div>
      )}

      {safeItems.map((it) => (
        <div
          key={it.id + (it.sizeId || "")}
          className="bg-white border rounded-2xl p-4 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">
              {it.name} {it.sizeName ? `(${it.sizeName})` : ""} {it.category ? `· ${it.category}` : ""}
            </div>
            <div className="text-sm text-slate-600">{money(it.price)} c/u</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 border rounded-lg" onClick={() => dec(it.id)}>-</button>
            <div className="w-6 text-center">{it.qty}</div>
            <button className="px-3 py-1 border rounded-lg" onClick={() => inc(it.id)}>+</button>
            <div className="w-28 text-right font-medium">{money(it.price * it.qty)}</div>
            <button className="px-3 py-1 border rounded-lg" onClick={() => remove(it.id)}>Quitar</button>
          </div>
        </div>
      ))}

      {/* ----- Picker de cliente (staff) ----- */}
      {isStaff && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="font-semibold">Cliente</div>

          {selected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected.photoURL ? (
                  <img
                    src={selected.photoURL}
                    className="w-10 h-10 rounded-full object-cover"
                    alt="avatar"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                )}
                <div>
                  <div className="font-medium">{selected.displayName || "Sin nombre"}</div>
                  <div className="text-xs text-slate-600">{selected.email || "�?""}</div>
                  <div className="text-xs">Créditos: {selected.freeCredits ?? 0} · Sellos: {selected.stampsProgress ?? 0}/10</div>
                  <div className="text-[10px] text-slate-500">ID: {selected.id}</div>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-sm px-3 py-1 rounded-lg border hover:bg-slate-50"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Buscar por nombre, email o ID�?�"
              />
              <div className="max-h-60 overflow-auto divide-y rounded-lg border">
                {searching && <div className="p-3 text-sm text-slate-600">Buscando�?�</div>}
                {!searching && results.length === 0 && (
                  <div className="p-3 text-sm text-slate-600">Sin resultados.</div>
                )}
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center gap-3"
                  >
                    {c.photoURL ? (
                      <img
                        src={c.photoURL}
                        className="w-8 h-8 rounded-full object-cover"
                        alt="avatar"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate">{c.displayName || "Sin nombre"}</div>
                      <div className="text-xs text-slate-600 truncate">{c.email || "�?""}</div>
                    </div>
                    <div className="ml-auto text-xs">Cred: {c.freeCredits ?? 0} · {c.stampsProgress ?? 0}/10</div>
                  </button>
                ))}
                {hasMore && (
                  <button onClick={fetchMore} className="w-full p-3 text-sm hover:bg-slate-50">
                    Cargar más�?�
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                Usará: <span className="font-mono">{customerIdForCheckout || "�?""}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Método de pago */}
      {safeItems.length > 0 && (
        <div className="bg-white border rounded-2xl p-4 space-y-2">
          <div className="text-sm text-slate-600">Método de pago</div>
          <div className="flex gap-2">
            {(["cash", "qr", "card", "other"] as PayMethod[]).map((m) => (
              <button
                key={m}
                className={`px-3 py-1 rounded-xl border ${payMethod === m ? "bg-orange-500 text-white border-orange-500" : ""}`}
                onClick={() => setPayMethod(m)}
              >
                {m === "cash" ? "Efectivo" : m === "qr" ? "QR" : m === "card" ? "Tarjeta" : "Otro"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Total + confirmar */}
      {safeItems.length > 0 && (
        <div className="bg-white border rounded-2xl p-4 flex items-center justify-between">
          <div className="text-xl font-semibold">Total {money(total)}</div>
          <div className="flex gap-3">
            <button className="btn" onClick={clear} disabled={loading}>Vaciar</button>
            <button
              className="btn btn-primary"
              onClick={pagar}
              disabled={loading || total <= 0 || !customerIdForCheckout}
              title={!customerIdForCheckout ? "Selecciona cliente" : ""}
            >
              {loading ? "Pagando..." : "Confirmar pago"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


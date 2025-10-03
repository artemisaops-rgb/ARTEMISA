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
import { redeemOneFreeBeverage } from "@/lib/customers";

const BEV_CATS = ["frappes", "coldbrew", "bebidas calientes"];

export default function Carrito() {
  const { items, inc, dec, remove, clear } = useCart();
  const { user } = useAuth();
  const { role } = useRole();
  const orgId = getOrgId();

  const isStaff = role === "owner" || role === "worker";
  const isClient = role === "client";

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [loading, setLoading] = useState(false);

  // ---- Modo venta sin cliente (sólo staff) ----
  const [fastSale, setFastSale] = useState<boolean>(isStaff); // por defecto sí para staff

  // ---- Selector de cliente (staff) ----
  const [q, setQ] = useState("");
  const { results, loading: searching, hasMore, fetchMore } = useCustomerSearch(orgId, q, 12);
  const [selected, setSelected] =
    useState<ReturnType<typeof useCustomerSearch>["results"][number] | null>(null);

  useEffect(() => {
    // si NO es staff, no hay venta rápida; el cliente es el usuario
    if (!isStaff) {
      setFastSale(false);
      setSelected(null);
    } else {
      // staff: por defecto fastSale encendido
      setFastSale(true);
    }
  }, [isStaff]);

  const customerIdForCheckout = useMemo(() => {
    if (fastSale) return null; // venta sin cliente
    if (isStaff) return selected?.id || user?.uid || null;
    return user?.uid || null;
  }, [isStaff, fastSale, selected?.id, user?.uid]);

  // ---- Ítems para POS ----
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

  const subtotal = useMemo(
    () => safeItems.reduce((s, it) => s + Number(it.price) * Number(it.qty || 0), 0),
    [safeItems]
  );

  // ---- Canje de 1 crédito (si hay cliente y bebidas) ----
  const beveragesInCart = useMemo(
    () => safeItems.filter((it) => it.isBeverage && it.qty > 0 && it.price > 0),
    [safeItems]
  );
  const cheapestBeverageUnit = useMemo(() => {
    if (!beveragesInCart.length) return 0;
    return Math.min(...beveragesInCart.map((it) => Number(it.price) || 0));
  }, [beveragesInCart]);

  const canRedeem =
    !fastSale &&
    !!selected &&
    Number(selected?.freeCredits || 0) > 0 &&
    cheapestBeverageUnit > 0;

  const [useCredit, setUseCredit] = useState(false);
  useEffect(() => {
    if (!canRedeem) setUseCredit(false);
  }, [canRedeem]);

  const discountValue = useMemo(
    () => (useCredit ? Math.min(cheapestBeverageUnit, subtotal) : 0),
    [useCredit, cheapestBeverageUnit, subtotal]
  );

  const itemsForCheckout: PosCartItem[] = useMemo(() => {
    if (discountValue <= 0) return safeItems;
    return [
      ...safeItems,
      {
        id: "loyalty-credit",
        name: "Bebida gratis (crédito)",
        price: -discountValue,
        qty: 1,
        recipe: {},
        isBeverage: false,
        category: "promo",
      },
    ];
  }, [safeItems, discountValue]);

  const total = useMemo(() => subtotal - discountValue, [subtotal, discountValue]);

  const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;

  const pagar = async () => {
    if (loading) return;
    try {
      if (!itemsForCheckout.length) return alert("No hay productos en el carrito");
      if (!user?.uid) return alert("Debes iniciar sesión");
      setLoading(true);

      const cid = customerIdForCheckout; // puede ser null (venta rápida)
      await checkoutStrict(db, itemsForCheckout, payMethod, user.uid, cid);

      // Si apliqué crédito, descuento 1 en el ledger
      if (useCredit && selected?.id) {
        await redeemOneFreeBeverage(db, selected.id);
      }

      clear();
      alert("Venta registrada.");
      // reset de UI de cliente
      if (isStaff) {
        setSelected(null);
        setFastSale(true);
      }
      setUseCredit(false);
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

      {safeItems.length === 0 && <div className="text-slate-500">Tu carrito está vacío.</div>}

      {safeItems.map((it) => (
        <div
          key={it.id + (it.sizeId || "")}
          className="bg-white border rounded-2xl p-4 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">
              {it.name} {it.sizeName ? `(${it.sizeName})` : ""} {it.category ? ` ${it.category}` : ""}
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

      {/* ----- Modo de cliente / venta rápida ----- */}
      {isStaff && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="font-semibold">Modo de venta</div>
          <div className="flex gap-2">
            <button
              className={
                "px-3 py-1 rounded-xl border " +
                (fastSale ? "bg-orange-500 text-white border-orange-500" : "")
              }
              onClick={() => setFastSale(true)}
              title="No se registran puntos ni historial de cliente"
            >
              Sin cliente (rápida)
            </button>
            <button
              className={
                "px-3 py-1 rounded-xl border " +
                (!fastSale ? "bg-orange-500 text-white border-orange-500" : "")
              }
              onClick={() => setFastSale(false)}
              title="Asigna un cliente para fidelización"
            >
              Asignar cliente
            </button>
          </div>

          {!fastSale && (
            <>
              {selected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selected.photoURL ? (
                      <img src={selected.photoURL} className="w-10 h-10 rounded-full object-cover" alt="avatar" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200" />
                    )}
                    <div>
                      <div className="font-medium">{selected.displayName || "Sin nombre"}</div>
                      <div className="text-xs text-slate-600">{selected.email || "(sin email)"}</div>
                      <div className="text-xs">
                        Créditos: {selected.freeCredits ?? 0} · Sellos: {selected.stampsProgress ?? 0}/10
                      </div>
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
                    placeholder="Buscar por nombre, email o ID"
                  />
                  <div className="max-h-60 overflow-auto divide-y rounded-lg border">
                    {searching && <div className="p-3 text-sm text-slate-600">Buscando…</div>}
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
                          <img src={c.photoURL} className="w-8 h-8 rounded-full object-cover" alt="avatar" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{c.displayName || "Sin nombre"}</div>
                          <div className="text-xs text-slate-600 truncate">{c.email || "(sin email)"}</div>
                        </div>
                        <div className="ml-auto text-xs">
                          Cred: {c.freeCredits ?? 0} · {c.stampsProgress ?? 0}/10
                        </div>
                      </button>
                    ))}
                    {hasMore && (
                      <button onClick={fetchMore} className="w-full p-3 text-sm hover:bg-slate-50">
                        Cargar más
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Canje de crédito */}
              {canRedeem && (
                <div className="pt-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useCredit}
                      onChange={(e) => setUseCredit(e.target.checked)}
                    />
                    <span>
                      Canjear <b>1 crédito</b> (descunta {money(cheapestBeverageUnit)} — bebida más barata del carrito)
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          {/* Referencia de qué UID se usará */}
          <div className="text-[11px] text-slate-500">
            Cliente:{" "}
            <span className="font-mono">
              {fastSale ? "(sin cliente)" : customerIdForCheckout || "(ninguno)"}
            </span>
          </div>
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
                className={`px-3 py-1 rounded-xl border ${
                  payMethod === m ? "bg-orange-500 text-white border-orange-500" : ""
                }`}
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
        <div className="bg-white border rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Total {money(total)}</div>
            <div className="flex gap-3">
              <button className="btn" onClick={clear} disabled={loading}>
                Vaciar
              </button>
              <button
                className="btn btn-primary"
                onClick={pagar}
                disabled={loading || total <= 0 || (!isStaff && !customerIdForCheckout)}
                title={!isStaff && !customerIdForCheckout ? "Selecciona cliente" : ""}
              >
                {loading ? "Pagando..." : "Confirmar pago"}
              </button>
            </div>
          </div>
          {discountValue > 0 && (
            <div className="text-xs text-slate-600">
              Descuento por crédito aplicado: {money(discountValue)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

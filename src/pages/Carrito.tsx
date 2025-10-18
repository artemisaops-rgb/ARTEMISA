// src/pages/Carrito.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query as fsQuery, where, documentId } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { useOwnerMode } from "@/contexts/OwnerMode";

import {
  checkoutStrict,
  deliverOrder,
  type CartItem as PosCartItem,
  type PayMethod,
  calcTotals,
} from "@/lib/pos.helpers";

import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { redeemOneFreeBeverage } from "@/lib/customers";

const BEV_CATS = ["frappes", "coldbrew", "bebidas calientes"];

// ---------- helpers de texto ----------
function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

// ---------- tipos locales ----------
type UICartItem = PosCartItem & { cartKey: string };
type CustomerUI = {
  id: string;
  name: string;             // seguro para UI (displayName | email | "Cliente")
  email?: string;
  tier?: string | null;     // opcional
  freeCredits: number;      // 0 si no existe
};

// Normaliza cualquier forma de CustomerLite a CustomerUI para la UI
function normalizeCustomer(c: any): CustomerUI {
  return {
    id: String(c?.id ?? c?.uid ?? ""),
    name: String(c?.name ?? c?.displayName ?? c?.email ?? "Cliente"),
    email: c?.email ? String(c.email) : undefined,
    tier: c?.tier ?? c?.membershipTier ?? null,
    freeCredits: Number(c?.freeCredits ?? c?.credits ?? 0) || 0,
  };
}

export default function Carrito() {
  const { items, inc, dec, remove, clear } = useCart();

  const { user } = useAuth();
  const { role, isStaff, realRole } = useRole(user?.uid);
  const { mode } = useOwnerMode();

  const orgId = getOrgId();

  // ------ estado de pago / permisos ------
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [loading, setLoading] = useState(false);

  const isWorkerReal = role === "worker";
  const ownerMonitor = realRole === "owner" && mode === "monitor";
  const ownerTotal = realRole === "owner" && mode === "control";
  const canOperateByRole = isWorkerReal || ownerTotal;

  // ------ cliente / búsqueda ------
  const [fastSale, setFastSale] = useState<boolean>(isStaff);
  const [q, setQ] = useState("");

  const { results, loading: searching, hasMore, fetchMore } = useCustomerSearch(orgId, q, 12);

  // normalizamos resultados para que la UI tenga name/tier/freeCredits sin romper tipos
  const normResults: CustomerUI[] = useMemo(
    () => (results || []).map((c: any) => normalizeCustomer(c)),
    [results]
  );

  const [selected, setSelected] = useState<CustomerUI | null>(null);

  useEffect(() => {
    if (!isStaff) {
      setFastSale(false);
      setSelected(null);
    } else {
      setFastSale(true);
    }
  }, [isStaff]);

  // ------ bebidas en carrito (para canje) ------
  const [bevById, setBevById] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const ids = Array.from(
      new Set(
        (items || [])
          .map((it: any) => String(it.id ?? ""))
          .map((raw) => (raw.includes(":") ? raw.split(":")[0]! : raw))
          .filter(Boolean)
      )
    );
    if (!ids.length) {
      setBevById({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result: Record<string, boolean> = {};
        const CHUNK = 10;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const qy = fsQuery(collection(db, "products"), where(documentId(), "in", slice));
          const snap = await getDocs(qy);
          snap.forEach((d) => {
            const v: any = d.data();
            const cat = String(v?.category || "").toLowerCase();
            result[d.id] = BEV_CATS.includes(cat);
          });
        }
        if (!cancelled) setBevById(result);
      } catch {
        if (!cancelled) setBevById({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const customerIdForCheckout = useMemo(() => {
    if (fastSale) return null;
    if (isStaff) return selected?.id || null;
    return user?.uid || null;
  }, [isStaff, fastSale, selected?.id, user?.uid]);

  const uiItems: UICartItem[] = useMemo(() => {
    return (items || []).map((it: any) => {
      const rawId = String(it.id ?? "");
      const productId = rawId.includes(":") ? rawId.split(":")[0]! : rawId;
      const rawCat = String(it.category || "").toLowerCase();
      const inferredBeverage = bevById[productId] === true;
      const isBeverage = Boolean(it.isBeverage) || BEV_CATS.includes(rawCat) || inferredBeverage;
      const out: UICartItem = {
        cartKey: rawId,
        id: productId,
        name: String(it.name ?? ""),
        price: Number.isFinite(Number(it.price)) ? Number(it.price) : 0,
        qty: Number(it.qty) || 0,
        recipe: it.recipe || {},
        category: rawCat || undefined,
        isBeverage,
      };
      if (it.sizeId) out.sizeId = String(it.sizeId);
      if (it.sizeName) out.sizeName = String(it.sizeName);
      return out;
    });
  }, [items, bevById]);

  const beveragesInCart = useMemo(
    () => uiItems.filter((it) => it.isBeverage && it.qty > 0 && it.price > 0),
    [uiItems]
  );
  const cheapestBeverageUnit = useMemo(() => {
    if (!beveragesInCart.length) return 0;
    return Math.min(...beveragesInCart.map((it) => Number(it.price) || 0));
  }, [beveragesInCart]);

  const [useCredit, setUseCredit] = useState(false);
  const canRedeem = !fastSale && !!selected && Number(selected.freeCredits) > 0 && cheapestBeverageUnit > 0;
  useEffect(() => {
    if (!canRedeem) setUseCredit(false);
  }, [canRedeem]);

  const discountValue = useMemo(
    () => (useCredit ? cheapestBeverageUnit : 0),
    [useCredit, cheapestBeverageUnit]
  );

  const itemsForCheckout: PosCartItem[] = useMemo(() => {
    const base = uiItems.map(({ cartKey, ...rest }) => rest);
    if (discountValue <= 0) return base;
    return [
      ...base,
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
  }, [uiItems, discountValue]);

  const totals = useMemo(() => calcTotals(itemsForCheckout), [itemsForCheckout]);
  const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;

  const pagar = async () => {
    if (loading) return;
    if (!canOperateByRole) return alert("No tienes permisos para confirmar pagos con este usuario.");
    try {
      if (!itemsForCheckout.length) return alert("No hay productos en el carrito");
      if (!user?.uid) return alert("Debes iniciar sesión");
      setLoading(true);

      const cid = customerIdForCheckout;
      const orderId = await checkoutStrict(db, itemsForCheckout, payMethod, user.uid, cid);
      await deliverOrder(db, orderId);

      if (cid && useCredit && selected?.id) {
        await redeemOneFreeBeverage(db, selected.id);
      }

      clear();
      alert("Venta registrada.");
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

      {ownerMonitor && (
        <div className="rounded-2xl border bg-amber-50 text-amber-800 p-3">
          Estás en <b>modo Owner (monitor)</b>. Para operar, cambia a <b>Modo Control total</b> o usa una cuenta <b>Worker</b>.
        </div>
      )}

      {uiItems.length === 0 && <div className="text-slate-500">Tu carrito está vacío.</div>}

      {uiItems.map((it) => (
        <div key={it.cartKey} className="bg-white border rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">
              {fixText(it.name)} {it.sizeName ? `(${fixText(it.sizeName)})` : ""}{" "}
              {it.category ? ` ${fixText(it.category)}` : ""}{" "}
              {it.isBeverage && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-sky-50 border">Bebida</span>}
            </div>
            <div className="text-sm text-slate-600">{money(it.price)} c/u</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 border rounded-lg" onClick={() => dec(it.cartKey)}>-</button>
            <div className="w-6 text-center">{it.qty}</div>
            <button className="px-3 py-1 border rounded-lg" onClick={() => inc(it.cartKey)}>+</button>
            <div className="w-28 text-right font-medium">{money(it.price * it.qty)}</div>
            <button className="px-3 py-1 border rounded-lg" onClick={() => remove(it.cartKey)}>Quitar</button>
          </div>
        </div>
      ))}

      {/* Staff: elegir modo y cliente */}
      {isStaff && (
        <div className={`bg-white border rounded-2xl p-4 space-y-3 ${ownerMonitor ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="font-semibold">Modo de venta</div>
          <div className="flex gap-2">
            <button
              className={"px-3 py-1 rounded-xl border " + (fastSale ? "bg-orange-500 text-white border-orange-500" : "")}
              onClick={() => setFastSale(true)}
              title="No se registran sellos ni historial de cliente"
            >
              Sin cliente (rápida)
            </button>
            <button
              className={"px-3 py-1 rounded-xl border " + (!fastSale ? "bg-orange-500 text-white border-orange-500" : "")}
              onClick={() => setFastSale(false)}
              title="Asigna un cliente para fidelización"
            >
              Asignar cliente
            </button>
          </div>

          {/* Selector de cliente */}
          {!fastSale && (
            <div className="mt-2 space-y-3">
              {!selected ? (
                <>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar cliente por nombre, correo o teléfono…"
                    className="w-full border rounded-xl px-3 py-2"
                  />
                  <div className="text-xs text-slate-500">
                    {searching ? "Buscando…" : normResults.length ? "Selecciona un cliente" : "Sin resultados"}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {normResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="text-left border rounded-xl p-3 hover:bg-slate-50"
                      >
                        <div className="font-medium">{fixText(c.name)}</div>
                        <div className="text-xs text-slate-600">
                          {c.tier ? `Nivel ${c.tier}` : "Sin nivel"} · Créditos: {Number(c.freeCredits || 0)}
                        </div>
                      </button>
                    ))}
                  </div>
                  {hasMore && (
                    <button className="px-3 py-1 border rounded-xl" onClick={fetchMore}>
                      Cargar más
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-start justify-between gap-3 border rounded-2xl p-3">
                  <div>
                    <div className="font-semibold">{fixText(selected.name)}</div>
                    <div className="text-xs text-slate-600">
                      {selected.tier ? `Nivel ${selected.tier}` : "Sin nivel"} · Créditos de bebida: {Number(selected.freeCredits || 0)}
                    </div>

                    {/* Canje de crédito */}
                    {canRedeem ? (
                      <label className="mt-2 inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="scale-110"
                          checked={useCredit}
                          onChange={(e) => setUseCredit(e.target.checked)}
                        />
                        Canjear <b>1 bebida gratis</b> (aplica al ítem más barato del carrito)
                      </label>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">
                        {Number(selected?.freeCredits || 0) <= 0
                          ? "No tiene créditos disponibles."
                          : beveragesInCart.length === 0
                          ? "Agrega al menos 1 bebida para canjear."
                          : "El canje no aplica en este carrito."}
                      </div>
                    )}
                  </div>
                  <button className="px-3 py-1 border rounded-xl" onClick={() => setSelected(null)}>
                    Cambiar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Método de pago */}
      {uiItems.length > 0 && (
        <div className={`bg-white border rounded-2xl p-4 space-y-2 ${ownerMonitor ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="text-sm text-slate-600">Método de pago</div>
          <div className="flex gap-2 flex-wrap">
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

      {/* Totales + Confirmación */}
      {uiItems.length > 0 && (
        <div className="bg-white border rounded-2xl p-4 space-y-2">
          <div className="space-y-1 text-sm text-slate-700">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span>Descuento</span><span>-{money(totals.discount)}</span></div>}
            {totals.tax > 0 && <div className="flex justify-between"><span>IVA</span><span>{money(totals.tax)}</span></div>}
            {Math.abs(totals.roundDelta) > 0 && <div className="flex justify-between"><span>Redondeo</span><span>{money(totals.roundDelta)}</span></div>}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xl font-semibold">Total {money(totals.totalRounded)}</div>
            <div className="flex gap-3">
              <button className="px-3 py-2 border rounded-xl" onClick={clear} disabled={loading}>Vaciar</button>
              <button
                className="px-3 py-2 rounded-xl bg-orange-500 text-white border border-orange-500"
                onClick={pagar}
                disabled={
                  loading ||
                  !canOperateByRole ||
                  totals.totalRounded <= 0 ||
                  (isStaff && !fastSale && !selected)
                }
                title={
                  !canOperateByRole
                    ? "No tienes permisos para confirmar pagos"
                    : isStaff && !fastSale && !selected
                    ? "Selecciona un cliente"
                    : ""
                }
              >
                {loading ? "Pagando..." : "Confirmar pago"}
              </button>
            </div>
          </div>

          {totals.discount > 0 && (
            <div className="text-xs text-slate-600">Descuento por crédito aplicado: {money(totals.discount)}</div>
          )}
        </div>
      )}
    </div>
  );
}

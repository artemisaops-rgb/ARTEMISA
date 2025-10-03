import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query as fsQuery, where, orderBy } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useCart } from "@/contexts/CartContext";

type Recipe = Record<string, number>;
type Size = { id?: string; name?: string; label?: string; price?: number; recipe?: Recipe };
type Product = {
  id: string;
  name: string;
  price?: number;
  active: boolean;
  photoUrl?: string;
  category: string;
  recipe?: Recipe;
  sizes?: Size[];
};

const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"] as const;

export default function Menu() {
  const { addProduct } = useCart();
  const [raw, setRaw] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(CATS[0]);
  const [onlyActive, setOnlyActive] = useState(false);
  const [chooser, setChooser] = useState<Product | null>(null);

  useEffect(() => {
    const qy = fsQuery(
      collection(db, "products"),
      where("orgId", "==", getOrgId()),
      orderBy("name")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const list: Product[] = [];
      snap.forEach((d) => {
        const x = d.data() as any;
        list.push({
          id: d.id,
          name: String(x.name ?? ""),
          price: Number(x.price) || 0,
          active: Boolean(x.active),
          photoUrl: x.photoUrl ?? "",
          category: String(x.category ?? ""),
          recipe: x.recipe ?? {},
          sizes: Array.isArray(x.sizes) ? x.sizes : [],
        });
      });
      setRaw(list);
    });
    return () => unsub();
  }, []);

  const products = useMemo(() => {
    const text = q.trim().toLowerCase();
    return raw
      .filter((p) => (onlyActive ? p.active : true))
      .filter((p) => String(p.category ?? "").toLowerCase() === cat)
      .filter((p) => p.name.toLowerCase().includes(text));
  }, [raw, q, cat, onlyActive]);

  const onAdd = (p: Product) => {
    const hasSizes = (p.sizes?.length ?? 0) > 0;
    if (hasSizes) {
      setChooser(p);
      return;
    }
    addProduct({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      qty: 1,
      recipe: p.recipe || {},
      sizeId: "",
      sizeName: "",
    } as any);
  };

  const sizeName = (s: Size, idx: number) => String(s?.name ?? s?.label ?? `tamao ${idx + 1}`);
  const sizeKey = (s: Size, idx: number) => String(s?.id ?? s?.name ?? s?.label ?? idx);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4" style={{ paddingBottom: "var(--bottom-bar-space, 160px)" }}>
      {/* buscador */}
      <div className="flex items-center gap-3">
        <input
          className="flex-1 border rounded-xl px-4 py-3"
          placeholder="Buscar productos..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {/* categoras */}
      <div className="flex gap-2 overflow-auto no-scrollbar">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "px-3 py-1 rounded-full border whitespace-nowrap " +
              (cat === c ? "bg-orange-500 text-white border-orange-500" : "bg-white")
            }
          >
            {c}
          </button>
        ))}
      </div>

      {/* cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {products.map((p) => {
          const hasSizes = (p.sizes?.length ?? 0) > 0;
          return (
            <div key={p.id} className="bg-white border rounded-2xl overflow-hidden flex flex-col">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.name} className="h-40 w-full object-cover" />
              ) : (
                <div className="h-40 w-full bg-slate-100 flex items-center justify-center text-slate-400">Sin foto</div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-slate-600 mt-1">
                  {hasSizes ? "Con tamaos" : `$${Number(p.price || 0).toLocaleString()}`}
                </div>
                <div className="mt-auto pt-3">
                  <button onClick={() => onAdd(p)} className="w-full rounded-xl bg-[var(--brand,#f97316)] text-white py-2">
                    Aadir
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {products.length === 0 && <div className="text-sm text-slate-500">Sin resultados.</div>}
      </div>

      {/* colchn */}
      <div aria-hidden style={{ height: 8 }} />

      {/* modal elegir tamao */}
      {chooser && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setChooser(null);
          }}
        >
          <div
            className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-3 max-h-[85vh] overflow-auto md:mb-0"
            style={{ marginBottom: "var(--bottom-bar-space, 160px)" }}
          >
            <div className="font-semibold text-lg">Elegir tamao</div>

            <div className="space-y-2">
              {(chooser.sizes || []).map((s, idx) => {
                const displayName = sizeName(s, idx);
                const key = sizeKey(s, idx);
                const price = Number(s?.price || 0);
                return (
                  <button
                    key={`${chooser.id}-${key}`}
                    onClick={() => {
                      addProduct({
                        id: `${chooser!.id}:${key}`,
                        name: chooser!.name,
                        sizeId: String(key),
                        sizeName: displayName,
                        price,
                        qty: 1,
                        recipe: s?.recipe || {},
                      } as any);
                      setChooser(null);
                    }}
                    className="w-full border rounded-xl px-4 py-3 flex items-center justify-between hover:bg-slate-50"
                  >
                    <span className="font-medium">{displayName}</span>
                    <span className="text-slate-600">${price.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>

            <button className="w-full py-2 border rounded-xl" onClick={() => setChooser(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

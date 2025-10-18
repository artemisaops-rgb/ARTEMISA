import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query as fsQuery, where } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";

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

const ORDERED_DEFAULTS = ["frappes", "cold brew", "bebidas calientes", "comida"] as const;

function fixText(s?: string) {
  if (!s) return "";
  try { return s.normalize("NFC"); } catch { return s; }
}
const slug = (s?: string) => fixText(s).trim().toLowerCase().replace(/\s+/g, " ");

function sizeInitial(label: string) {
  const l = label.toLowerCase();
  if (/(peque|small|chico)/.test(l)) return "S";
  if (/(media|mediano|medium)/.test(l)) return "M";
  if (/(gran|large)/.test(l)) return "L";
  return label.charAt(0).toUpperCase();
}

export default function Menu() {
  const { addProduct } = useCart();
  const { user } = useAuth();
  const { role, realRole } = useRole(user?.uid);
  const { mode } = useOwnerMode();

  const isClient = role === "client";
  const isOwnerMonitor = realRole === "owner" && mode === "monitor";
  // Cliente o Owner en modo monitor → solo visual
  const readOnly = isClient || isOwnerMonitor;

  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");

  const [chooser, setChooser] = useState<Product | null>(null);

  useEffect(() => {
    const qy = fsQuery(collection(db, "products"), where("orgId", "==", getOrgId()), orderBy("name"));
    const unsub = onSnapshot(qy, (snap) => {
      const xs: Product[] = [];
      snap.forEach((d) => {
        const x: any = d.data();
        xs.push({
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
      setRaw(xs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const found = Array.from(
      new Set(raw.map((p) => slug(p.category)).filter(Boolean).map((s) => s.replace(/\s+/g, " ")))
    );
    const byDefault = ORDERED_DEFAULTS.filter((k) => found.includes(k));
    const rest = found.filter((k) => !ORDERED_DEFAULTS.includes(k as any)).sort();
    const list = [...byDefault, ...rest];
    return list.length ? list : (["frappes"] as string[]);
  }, [raw]);

  useEffect(() => { if (!cat && categories.length) setCat(categories[0]); }, [categories, cat]);

  const products = useMemo(() => {
    const t = slug(q);
    const inCat = raw.filter((p) => slug(p.category) === cat);
    return inCat.filter((p) => slug(p.name).includes(t));
  }, [raw, q, cat]);

  const onAdd = (p: Product) => {
    const hasSizes = (p.sizes?.length ?? 0) > 0;

    if (readOnly) {
      // Solo visual: si tiene tamaños abrimos modal para ver precios
      if (hasSizes) setChooser(p);
      return;
    }

    if (hasSizes) { setChooser(p); return; }
    addProduct({
      id: p.id, name: fixText(p.name), price: Number(p.price) || 0, qty: 1,
      recipe: p.recipe || {}, sizeId: "", sizeName: "",
    } as any);
  };

  return (
    <div className="container-app space-y-4" style={{ paddingBottom: "var(--bottom-bar-space,140px)" }}>
      {/* Header + búsqueda */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-white via-white to-transparent pt-3">
        <SearchBar value={q} onChange={setQ} placeholder={readOnly ? "Buscar en la carta..." : "Buscar productos..."} />

        {/* Chips de categorías */}
        <div className="atl-chips">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`atl-chip ${cat === c ? "is-active" : ""}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de productos */}
      <div className="menu-grid">
        {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}

        {!loading && products.map((p) => {
          const hasSizes = (p.sizes?.length ?? 0) > 0;

          // En solo visual:
          // - Sin tamaños → badge "solo" y CTA deshabilitado
          // - Con tamaños → sin badge (para abrir modal) y CTA "Ver tamaños"
          const badge = readOnly
            ? (hasSizes ? undefined : ("solo" as const))
            : (p.active ? ("activo" as const) : ("agotado" as const));

          return (
            <ProductCard
              key={p.id}
              name={fixText(p.name)}
              price={hasSizes ? undefined : Number(p.price || 0)}
              photoUrl={p.photoUrl}
              badge={badge}
              onAdd={() => onAdd(p)}
              actionLabel={readOnly ? (hasSizes ? "Ver tamaños" : "—") : (hasSizes ? "Elegir tamaño" : "Añadir")}
              density="compact"
            />
          );
        })}
      </div>

      {!loading && !products.length && (
        <div className="text-center text-slate-500 py-10">
          <div className="text-lg font-medium">Sin resultados</div>
          <div className="text-sm">Prueba buscando otro producto o cambia de categoría.</div>
        </div>
      )}

      {/* ===== MODAL DE TAMAÑOS ===== */}
      {chooser && (
        <div
          className="atl-size-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setChooser(null); }}
        >
          <div className="atl-size-card" style={{ marginBottom: "var(--bottom-bar-space,160px)" }}>
            {/* Header */}
            <div className="atl-size-head">
              {chooser.photoUrl ? (
                <img src={chooser.photoUrl} alt="" className="atl-size-thumb" />
              ) : (
                <div className="atl-size-thumb atl-size-thumb--empty" />
              )}
              <div className="atl-size-title">
                <div className="atl-size-cat">{fixText(chooser.category)}</div>
                <div className="atl-size-name">{fixText(chooser.name)}</div>
              </div>
              <button className="atl-x" onClick={() => setChooser(null)} aria-label="Cerrar">✕</button>
            </div>

            {/* Opciones */}
            <div className="atl-size-grid">
              {(chooser.sizes || []).map((s, idx) => {
                const key = String(s?.id ?? s?.name ?? s?.label ?? idx);
                const label = String(s?.name ?? s?.label ?? `Tamaño ${idx + 1}`);
                const price = Number(s?.price || 0);
                const initial = sizeInitial(label);
                return (
                  <button
                    key={key}
                    className="atl-size-btn"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return; // solo visual
                      addProduct({
                        id: `${chooser.id}:${key}`,
                        name: fixText(chooser.name),
                        sizeId: key, sizeName: label,
                        price, qty: 1, recipe: s?.recipe || {},
                      } as any);
                      setChooser(null);
                    }}
                  >
                    <span className="atl-token">{initial}</span>
                    <span className="atl-size-label">{label}</span>
                    <span className="atl-size-price">${price.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>

            {/* Cerrar */}
            <div className="atl-size-foot">
              <button className="atl-cancel" onClick={() => setChooser(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Estilos locales ===== */}
      <style>{`
        .menu-grid{
          display:grid; gap:14px;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }
        @media (min-width: 1024px){
          .menu-grid{ gap:16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
        }
        .skeleton{
          border-radius:18px; border:1px solid var(--atl-ice); background:#fff;
          height: 240px; overflow:hidden; position:relative;
        }
        .skeleton::before{
          content:""; position:absolute; inset:0;
          background: linear-gradient(90deg,#f1f5f9, #eef2f7 30%, #f1f5f9 60%);
          animation: sk 1.4s infinite linear;
        }
        @keyframes sk{ 0%{transform:translateX(-20%)} 100%{transform:translateX(20%)} }

        .atl-chips{ margin-top:12px; display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }
        .atl-chip{
          padding:8px 12px; border-radius:999px; border:1px solid var(--atl-ice);
          background:#fff; color:#475467; font-size:13px; text-transform:capitalize;
          transition: box-shadow .15s ease, transform .05s ease, background .15s ease; white-space:nowrap;
        }
        .atl-chip:hover{ box-shadow:0 8px 18px rgba(10,39,64,.10); }
        .atl-chip:active{ transform:scale(.98); }
        .atl-chip.is-active{
          background:linear-gradient(180deg,var(--atl-azure),var(--atl-quartz));
          color:var(--atl-navy); border-color:transparent; box-shadow:0 10px 24px rgba(0,200,255,.20);
        }

        .atl-size-backdrop{ position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.45);
          display:flex; align-items:flex-end; justify-content:center; }
        @media (min-width: 768px){ .atl-size-backdrop{ align-items:center; } }

        .atl-size-card{
          width:100%; max-width:640px; background:#fff; border-radius:20px 20px 0 0;
          border:1px solid var(--atl-ice); box-shadow:0 30px 60px rgba(10,39,64,.25);
          overflow:hidden;
        }
        @media (min-width: 768px){ .atl-size-card{ border-radius:20px; } }

        .atl-size-head{
          display:flex; align-items:center; gap:12px; padding:14px 14px;
          background: linear-gradient(180deg, rgba(110,246,232,.20), rgba(0,200,255,.10));
          border-bottom:1px solid var(--atl-ice);
        }
        .atl-size-thumb{ width:48px; height:48px; border-radius:10px; object-fit:cover; border:1px solid var(--atl-ice); }
        .atl-size-thumb--empty{ background:#f1f5f9; }
        .atl-size-title{ min-width:0; }
        .atl-size-cat{ font-size:11px; color:#637381; text-transform:capitalize; }
        .atl-size-name{ font-weight:700; color:var(--atl-navy); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        .atl-x{
          margin-left:auto; width:36px; height:36px; border-radius:10px; border:1px solid var(--atl-ice);
          background:#fff; font-weight:700; color:#475467; display:grid; place-items:center;
        }
        .atl-x:hover{ background:#f8fafc; }

        .atl-size-grid{ display:grid; gap:10px; padding:14px; grid-template-columns: 1fr; }
        @media (min-width: 520px){ .atl-size-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (min-width: 768px){ .atl-size-grid{ grid-template-columns: repeat(3, minmax(0,1fr)); } }

        .atl-size-btn{
          display:flex; align-items:center; gap:10px; padding:12px 12px;
          border:1px solid var(--atl-ice); border-radius:14px; background:#fff;
          transition: box-shadow .18s ease, transform .04s ease, border-color .18s ease;
        }
        .atl-size-btn:hover{ border-color:var(--atl-azure); box-shadow:0 12px 22px rgba(0,200,255,.20); }
        .atl-size-btn:active{ transform: scale(.98); }
        .atl-size-btn:disabled{ opacity:.6; cursor:not-allowed; }

        .atl-token{ width:36px; height:36px; border-radius:12px; display:grid; place-items:center;
          font-weight:800; color:var(--atl-navy);
          background: linear-gradient(180deg, var(--atl-azure), var(--atl-quartz));
          box-shadow: 0 8px 18px rgba(0,200,255,.25);
        }
        .atl-size-label{ font-weight:600; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .atl-size-price{ margin-left:auto; font-weight:700; color:#475467; }

        .atl-size-foot{ padding:10px 14px 16px; border-top:1px solid var(--atl-ice); background:#fff; }
        .atl-cancel{ width:100%; height:44px; border-radius:12px; border:1px solid var(--atl-ice);
          background:#fff; font-weight:600; color:#334155; }
        .atl-cancel:hover{ background:#f8fafc; }
      `}</style>
    </div>
  );
}

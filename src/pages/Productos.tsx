// src/pages/Productos.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query as fsQuery,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { motion, AnimatePresence } from "framer-motion";

import FrappeStudio from "@/components/FrappeStudio";
import type { VizItem, VizKind } from "@/helpers/frappe";

/* ================== Tipos ================== */
type Recipe = Record<string, number>;
type SizeChecks = { baseOk?: boolean; finalOk?: boolean };
type Size = {
  id: string;
  name: string;
  price: number;
  recipe: Recipe;
  recipeOrder?: string[];
  notes?: string;
  checks?: SizeChecks;     // ⬅ nuevo
};
type Product = { id: string; name: string; category: string; active: boolean; sizes: Size[] };

type Unit = "g" | "ml" | "u";
type InventoryItem = { id: string; name: string; unit?: Unit; costPerUnit?: number };

/* ================== Utilidades ================== */
const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"] as const;
type Cat = typeof CATS[number];

const emptyProduct = (): Product => ({ id: "", name: "", category: "frappes", active: true, sizes: [] });
const catIcon = (c: string) => (c === "frappes" ? "🧋" : c === "coldbrew" ? "🧊" : c === "bebidas calientes" ? "☕" : "🍔");
function cls(...xs: Array<string | false | null | undefined>) { return xs.filter(Boolean).join(" "); }
function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch { return s.normalize("NFC"); }
}
const normalize = (s: string) => fixText(s).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Clasificación (estética + semántica) */
function classify(name: string): {
  role: "liquid" | "sparkling" | "ice" | "syrup" | "topping" | "whipped" | "base" | "ignore";
  color: string;
} {
  const n = normalize(name);
  if (/(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[ée]rmica|pitillos|vaso(?!.*(cart[oó]n|pl[aá]stico|8 oz|12 oz)))/.test(n)) return { role: "ignore", color: "#ffffff" };
  if (/(detergente|desinfectante|jab[oó]n)/.test(n)) return { role: "ignore", color: "#ffffff" };
  if (/(hielo|ice)/.test(n)) return { role: "ice", color: "#e7f5ff" };
  if (/(t[oó]nica|tonica|soda|sparkling)/.test(n)) return { role: "sparkling", color: "#cfe9ff" };
  if (/(espresso|caf[eé]|cold ?brew|concentrado cold brew)/.test(n)) return { role: "liquid", color: "#4a2c21" };
  if (/(leche(?! en polvo)|avena)/.test(n)) return { role: "liquid", color: "#f3e6d4" };
  if (/(milo|cacao|chocolate(?!.*blanco)|negro|oscuro)/.test(n)) return { role: "liquid", color: "#6b3e2e" };
  if (/(chocolate.*blanco|blanco)/.test(n)) return { role: "liquid", color: "#fff3e0" };
  if (/(fresa|strawberry|naranja|arándano|arandano)/.test(n)) return { role: "liquid", color: "#ffb3c1" };
  if (/(vainilla)/.test(n)) return { role: "liquid", color: "#f7e7b6" };
  if (/(caramelo|syrup|sirope|jarabe|arequipe|dulce de leche|az[uú]car)/.test(n)) return { role: "syrup", color: "#cc8a2e" };
  if (/(oreo|galleta|cookies?)/.test(n)) return { role: "topping", color: "#2f2f2f" };
  if (/(crema batida|chantilly|whipped)/.test(n)) return { role: "whipped", color: "#ffffff" };
  if (/(base frapp[eé]|base frappe|base)/.test(n)) return { role: "base", color: "#dfe7ff" };
  if (/(agua)/.test(n)) return { role: "liquid", color: "#cfe9ff" };
  return { role: "liquid", color: "#d9c7a2" };
}

/* ====== Hook LS (colapsar receta por tamaño) ====== */
function useLSBool(key: string, initial = false) {
  const [v, setV] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(key);
    return raw === null ? initial : raw === "true";
  });
  useEffect(() => { try { window.localStorage.setItem(key, v ? "true" : "false"); } catch {} }, [key, v]);
  return [v, setV] as const;
}

/* ====== Receta estándar (plantilla por categoría) ====== */
type StdRecipe = { name?: string; recipe: Recipe; recipeOrder?: string[] };
const stdKey = (cat: Cat) => `art:stdRecipe:${cat}`;
const loadStd = (cat: Cat): StdRecipe => {
  if (typeof window === "undefined") return { recipe: {} };
  try { return JSON.parse(localStorage.getItem(stdKey(cat)) || '{"recipe":{}}'); } catch { return { recipe: {} }; }
};
const saveStd = (cat: Cat, r: StdRecipe) => { try { localStorage.setItem(stdKey(cat), JSON.stringify(r)); } catch {} };

/* ====== Firma única de receta (para validar unicidad) ====== */
const recipeSignature = (r: Recipe) =>
  Object.entries(r)
    .map(([id, q]) => [id, Number(q || 0)] as const)
    .filter(([, q]) => Number.isFinite(q))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, q]) => `${id}:${q}`)
    .join("|");

/* ================== Página ================== */
export default function Productos() {
  const [items, setItems] = useState<Product[]>([]);
  const [qtext, setQtext] = useState("");
  const [cat, setCat] = useState<Cat>(CATS[0]);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sizesOpen, setSizesOpen] = useState<Record<string, boolean>>({});
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [stdOpen, setStdOpen] = useState(false);
  const [stdByCat, setStdByCat] = useState<Record<Cat, StdRecipe>>(() => {
    const map = {} as Record<Cat, StdRecipe>;
    (CATS as readonly Cat[]).forEach((c) => (map[c] = loadStd(c)));
    return map;
  });

  const isSizesOpen = (productId: string) => sizesOpen[productId] ?? true;
  const toggleSizes = (productId: string) => setSizesOpen((m) => ({ ...m, [productId]: !(m[productId] ?? true) }));

  /* ===== Carga inicial ===== */
  useEffect(() => {
    (async () => {
      const orgId = getOrgId();

      // Productos
      let snap;
      try {
        snap = await getDocs(fsQuery(collection(db, "products"), where("orgId", "==", orgId), orderBy("name")));
      } catch {
        snap = await getDocs(fsQuery(collection(db, "products"), where("orgId", "==", orgId)));
      }
      const list: Product[] = snap.docs.map((d) => {
        const x: any = d.data();
        const sizes: Size[] = (x.sizes || []).map((s: any, i: number) => ({
          id: String(s.id ?? i + 1),
          name: String(s.name ?? ""),
          price: Number(s.price || 0),
          recipe: (s.recipe || {}) as Recipe,
          notes: String(s.notes ?? ""),
          recipeOrder: Array.isArray(s.recipeOrder) ? (s.recipeOrder as string[]) : undefined,
          checks: (s.checks || {}) as SizeChecks,
        }));
        return { id: d.id, name: String(x.name ?? ""), category: String(x.category ?? "frappes"), active: !!x.active, sizes };
      });
      list.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
      setItems(list);

      // Inventario
      let invSnap;
      try {
        invSnap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId), orderBy("name")));
      } catch {
        invSnap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId)));
      }
      const arr: InventoryItem[] = invSnap.docs.map((d) => {
        const x: any = d.data();
        return { id: d.id, name: String(x.name || ""), unit: x.unit as Unit, costPerUnit: Number(x.costPerUnit || 0) };
      });
      arr.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
      setInv(arr);
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = qtext.trim().toLowerCase();
    return items.filter((p) => p.category === cat).filter((p) => fixText(p.name).toLowerCase().includes(t));
  }, [items, qtext, cat]);

  /* ===== Auditar & Exportar ===== */
  const auditAndExport = () => {
    // 1) recolectar usos
    const rows: Array<{prodId:string; prod:string; sizeId:string; size:string; ingId:string; ing:string; unit:string; qty:number;}> = [];
    const usedIds = new Set<string>();
    const nameOf = (id: string) => fixText(inv.find((x) => x.id === id)?.name || id);
    const unitOf = (id: string) => (inv.find((x) => x.id === id)?.unit ?? "u");

    items.forEach(p => p.sizes.forEach(s => {
      Object.entries(s.recipe || {}).forEach(([ing, qty]) => {
        rows.push({
          prodId: p.id, prod: fixText(p.name),
          sizeId: s.id, size: fixText(s.name),
          ingId: ing, ing: nameOf(ing),
          unit: unitOf(ing), qty: Number(qty || 0),
        });
        usedIds.add(ing);
      });
    }));

    // 2) CSV de recetas
    const csv1 = ["producto,size,ingrediente,unidad,cantidad,producto_id,size_id,ingrediente_id"]
      .concat(rows.map(r => [
        `"${r.prod.replace(/"/g,'""')}"`,
        `"${r.size.replace(/"/g,'""')}"`,
        `"${r.ing.replace(/"/g,'""')}"`,
        r.unit, r.qty,
        r.prodId, r.sizeId, r.ingId
      ].join(","))).join("\n");

    // 3) CSV de inventario no usado
    const notUsed = inv.filter(x => !usedIds.has(x.id));
    const csv2 = ["ingrediente,unidad,costo_por_unidad,id"]
      .concat(notUsed.map(i => [`"${fixText(i.name).replace(/"/g,'""')}"`, i.unit || "u", i.costPerUnit || 0, i.id].join(","))).join("\n");

    const download = (name: string, content: string) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    download("recetas_ingredientes.csv", csv1);
    download("inventario_no_usado.csv", csv2);
    alert(`Auditoría:\n• Ingredientes usados: ${usedIds.size}\n• Ingredientes en bodega sin uso: ${notUsed.length}\nSe descargaron dos CSV para limpieza.`);
  };

  /* ===== Duplicados de receta (unicidad) ===== */
  const findDuplicatesIncluding = (candidate: Product) => {
    type SigRef = { sig: string; label: string; pid: string; sid: string };
    const all: SigRef[] = [];
    const pushProd = (p: Product) => {
      (p.sizes || []).forEach((s) => {
        const sig = recipeSignature(s.recipe || {});
        all.push({ sig, label: `${fixText(p.name)} — ${fixText(s.name)}`, pid: p.id, sid: s.id });
      });
    };
    items.forEach(pushProd);
    pushProd(candidate);
    const map = new Map<string, SigRef[]>();
    all.forEach((r) => { if (!r.sig) return; map.set(r.sig, [...(map.get(r.sig)||[]), r]); });
    const dups: SigRef[][] = [];
    map.forEach((arr) => {
      const distinct = new Map(arr.map(a => [`${a.pid}:${a.sid}`, a]));
      if (distinct.size > 1) dups.push([...distinct.values()]);
    });
    return dups;
  };

  const upsert = async (p: Product) => {
    // verificación de unicidad antes de guardar
    const dups = findDuplicatesIncluding(p);
    if (dups.length) {
      const msg = dups
        .map(group => " - " + group.map(g => g.label).join("  ⇄  "))
        .join("\n");
      const cont = confirm("Atención: hay recetas idénticas entre productos/tamaños diferentes:\n\n" + msg + "\n\n¿Deseas continuar de todas formas?");
      if (!cont) return;
    }

    setSaving(true);
    try {
      const payload = {
        orgId: getOrgId(),
        name: p.name,
        category: p.category,
        active: !!p.active,
        sizes: (p.sizes || []).map((s, i) => ({
          id: String(s.id ?? i + 1),
          name: s.name,
          price: Number(s.price || 0),
          recipe: s.recipe || {},
          recipeOrder: Array.isArray(s.recipeOrder) ? s.recipeOrder : Object.keys(s.recipe || {}),
          notes: s.notes || "",
          checks: s.checks || {}, // ⬅ persistimos checks
        })),
        updatedAt: serverTimestamp(),
      };
      let newId = p.id;
      if (!p.id) { const ref = await addDoc(collection(db, "products"), payload); newId = ref.id; }
      else { await setDoc(doc(db, "products", p.id), payload, { merge: true }); }
      const realId = newId, draftId = p.id;
      setItems((cur) => cur.map((prod) => (prod.id === draftId ? { ...p, id: realId } : prod))
        .sort((a, b) => fixText(a.name).localeCompare(fixText(b.name))));
      setOpen(null);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar producto?")) return;
    await deleteDoc(doc(db, "products", id));
    setItems((cur) => cur.filter((x) => x.id !== id));
  };

  const openStdForActive = () => setStdOpen(true);
  const setStd = (catSel: Cat, r: StdRecipe) => {
    setStdByCat((cur) => {
      const next = { ...cur, [catSel]: r };
      saveStd(catSel, r);
      return next;
    });
  };

  const applyStdToCategory = () => {
    const tmpl = stdByCat[cat];
    if (!tmpl || !Object.keys(tmpl.recipe || {}).length) {
      alert(`Primero define la receta estándar para “${cat}”.`);
      return;
    }
    if (!confirm(`Aplicar la receta estándar de “${cat}” a TODOS los tamaños de TODOS los productos de esta categoría? Reemplaza la receta actual.`)) return;
    setItems((cur) =>
      cur.map((p) => p.category !== cat ? p : ({
        ...p,
        sizes: (p.sizes || []).map((s) => ({
          ...s,
          recipe: { ...(tmpl.recipe || {}) },
          recipeOrder: Array.isArray(tmpl.recipeOrder) ? [...tmpl.recipeOrder] : Object.keys(tmpl.recipe || {}),
          checks: { ...(s.checks||{}), baseOk: true }, // queda cubierta la base
        })),
      }))
    );
    alert("Base aplicada. Recuerda: aún debes añadir el sabor/rasgo de cada producto para que quede OK.");
  };

  /* ===== UI ===== */
  return (
    <main className="container-app p-6 pb-28 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            onClick={() => {
              const draft = { ...emptyProduct(), id: crypto.randomUUID(), name: "Nuevo producto", category: cat };
              setItems((cur) => [draft, ...cur]); setOpen(draft.id);
            }}
          >
            Nuevo
          </button>

          {/* Receta Estándar por categoría */}
          <button className="btn btn-ghost" onClick={openStdForActive} title="Editar receta estándar">
            Editar receta estándar
          </button>
          <button className="btn btn-ghost" onClick={applyStdToCategory} title="Aplicar base a esta categoría">
            Aplicar a la categoría
          </button>

          {/* Auditar & Exportar */}
          <button className="btn btn-ghost" onClick={auditAndExport} title="Exportar CSV + detectar inventario no usado">
            Auditar & Exportar
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-auto pb-1">
        {(CATS as readonly Cat[]).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cls(
              "px-3 py-1 rounded-full border whitespace-nowrap transition",
              cat === c ? "bg-[var(--brand,#6b4cf5)] text-white border-[var(--brand,#6b4cf5)]" : "bg-white hover:bg-slate-50"
            )}
            title={`Filtrar por ${c}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input className="input flex-1" placeholder="Buscar producto..." value={qtext} onChange={(e) => setQtext(e.target.value)} />
      </div>

      <ul className="space-y-3">
        {filtered.map((p) => (
          <li key={p.id} className="rounded-2xl border bg-white" data-prod={p.id}>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-lg">{catIcon(p.category)}</div>
                <div>
                  <div className="font-medium">{fixText(p.name) || "(sin nombre)"} </div>
                  <div className="text-xs text-slate-500">{p.active ? "Activo" : "Inactivo"} · {p.sizes.length} tamaño(s)</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost" onClick={() => setOpen(p.id)}>Editar</button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const current = fixText(p.name) || "";
                    const next = prompt("Nuevo nombre del producto:", current);
                    if (!next) return;
                    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, name: next } : x)));
                    setOpen(p.id);
                  }}
                >
                  Renombrar
                </button>
                {p.id && <button className="btn btn-danger" onClick={() => remove(p.id)}>Eliminar</button>}
              </div>
            </div>

            {open === p.id && (
              <ProductEditor
                p={p}
                isSizesOpen={isSizesOpen}
                toggleSizes={toggleSizes}
                setItems={setItems}
                onCancel={() => setOpen(null)}
                onSave={() => upsert(p)}
                saving={saving}
                inventory={inv}
                stdForCategory={stdByCat[p.category as Cat] || { recipe: {} }}
              />
            )}
          </li>
        ))}
      </ul>

      {/* Modal Receta Estándar de la categoría actual */}
      <StdRecipeModal
        open={stdOpen}
        onClose={() => setStdOpen(false)}
        value={stdByCat[cat]}
        onChange={(r) => setStd(cat, r)}
        inventory={inv}
        category={cat}
      />
    </main>
  );
}

/* =================== Editor de producto =================== */
function ProductEditor({
  p, isSizesOpen, toggleSizes, setItems, onCancel, onSave, saving, inventory, stdForCategory,
}: {
  p: Product;
  isSizesOpen: (id: string) => boolean;
  toggleSizes: (id: string) => void;
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  inventory: InventoryItem[];
  stdForCategory: StdRecipe;
}) {
  // Ctrl/Cmd + S y toggle receta (R)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); }
      if (!inInput && e.key.toLowerCase() === "r") { e.preventDefault(); document.querySelector<HTMLButtonElement>("[data-toggle-recipe]")?.click(); }
      if (inInput && e.key === " ") e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onSave]);

  return (
    <div className="px-4 pb-4 space-y-4">
      {/* Header sticky */}
      <div className="sticky top-14 z-10 -mx-4 px-4 py-3 backdrop-blur bg-white/70 border-b flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 text-lg h-10 min-w-[220px]"
          placeholder="Nombre del producto"
          value={p.name}
          autoFocus
          onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
        />
        <select
          className="input h-10 w-[180px]"
          value={p.category}
          onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, category: e.target.value } : x)))}
        >
          {CATS.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded-full border bg-white">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x)))}
          />
          Activo
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>

      {/* Sección tamaños */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Tamaños</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => toggleSizes(p.id)}>{isSizesOpen(p.id) ? "Ocultar" : "Mostrar"}</button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const s: Size = { id: crypto.randomUUID(), name: "nuevo", price: 0, recipe: {}, notes: "", checks: {} };
                setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, sizes: [...x.sizes, s] } : x)));
              }}
            >
              Añadir tamaño
            </button>
          </div>
        </div>

        {!isSizesOpen(p.id) && (
          <div className="flex flex-wrap gap-2">
            {p.sizes.map((s) => (
              <span key={s.id} className="px-2 py-1 rounded-full border text-xs text-slate-700 bg-white" title={`Precio: $${Number(s.price || 0).toLocaleString()}`}>
                {fixText(s.name)} · ${Number(s.price || 0).toLocaleString()}
              </span>
            ))}
            {p.sizes.length === 0 && <span className="text-sm text-slate-500">Sin tamaños.</span>}
          </div>
        )}

        {isSizesOpen(p.id) && (
          <>
            {p.sizes.length === 0 && <div className="text-sm text-slate-500">Sin tamaños.</div>}
            <div className="space-y-6">
              {p.sizes.map((s) => (
                <div key={s.id} className="space-y-2" data-prod={p.id}>
                  <SizeEditor
                    key={s.id}
                    p={p}
                    s={s}
                    setItems={setItems}
                    inventory={inventory}
                    stdForCategory={stdForCategory}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =============== Size Editor =============== */
function SizeEditor({
  p, s, setItems, inventory, stdForCategory,
}: {
  p: Product;
  s: Size;
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
  inventory: InventoryItem[];
  stdForCategory: StdRecipe;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const drawerSearchRef = useRef<HTMLInputElement | null>(null);
  const [collapsed, setCollapsed] = useLSBool(`art:recipe:${s.id}`, false);

  const unitOf = (id: string): Unit =>
    (inventory.find((x) => x.id === id)?.unit ?? "u");
  const cpuOf = (id: string) => Number(inventory.find((x) => x.id === id)?.costPerUnit || 0);
  const nameOf = (id: string) => fixText(inventory.find((x) => x.id === id)?.name || id);

  const recipe = s.recipe || {};
  const ids = Object.keys(recipe);
  const baseOrder = Array.isArray(s.recipeOrder) ? s.recipeOrder.filter((id) => ids.includes(id)) : [];
  const missing = ids.filter((id) => !baseOrder.includes(id));
  const effectiveOrder = [...baseOrder, ...missing];
  const rows = effectiveOrder.map<[string, number]>((id) => [id, recipe[id]]);

  const update = (patch: Partial<Size>) =>
    setItems((cur) => cur.map((x) => (x.id !== p.id ? x : { ...x, sizes: x.sizes.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) })));

  // ====== PATCH CRÍTICO: permitir 0 y no eliminar al limpiar ======
  const setAmount = (ing: string, amount: number) => {
    const nextRecipe = { ...(s.recipe || {}) };
    const vRaw = Number.isFinite(amount as any) ? Number(amount) : 0;
    const v = Math.max(0, vRaw);
    nextRecipe[ing] = v;                  // ⬅ se mantiene la fila en 0
    let order = Array.isArray(s.recipeOrder) ? [...s.recipeOrder] : [...Object.keys(nextRecipe)];
    if (!order.includes(ing)) order.push(ing);
    update({ recipe: nextRecipe, recipeOrder: order });
  };
  const hardRemove = (ing: string) => {
    const next = { ...(s.recipe || {}) };
    delete next[ing];
    update({ recipe: next, recipeOrder: (s.recipeOrder || []).filter((x) => x !== ing) });
  };

  const onReorder = (fromId: string, toIndex: number) => {
    const order = [...effectiveOrder];
    const fromIndex = order.indexOf(fromId);
    if (fromIndex === -1) return;
    order.splice(fromIndex, 1);
    const idx = Math.max(0, Math.min(toIndex, order.length));
    order.splice(idx, 0, fromId);
    update({ recipeOrder: order });
  };

  const recipeCost = rows.reduce((sum, [ing, amount]) => sum + cpuOf(ing) * Number(amount || 0), 0);
  const m = Number(s.price || 0) - Number(recipeCost || 0);
  const pct = Number(s.price || 0) > 0 ? (m / Number(s.price)) * 100 : 0;

  // VizKind para Studio (mapeamos lo no soportado a 'liquid')
  const toStudioKind = (role: ReturnType<typeof classify>["role"]): VizKind => {
    if (role === "syrup") return "syrup";
    if (role === "ice") return "ice";
    if (role === "topping") return "topping";
    if (role === "sparkling") return "sparkling";
    return "liquid";
  };

  const vizItems: VizItem[] = rows.map(([ing, amount]) => {
    const nm = nameOf(ing);
    return { name: nm, unit: unitOf(ing), amount: Number(amount || 0), type: toStudioKind(classify(nm).role) };
  });

  // ====== Checks (Base OK & Final OK) ======
  const baseMissing = Object.keys(stdForCategory?.recipe || {}).filter((id) => (s.recipe || {})[id] === undefined || Number((s.recipe || {})[id]) <= 0);
  const baseOk = baseMissing.length === 0;
  const setChecks = (patch: Partial<SizeChecks>) => update({ checks: { ...(s.checks || {}), ...patch } });

  useEffect(() => {
    // auto-marcar Base OK si ya quedó cubierta
    if (baseOk && !s.checks?.baseOk) setChecks({ baseOk: true });
    // si vuelve a faltar la base, desmarcamos automáticamente
    if (!baseOk && s.checks?.baseOk) setChecks({ baseOk: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseOk, s.id, JSON.stringify(s.recipe), JSON.stringify(stdForCategory?.recipe||{})]);

  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur-sm p-3">
      {/* Cabecera + métricas + acciones */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div className="md:col-span-2 grid grid-cols-2 gap-2">
          <div>
            <div className="label">Nombre del tamaño</div>
            <input className="input" value={s.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <div className="label">Precio</div>
            <input className="input" type="number" inputMode="numeric" value={String(s.price)} onChange={(e) => update({ price: Number(e.target.value || 0) })} />
          </div>
        </div>

        <div className="md:col-span-2 flex items-center gap-2 justify-start md:justify-end text-sm text-slate-600">
          <span>
            Costo <b>${recipeCost.toLocaleString()}</b> · Margen{" "}
            <b className={cls(m < 0 ? "text-red-600" : "text-emerald-600")}>
              ${m.toLocaleString()} ({pct.toFixed(1)}%)
            </b>
          </span>
        </div>

        <div className="md:col-span-1 flex items-center justify-end gap-1 flex-wrap">
          {/* Chips de estado */}
          <span className={cls("px-2 py-1 rounded-full border text-xs", baseOk ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-amber-500 text-amber-700 bg-amber-50")} title={baseOk ? "Base cubierta" : `Falta base: ${baseMissing.length}`}>
            Base {baseOk ? "OK" : "incompleta"}
          </span>
          <button
            className={cls("px-2 py-1 rounded-full border text-xs", s.checks?.finalOk ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-slate-300 text-slate-600 bg-white")}
            onClick={() => setChecks({ finalOk: !s.checks?.finalOk })}
            title="Marca cuando este tamaño esté listo para vender"
          >
            Producto final {s.checks?.finalOk ? "OK" : "—"}
          </button>

          <button className="btn btn-ghost btn-sm" onClick={() => setStudioOpen(true)} title="Abrir Studio">Studio</button>
          <button className="btn btn-ghost btn-sm" data-toggle-recipe onClick={() => setCollapsed(v => !v)} title="R">
            {collapsed ? "Receta (R)" : "Ocultar (R)"}
          </button>
          <button className={cls("btn btn-ghost btn-sm", drawerOpen && "btn-primary")} onClick={() => setDrawerOpen(v => !v)} title="T">
            Tabla (T)
          </button>
        </div>
      </div>

      {/* ===== Receta (colapsable) ===== */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="recipe"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden mt-3"
          >
            <RecipeTable
              rows={rows}
              nameOf={nameOf}
              unitOf={unitOf}
              cpuOf={cpuOf}
              setAmount={setAmount}
              onRemove={hardRemove}
              onReorder={onReorder}
              inventory={inventory}
              onQuickAdd={(id, qty) => {
                if (!id) return;
                const n = Number.isFinite(qty as any) ? Math.max(0, Number(qty)) : 0;
                setAmount(id, n);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer inventario */}
      <InventoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        inputRef={drawerSearchRef}
        inventory={inventory}
        recipe={s.recipe || {}}
        onAdd={(it, qty) => {
          const cur = Number((s.recipe || {})[it.id] || 0);
          const add = cur > 0 ? cur + qty : qty || (it.unit === "ml" ? 50 : it.unit === "g" ? 20 : 1);
          setAmount(it.id, add);
        }}
      />

      {/* Studio */}
      <FrappeStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        items={vizItems}
        sizeName={s.name}
        productName={p.name}
        onFinish={() => { setCelebrate(true); setTimeout(() => setCelebrate(false), 900); }}
        celebrate={celebrate}
      />
    </div>
  );
}

/* ================= Receta TABLE V2 (drag, coste, quick add, inputs robustos) ================= */
function RecipeTable({
  rows, nameOf, unitOf, cpuOf, setAmount, onRemove, onReorder, inventory, onQuickAdd,
}: {
  rows: [string, number][];
  nameOf: (id: string) => string;
  unitOf: (id: string) => Unit;
  cpuOf: (id: string) => number;
  setAmount: (id: string, amount: number) => void;
  onRemove: (fromId: string) => void | any;
  onReorder: (fromId: string, toIndex: number) => void;
  inventory: InventoryItem[];
  onQuickAdd: (id: string, qty: number) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Soporte de edición sin “parpadeo” al borrar (mantenemos drafts por fila)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const getDisplay = (id: string, amount: number) => (id in drafts ? drafts[id] : String(amount ?? 0));

  // Quick add
  const [qaId, setQaId] = useState<string>("");
  const [qaQty, setQaQty] = useState<string>("0");
  const byName = (txt: string) => inventory.find(i => normalize(i.name) === normalize(txt) || i.id === txt);
  const units = (id: string) => (inventory.find(i => i.id === id)?.unit ?? "u");

  return (
    <div
      className={cls("rounded-2xl border bg-white/90", dragId && "ring-2 ring-sky-200")}
      onDragOver={(e) => { if (!dragId) return; e.preventDefault(); }}
      onDrop={(e) => { if (!dragId) return; e.preventDefault(); const idx = overIndex ?? rows.length; onReorder(dragId, idx); setOverIndex(null); setDragId(null); }}
    >
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="font-medium text-sm">Receta</div>
        <div className="text-xs text-slate-500">Arrastra ⋮ para reordenar</div>
      </div>

      {/* Quick add inline */}
      <div className="px-3 pb-2 grid grid-cols-[1fr_120px_auto] gap-2 items-center">
        <input
          list="inv-list"
          className="input"
          placeholder="Añadir ingrediente… (escribe nombre y elige)"
          value={qaId}
          onChange={(e) => setQaId(e.target.value)}
        />
        <input
          className="input text-center"
          type="number" inputMode="numeric" min={0}
          value={qaQty}
          onChange={(e) => setQaQty(e.target.value)}
          placeholder="cantidad"
        />
        <button
          className="btn btn-sm"
          onClick={() => {
            const it = byName(qaId);
            if (!it) return alert("Selecciona un ingrediente válido de la lista.");
            const q = Number(qaQty || 0);
            onQuickAdd(it.id, Math.max(0, q));
            setQaId("");
            setQaQty(units(it.id) === "u" ? "1" : "0");
          }}
        >Añadir</button>
        <datalist id="inv-list">
          {inventory.map(i => <option key={i.id} value={i.id}>{fixText(i.name)}</option>)}
          {inventory.map(i => <option key={i.id+"-n"} value={fixText(i.name)}>{i.id}</option>)}
        </datalist>
      </div>

      {rows.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">Sin ingredientes todavía.</div>}

      <ul className="divide-y">
        {rows.map(([ing, amount], idx) => {
          const nm = nameOf(ing);
          const u = unitOf(ing);
          const { role, color } = classify(nm);
          const rowCost = Math.max(0, (cpuOf(ing) || 0) * Number(amount || 0));
          const icon =
            role === "liquid" ? "💧" :
            role === "sparkling" ? "🥂" :
            role === "syrup" ? "🧪" :
            role === "ice" ? "🧊" :
            role === "topping" ? "🍪" :
            role === "whipped" ? "🍦" : "🧋";
          const tint = `${color}${color.length === 7 ? "14" : ""}`; // ~8% alpha
          const isOver = overIndex === idx;

          return (
            <li
              key={ing}
              className={cls("px-3 py-2 grid grid-cols-[18px_1fr_auto_auto_auto] items-center gap-2", isOver && "bg-sky-50")}
              style={{ borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${tint}, transparent 30%)` }}
              draggable
              onDragStart={(e) => { setDragId(ing); e.dataTransfer.setData("text/x-recipe-id", ing); }}
              onDragEnd={() => { setDragId(null); setOverIndex(null); }}
              onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOverIndex(idx); }}
            >
              <div className="cursor-grab text-slate-400 select-none" title="Arrastra">⋮⋮</div>

              <div className="min-w-0 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[12px] border" style={{ borderColor: color }}>
                  {icon}
                </span>
                <span className="truncate text-sm">{nm}</span>
                <span className="ml-1 text-[11px] px-1.5 py-[2px] rounded-full border" style={{ borderColor: color, color }}>{role}</span>
              </div>

              <div className="flex items-center gap-1">
                <button className="btn btn-sm" onClick={() => setAmount(ing, Math.max(0, Number(amount || 0) - (u === "u" ? 1 : 10)))} title="–">–</button>
                <input
                  className="input w-24 text-center"
                  type="number"
                  inputMode="numeric"
                  value={getDisplay(ing, amount)}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [ing]: e.target.value }));
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setAmount(ing, n);         // mantiene 0 y no elimina
                  }}
                  onBlur={() => setDrafts((d) => {
                    const { [ing]: _omit, ...rest } = d; return rest;
                  })}
                />
                <span className="text-sm text-slate-500 pl-1">{u}</span>
                <button className="btn btn-sm" onClick={() => setAmount(ing, Number(amount || 0) + (u === "u" ? 1 : 10))} title="+">+</button>
              </div>

              <div className="text-right tabular-nums text-sm text-slate-600">${rowCost.toLocaleString()}</div>

              <button className="btn btn-ghost btn-sm" onClick={() => onRemove(ing)} title="Quitar">✕</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================= Inventory Drawer (con filtro por tipo) ================= */
function InventoryDrawer({
  open, onClose, inputRef, inventory, recipe, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  inventory: InventoryItem[];
  recipe: Recipe;
  onAdd: (it: InventoryItem, qty: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [tab, setTab] = useState<"all" | "liquid" | "syrup" | "ice" | "topping" | "sparkling">("all");

  const finder = (txt: string) => {
    const q = normalize(txt);
    let list = inventory.filter((x) => normalize(x.name).includes(q));
    if (tab !== "all") list = list.filter((x) => classify(x.name).role === tab);
    return list.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
  };
  const matches = finder(search).slice(0, 60);

  const onEnter = () => {
    if (matches.length === 0) return;
    const it = matches[highlight] || matches[0];
    const qty = it.unit === "ml" ? 50 : it.unit === "g" ? 20 : 1;
    if (qty > 0) onAdd(it, qty);
    setSearch(""); setHighlight(0);
    inputRef.current?.focus();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="fixed inset-y-0 right-0 z-[92] w-full md:w-[520px] bg-white border-l shadow-xl flex flex-col"
          initial={{ x: "100%" }}
          animate={{ x: 0, transition: { type: "spring", damping: 22, stiffness: 220 } }}
          exit={{ x: "100%", transition: { duration: 0.2 } }}
          role="dialog"
          aria-label="Tabla de inventario"
        >
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-medium">Tabla de inventario</div>
            <button className="btn btn-sm" onClick={onClose}>Cerrar</button>
          </div>
          <div className="p-3 overflow-auto">
            {/* Tabs por tipo */}
            <div className="flex gap-2 mb-2 flex-wrap">
              {[
                ["all","Todos"],["liquid","Líquidos"],["syrup","Jarabes"],["ice","Hielo"],["topping","Toppings"],["sparkling","Sparkling"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={cls("px-2 py-1 rounded-full border text-xs", tab===k ? "bg-slate-900 text-white border-slate-900" : "bg-white")}
                  onClick={() => setTab(k as any)}
                >{label}</button>
              ))}
            </div>

            <input
              ref={inputRef}
              className="input w-full"
              placeholder="Busca por nombre, Enter para añadir…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") return onEnter();
                if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => Math.min(i + 1, Math.max(0, matches.length - 1))); }
                if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
                if (e.key === "Escape") { (e.currentTarget as HTMLInputElement).blur(); }
              }}
            />
            <div className="mt-2 w-full max-h-80 overflow-auto rounded-xl border bg-white">
              {matches.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">Sin resultados.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-left">Unidad</th>
                      <th className="px-3 py-2 text-left">Añadir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((it, idx) => {
                      const isHi = idx === highlight;
                      return (
                        <tr
                          key={it.id}
                          className={cls("border-t hover:bg-slate-50 cursor-pointer transition", isHi && "bg-sky-50")}
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => { const q = it.unit === "ml" ? 50 : it.unit === "g" ? 20 : 1; onAdd(it, q); setSearch(""); setHighlight(0); inputRef.current?.focus(); }}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ id: it.id, qty: it.unit === "ml" ? 50 : it.unit === "g" ? 20 : 1 }))}
                        >
                          <td className="px-3 py-2"><div className="font-medium">{fixText(it.name)}</div></td>
                          <td className="px-3 py-2 tabular-nums">{it.unit || "u"}</td>
                          <td className="px-3 py-2"><button className="btn btn-sm">+ Añadir</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ================= Modal para Receta Estándar ================= */
function StdRecipeModal({
  open, onClose, value, onChange, inventory, category,
}: {
  open: boolean;
  onClose: () => void;
  value: StdRecipe;
  onChange: (v: StdRecipe) => void;
  inventory: InventoryItem[];
  category: Cat;
}) {
  const [local, setLocal] = useState<StdRecipe>(value || { recipe: {} });
  const unitOf = (id: string): Unit =>
    (inventory.find((x) => x.id === id)?.unit ?? "u");
  const nameOf = (id: string) => fixText(inventory.find((x) => x.id === id)?.name || id);

  useEffect(() => setLocal(value || { recipe: {} }), [value]);

  const ids = Object.keys(local.recipe || {});
  const baseOrder = Array.isArray(local.recipeOrder) ? local.recipeOrder.filter((id) => ids.includes(id)) : [];
  const missing = ids.filter((id) => !baseOrder.includes(id));
  const effectiveOrder = [...baseOrder, ...missing];
  const rows = effectiveOrder.map<[string, number]>((id) => [id, (local.recipe || {})[id]]);

  const setAmount = (id: string, v: number) => {
    const next = { ...(local.recipe || {}) };
    const n = Math.max(0, Number.isFinite(v as any) ? Number(v) : 0);
    next[id] = n;                 // ⬅ no se elimina en 0
    let order = Array.isArray(local.recipeOrder) ? [...local.recipeOrder] : Object.keys(next);
    if (!order.includes(id)) order.push(id);
    setLocal({ ...local, recipe: next, recipeOrder: order });
  };

  const onReorder = (fromId: string, toIndex: number) => {
    const order = [...effectiveOrder];
    const fromIndex = order.indexOf(fromId);
    if (fromIndex === -1) return;
    order.splice(fromIndex, 1);
    const idx = Math.max(0, Math.min(toIndex, order.length));
    order.splice(idx, 0, fromId);
    setLocal({ ...local, recipeOrder: order });
  };

  const [drawer, setDrawer] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[94] bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl border p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Receta estándar — <span className="capitalize">{category}</span></div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setDrawer(true)}>Abrir tabla</button>
            <button className="btn btn-primary" onClick={() => { onChange(local); onClose(); }}>Guardar</button>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Esta es la <b>base</b> (vaso, hielos, leche, etc.). <b>No marca el producto como listo</b>: cada producto aún requiere su sabor/rasgo.
        </p>

        <div className="mt-3">
          <RecipeTable
            rows={rows}
            nameOf={nameOf}
            unitOf={unitOf}
            cpuOf={() => 0}
            setAmount={setAmount}
            onRemove={(id) => {
              const next = { ...(local.recipe||{}) }; delete next[id];
              setLocal({ ...local, recipe: next, recipeOrder: (local.recipeOrder||[]).filter(x => x !== id) });
            }}
            onReorder={onReorder}
            inventory={inventory}
            onQuickAdd={(id, qty) => setAmount(id, qty)}
          />
        </div>

        <InventoryDrawer
          open={drawer}
          onClose={() => setDrawer(false)}
          inputRef={inputRef}
          inventory={inventory}
          recipe={local.recipe || {}}
          onAdd={(it, qty) => {
            const cur = Number((local.recipe || {})[it.id] || 0);
            const add = cur > 0 ? cur + qty : qty;
            setAmount(it.id, add);
          }}
        />
      </div>
    </div>
  );
}

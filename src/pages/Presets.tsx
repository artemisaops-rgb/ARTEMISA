import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDocs, orderBy, query as fsQuery,
  setDoc, deleteDoc, addDoc, serverTimestamp, where,
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
  checks?: SizeChecks;
  /** IDs de inventario que representan maquinaria/equipo requerido (no consumible). */
  tools?: string[];
};
type Product = { id: string; name: string; category: string; active: boolean; sizes: Size[] };

type Unit = "g" | "ml" | "u";

/** Secciones de Bodega alineadas con Plantillas/Receta */
type InventorySection =
  | "Comida"
  | "Bebidas"
  | "Aseo"
  | "Maquinaria"
  | "Desechables"
  | "Otros";

type InventoryItem = {
  id: string;
  name: string;
  unit?: Unit;
  costPerUnit?: number;
  /** NUEVO: secciÃ³n de Bodega */
  section?: InventorySection;
};

/* ================== Utilidades ================== */
const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"] as const;
type Cat = typeof CATS[number];

const emptyProduct = (): Product => ({ id: "", name: "", category: "frappes", active: true, sizes: [] });
const catIcon = (c: string) => (c === "frappes" ? "ðŸ§‹" : c === "coldbrew" ? "ðŸ§Š" : c === "bebidas calientes" ? "â˜•" : "ðŸ”");
function cls(...xs: Array<string | false | null | undefined>) { return xs.filter(Boolean).join(" "); }
function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃƒÃ‚Ã¢]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001f]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch { return s.normalize("NFC"); }
}
const normalize = (s: string) => fixText(s).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ðŸ‘‰ helper seguro para nÃºmeros con coma o punto
const parseDecimal = (s: string) => {
  const n = Number(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** HeurÃ­stica: Â¿es maquinaria/equipo (no consumible)? */
const isEquipmentName = (name: string) =>
  /(licuadora|blender|batidora|cafetera|espresso|granizadora|m[aÃ¡]quina de hielo|freezer|horno|microondas|prensa|molino|grinder|shaker|jarra|vaso medidor|aeropress|v60|chemex|prensa francesa)/i
    .test(normalize(name));

/* ====== ClasificaciÃ³n visual (solo icono; SIN chip de rol para evitar duplicado) ====== */
type Role = "liquid" | "sparkling" | "ice" | "syrup" | "topping" | "whipped" | "base" | "ignore";

const ROLE_COLOR: Record<Role, string> = {
  liquid: "#1ea7fd",
  sparkling: "#60a5fa",
  ice: "#93c5fd",
  syrup: "#f59e0b",
  topping: "#4b5563",
  whipped: "#a7f3d0",
  base: "#818cf8",
  ignore: "#d1d5db",
};

function roleOf(name: string): { role: Role; color: string } {
  const n = normalize(name);
  let role: Role = "liquid";
  if (/(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[Ã©e]rmica|pitillos?)/.test(n)) role = "ignore";
  else if (/(detergente|desinfectante|jab[oÃ³]n)/.test(n)) role = "ignore";
  else if (/(hielo|ice)/.test(n)) role = "ice";
  else if (/(t[oÃ³]nica|tonica|soda|sparkling)/.test(n)) role = "sparkling";
  else if (/(espresso|caf[eÃ©]|cold ?brew|concentrado cold brew)/.test(n)) role = "liquid";
  else if (/(leche(?! en polvo)|avena)/.test(n)) role = "liquid";
  else if (/(milo|cacao|chocolate)/.test(n)) role = "liquid";
  else if (/(vainilla)/.test(n)) role = "liquid";
  else if (/(caramelo|syrup|sirope|jarabe|arequipe|dulce de leche|az[uÃº]car)/.test(n)) role = "syrup";
  else if (/(oreo|galleta|cookies?)/.test(n)) role = "topping";
  else if (/(crema batida|chantilly|whipped)/.test(n)) role = "whipped";
  else if (/(base frapp[eÃ©]|base frappe|base)/.test(n)) role = "base";
  else if (/(agua)/.test(n)) role = "liquid";
  const color = ROLE_COLOR[role];
  return { role, color };
}

/** NUEVO: SecciÃ³n (Bodega) por heurÃ­stica + fallback al campo item.section */
const sectionOf = (inventory: InventoryItem[], id: string): InventorySection => {
  const it = inventory.find((x) => x.id === id);
  if (!it) return "Otros";
  const nm = normalize(it.name);
  if (/(vaso|tapa|pitillo|sorbete|servilleta|domicilio|envase|caja|empaque)/.test(nm)) return "Desechables";
  if (/(licuadora|blender|batidora|cafetera|espresso|granizadora|horno|microondas|molino|grinder|jarra)/.test(nm)) return "Maquinaria";
  if (/(cloro|jab[oÃ³]n|desinfect|limpiador|toalla|aseo)/.test(nm)) return "Aseo";
  if (/(hielo)/.test(nm)) return "Bebidas";
  if (/(leche|syrup|sirope|jarabe|cafÃ©|coffee|cold ?brew|agua|crema|condensada)/.test(nm)) return "Bebidas";
  if (/(galleta|oreo|topping|fruta|milo|cacao|chocolate|granola)/.test(nm)) return "Comida";
  return it.section ?? "Otros";
};

/* ====== Receta estÃ¡ndar (plantilla por categorÃ­a) ====== */
type StdRecipe = { name?: string; recipe: Recipe; recipeOrder?: string[] };
const stdKey = (cat: Cat) => `art:stdRecipe:${cat}`;
const loadStd = (cat: Cat): StdRecipe => {
  if (typeof window === "undefined") return { recipe: {} };
  try { return JSON.parse(localStorage.getItem(stdKey(cat)) || '{"recipe":{}}'); } catch { return { recipe: {} }; }
};
const saveStd = (cat: Cat, r: StdRecipe) => { try { localStorage.setItem(stdKey(cat), JSON.stringify(r)); } catch {} };

/* ====== Firma Ãºnica de receta (para validar unicidad) ====== */
const recipeSignature = (r: Recipe) =>
  Object.entries(r)
    .map(([id, q]) => [id, Number(q || 0)] as const)
    .filter(([, q]) => Number.isFinite(q))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, q]) => `${id}:${q}`)
    .join("|");

/* ====== Helpers de costos/mÃ¡rgenes ====== */
function costForSize(s: Size, invMap: Record<string, InventoryItem>): number {
  return Object.entries(s.recipe || {}).reduce((sum, [ing, q]) => sum + (invMap[ing]?.costPerUnit || 0) * Number(q || 0), 0);
}
const mapOf = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x] as const));

/* ================== PÃ¡gina ================== */
export default function Plantillas() {
  const [items, setItems] = useState<Product[]>([]);
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

  // ðŸ‘‰ NUEVO: modal y handler para aplicar base por producto
  const [applyBaseOpen, setApplyBaseOpen] = useState(false);
  /** Aplica base de la categorÃ­a activa a Plantillas seleccionados */
  const applyStdToProducts = (productIds: string[], mode: "replace" | "merge" = "replace") => {
    const tmpl = stdByCat[cat];
    if (!tmpl || !Object.keys(tmpl.recipe || {}).length) {
      alert(`Primero define la receta estÃ¡ndar para "${cat}".`);
      return;
    }
    const order = Array.isArray(tmpl.recipeOrder) && tmpl.recipeOrder.length ? [...tmpl.recipeOrder] : Object.keys(tmpl.recipe || {});
    const base = tmpl.recipe || {};
    setItems(cur =>
      cur.map(p => {
        if (p.category !== cat) return p;
        if (!productIds.includes(p.id)) return p;
        return {
          ...p,
          sizes: (p.sizes || []).map(s => {
            const nextRecipe = mode === "replace"
              ? { ...base }
              : {
                  ...(s.recipe || {}),
                  ...Object.fromEntries(
                    Object.entries(base).filter(([id, qty]) => {
                      const curQty = Number((s.recipe || {})[id] || 0);
                      return !(curQty > 0) && Number(qty || 0) > 0;
                    })
                  ),
                };
            const prevOrder = Array.isArray(s.recipeOrder) && s.recipeOrder.length ? s.recipeOrder : Object.keys(nextRecipe);
            const nextOrder = mode === "replace"
              ? order
              : Array.from(new Set([...prevOrder, ...order]));
            return {
              ...s,
              recipe: nextRecipe,
              recipeOrder: nextOrder,
              checks: { ...(s.checks || {}), baseOk: true },
            };
          }),
        };
      })
    );
    setDirty(true);
    alert(`Base aplicada a ${productIds.length} producto(s) en "${cat}" (${mode === "replace" ? "Reemplazar" : "Combinar"}).`);
  };

  // Guard de cambios
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (!dirty) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const isSizesOpen = (productId: string) => sizesOpen[productId] ?? true;
  const toggleSizes = (productId: string) => setSizesOpen((m) => ({ ...m, [productId]: !(m[productId] ?? true) }));

  /* ===== Carga inicial ===== */
  const prevInvRef = useRef<Record<string, number> | null>(null);
  const [affectedCount, setAffectedCount] = useState<number>(0);
  const [showAffectedBanner, setShowAffectedBanner] = useState(false);

  useEffect(() => {
    (async () => {
      const orgId = getOrgId();
      // Plantillas
      let snap;
      try {
        snap = await getDocs(fsQuery(collection(db, "presets"), where("orgId", "==", orgId), orderBy("name")));
      } catch {
        snap = await getDocs(fsQuery(collection(db, "presets"), where("orgId", "==", orgId)));
      }
      const list: Product[] = snap.docs.map((d) => {
        const x: any = d.data();
        const sizes: Size[] = (x.sizes || []).map((s: any, i: number) => {
          const recipe = (s.recipe || {}) as Recipe;
          const recipeOrder =
            (Array.isArray(s.recipeOrder) && (s.recipeOrder as string[]).length
              ? (s.recipeOrder as string[])
              : Object.keys(recipe)
            ).filter((id) => recipe[id] !== undefined);
          return {
            id: String(s.id ?? i + 1),
            name: String(s.name ?? ""),
            price: Number(s.price || 0),
            recipe,
            notes: String(s.notes ?? ""),
            recipeOrder,
            checks: (s.checks || {}) as SizeChecks,
            tools: Array.isArray(s.tools) ? (s.tools as string[]) : [],
          };
        });
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
        return {
          id: d.id,
          name: fixText(String(x.name || "")),
          unit: x.unit as Unit,
          costPerUnit: Number(x.costPerUnit || 0),
          section: x.section as InventorySection | undefined,
        };
      });
      arr.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));

      // Detectar afectaciÃ³n por cambios de costos
      const nowMap: Record<string, number> = Object.fromEntries(arr.map((x) => [x.id, Number(x.costPerUnit || 0)]));
      const prev = prevInvRef.current;
      if (prev) {
        const changed = new Set<string>();
        Object.keys(nowMap).forEach((id) => { if (prev[id] !== nowMap[id]) changed.add(id); });
        if (changed.size > 0) {
          let cnt = 0;
          list.forEach((p) => p.sizes.forEach((s) => {
            const uses = Object.keys(s.recipe || {}).some((ing) => changed.has(ing));
            if (uses) cnt++;
          }));
          setAffectedCount(cnt);
          setShowAffectedBanner(true);
        }
      }
      prevInvRef.current = nowMap;
      setInv(arr);
    })();
  }, []);

  // Recalcular inventario
  const refreshInventory = async () => {
    const orgId = getOrgId();
    let invSnap;
    try {
      invSnap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId), orderBy("name")));
    } catch {
      invSnap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId)));
    }
    const arr: InventoryItem[] = invSnap.docs.map((d) => {
      const x: any = d.data();
      return {
        id: d.id,
        name: fixText(String(x.name || "")),
        unit: x.unit as Unit,
        costPerUnit: Number(x.costPerUnit || 0),
        section: x.section as InventorySection | undefined,
      };
    });
    arr.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));

    const nowMap: Record<string, number> = Object.fromEntries(arr.map((x) => [x.id, Number(x.costPerUnit || 0)]));
    const prev = prevInvRef.current || {};
    const changed = new Set<string>();
    Object.keys(nowMap).forEach((id) => { if (prev[id] !== nowMap[id]) changed.add(id); });
    let cnt = 0;
    if (changed.size > 0) {
      items.forEach((p) => p.sizes.forEach((s) => {
        const uses = Object.keys(s.recipe || {}).some((ing) => changed.has(ing));
        if (uses) cnt++;
      }));
    }
    setAffectedCount(cnt);
    setShowAffectedBanner(changed.size > 0);
    prevInvRef.current = nowMap;
    setInv(arr);
  };

  const invMap = useMemo(() => mapOf(inv), [inv]);

  // Derivados
  const baseOkFor = (p: Product, s: Size) => {
    const std = stdByCat[p.category as Cat]?.recipe || {};
    const missing = Object.keys(std).filter((id) => (s.recipe || {})[id] === undefined || Number((s.recipe || {})[id]) <= 0);
    return missing.length === 0;
  };

  const summary = useMemo(() => {
    let total = 0, baseOk = 0, finalOk = 0, empty = 0;
    items.filter((p) => p.category === cat).forEach((p) => p.sizes.forEach((s) => {
      total++;
      if (baseOkFor(p, s)) baseOk++;
      if (s.checks?.finalOk) finalOk++;
      if (!Object.keys(s.recipe || {}).length) empty++;
    }));
    return { total, baseOk, finalOk, empty };
  }, [items, cat, invMap, stdByCat]);

  const filtered = useMemo(() => items.filter((p) => p.category === cat), [items, cat]);

  /* ===== Auditar & Exportar ===== */
  const auditAndExport = () => {
    const rows: Array<{prodId:string; prod:string; sizeId:string; size:string; ingId:string; ing:string; unit:string; qty:number;}> = [];
    const usedIds = new Set<string>();
    const nameOf = (id: string) => fixText(inv.find((x) => x.id === id)?.name || id);
    const unitOf = (id: string): Unit => (inv.find((x) => x.id === id)?.unit ?? "u");

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

    const csv1 = ["producto,size,ingrediente,unidad,cantidad,producto_id,size_id,ingrediente_id"]
      .concat(rows.map(r => [
        `"${r.prod.replace(/"/g,'""')}"`,
        `"${r.size.replace(/"/g,'""')}"`,
        `"${r.ing.replace(/"/g,'""')}"`,
        r.unit, r.qty, r.prodId, r.sizeId, r.ingId
      ].join(","))).join("\n");

    const notUsed = inv.filter(x => !usedIds.has(x.id));
    const csv2 = ["ingrediente,unidad,costo_por_unidad,id"]
      .concat(notUsed.map(i => [`"${fixText(i.name).replace(/"/g,'""')}"`, i.unit || "u", i.costPerUnit || 0, i.id].join(","))).join("\n");

    // Maquinaria por producto
    const toolRows: Array<{prod:string; size:string; toolId:string; tool:string}> = [];
    items.forEach(p => p.sizes.forEach(s => (s.tools||[]).forEach(t => {
      toolRows.push({ prod: fixText(p.name), size: fixText(s.name), toolId: t, tool: nameOf(t) });
    })));
    const csv3 = ["producto,size,maquinaria,maquinaria_id"]
      .concat(toolRows.map(r => [`"${r.prod.replace(/"/g,'""')}"`,`"${r.size.replace(/"/g,'""')}"`,`"${r.tool.replace(/"/g,'""')}"`,r.toolId].join(","))).join("\n");

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
    download("maquinaria_por_producto.csv", csv3);
    alert(`AuditorÃ­a:
â€¢ Ingredientes usados: ${usedIds.size}
â€¢ Ingredientes en bodega sin uso: ${notUsed.length}
â€¢ Registros de maquinaria: ${toolRows.length}
Se descargaron tres CSV para operaciÃ³n y limpieza.`);
  };

  /* ===== Duplicados de receta ===== */
  const findDuplicatesIncluding = (candidate: Product) => {
    type SigRef = { sig: string; label: string; pid: string; sid: string };
    const all: SigRef[] = [];
    const pushProd = (p: Product) => {
      (p.sizes || []).forEach((s) => {
        const sig = recipeSignature(s.recipe || {});
        all.push({ sig, label: `${fixText(p.name)} â€” ${fixText(s.name)}`, pid: p.id, sid: s.id });
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

  /* ===== Validaciones y guardado ===== */
  const validateProduct = (p: Product): string | null => {
    if (!p.name.trim()) return "El producto debe tener nombre.";
    if (!p.sizes.length) return "AÃ±ade al menos un tamaÃ±o.";
    const names = p.sizes.map((s) => s.name.trim().toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return `Hay tamaÃ±os con el mismo nombre ("${dup}").`;
    for (const s of p.sizes) {
      if (!s.name.trim()) return "Todos los tamaÃ±os deben tener nombre.";
      if (!(s.price > 0)) return `El tamaÃ±o "${s.name}" debe tener un precio > 0.`;
    }
    return null;
  };

  // âš™ï¸ Parche: upsert siempre persiste el PRODUCTO MÃS RECIENTE que le pasen
  //            y NO pisa el state con un objeto viejo.
  const upsert = async (p: Product) => {
    const err = validateProduct(p);
    if (err) { alert(err); return; }

    const dups = findDuplicatesIncluding(p);
    if (dups.length) {
      const msg = dups.map(g => " - " + g.map(x => x.label).join("  â‡„  ")).join("\n");
      const cont = confirm("AtenciÃ³n: hay recetas idÃ©nticas entre Plantillas/tamaÃ±os diferentes:\n\n" + msg + "\n\nÂ¿Deseas continuar de todas formas?");
      if (!cont) return;
    }

    setSaving(true);
    try {
      const payload = {
        orgId: getOrgId(),
        name: p.name,
        category: p.category,
        active: !!p.active,
        sizes: (p.sizes || []).map((s, i) => {
          const recipe = s.recipe || {};
          const recipeOrder =
            (Array.isArray(s.recipeOrder) && s.recipeOrder.length
              ? s.recipeOrder
              : Object.keys(recipe)
            ).filter((id) => recipe[id] !== undefined);
          return {
            id: String(s.id ?? i + 1),
            name: s.name,
            price: Number(s.price || 0),
            recipe,
            recipeOrder,
            notes: s.notes || "",
            checks: s.checks || {},
            tools: Array.isArray(s.tools) ? s.tools : [],
          };
        }),
        updatedAt: serverTimestamp(),
      };
      let newId = p.id;
      if (!p.id) {
        const ref = await addDoc(collection(db, "presets"), payload);
        newId = ref.id;
      } else {
        await setDoc(doc(db, "presets", p.id), payload, { merge: true });
      }
      const realId = newId, draftId = p.id;

      // ðŸ©¹ No pisar el producto en memoria: solo refrescamos el ID si era nuevo.
      setItems((cur) =>
        cur
          .map((prod) => (prod.id === draftId ? { ...prod, id: realId } : prod))
          .sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)))
      );

      setOpen(null);
      setDirty(false);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const p = items.find((x) => x.id === id);
    const sizes = p?.sizes?.map((s) => `â€¢ ${fixText(s.name)} ($${Number(s.price||0).toLocaleString()})`).join("\n") || "(sin tamaÃ±os)";
    if (!confirm(`Eliminar producto "${fixText(p?.name || "(sin nombre)")}" y ${p?.sizes?.length || 0} tamaÃ±o(s):\n\n${sizes}\n\nEsta acciÃ³n no se puede deshacer.`)) return;
    await deleteDoc(doc(db, "presets", id));
    setItems((cur) => cur.filter((x) => x.id !== id));
  };

  const openStdForActive = () => setStdOpen(true);
  const setStd = (catSel: Cat, r: StdRecipe) => {
    setStdByCat((cur) => { const next = { ...cur, [catSel]: r }; saveStd(catSel, r); return next; });
  };

  const applyStdToCategory = () => {
    const tmpl = stdByCat[cat];
    if (!tmpl || !Object.keys(tmpl.recipe || {}).length) { alert(`Primero define la receta estÃ¡ndar para "${cat}".`); return; }
    if (!confirm(`Aplicar la receta estÃ¡ndar de "${cat}" a TODOS los tamaÃ±os de TODOS los Plantillas de esta categorÃ­a? Reemplaza la receta actual.`)) return;
    setItems((cur) =>
      cur.map((p) => p.category !== cat ? p : ({
        ...p,
        sizes: (p.sizes || []).map((s) => ({
          ...s,
          recipe: { ...(tmpl.recipe || {}) },
          recipeOrder: Array.isArray(tmpl.recipeOrder) && tmpl.recipeOrder.length ? [...tmpl.recipeOrder] : Object.keys(tmpl.recipe || {}),
          checks: { ...(s.checks||{}), baseOk: true },
        })),
      }))
    );
    setDirty(true);
    alert("Base aplicada. AÃ±ade el sabor/rasgo de cada producto y marca Producto final OK.");
  };

  /* ===== UI ===== */
  return (
    <main
      className="container-app p-6 pb-28 space-y-4 bg-[var(--paper,#fffaf5)] text-[var(--ink,#111827)]"
      style={{
        ["--brand" as any]: "#24c7b7",
        ["--accent" as any]: "#ff7ab6",
        ["--paper" as any]: "#fffaf5",
        ["--ink" as any]: "#111827",
      }}
    >
      {/* Tokens y ajustes visuales */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          :root { --paper: #0b1220; --ink: #e5e7eb; }
        }
        .btn, .input, button { outline: none; }
        .btn:focus-visible, .input:focus-visible, button:focus-visible, select:focus-visible, textarea:focus-visible {
          box-shadow: 0 0 0 2px var(--brand,#24c7b7);
        }
        .btn, .input, select { height: 36px; border-radius: 14px; }
        .btn { padding: 0 12px; }
        .btn-primary { background: var(--brand,#24c7b7); color: #fff; }
        .btn-ghost { background: #fff; border: 1px solid rgba(0,0,0,.08); }
        .btn-danger { background: #ef4444; color: #fff; }
        .btn-accent { background: var(--accent,#ff7ab6); color: #fff; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .input[type="number"]::-webkit-outer-spin-button,
        .input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Plantillas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-slate-600 px-2 py-1 rounded-full border bg-white">
            {summary.finalOk}/{summary.total} tamaÃ±os listos Â· Base OK: {summary.baseOk} Â· VacÃ­os: {summary.empty}
          </div>

          <button className="btn" onClick={() => {
            const draft = { ...emptyProduct(), id: crypto.randomUUID(), name: "Nuevo producto", category: cat };
            setItems((cur) => [draft, ...cur]); setOpen(draft.id); setDirty(true);
          }}>Nuevo</button>

          <button className="btn btn-ghost" onClick={openStdForActive}>Receta estÃ¡ndar</button>
          <button className="btn btn-ghost" onClick={() => setApplyBaseOpen(true)}>Aplicar base aâ€¦</button>
          <button className="btn btn-ghost" onClick={applyStdToCategory}>Aplicar base a categorÃ­a</button>
          <button className="btn btn-ghost" onClick={auditAndExport}>Auditar & Exportar</button>
        </div>
      </div>

      {showAffectedBanner && (
        <div className="rounded-xl border bg-amber-50 text-amber-900 px-3 py-2 flex items-center justify-between">
          <div>Margen cambiado: <b>{affectedCount}</b> tamaÃ±o(s) usan ingredientes con costo actualizado.</div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setShowAffectedBanner(false)}>Ocultar</button>
            <button className="btn" onClick={refreshInventory}>Recalcular ahora</button>
          </div>
        </div>
      )}

      {/* Chips de categorÃ­a */}
      <div className="flex gap-2 overflow-auto pb-1">
        {(CATS as readonly Cat[]).map((c) => (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            key={c}
            onClick={() => setCat(c)}
            className={cls(
              "px-3 py-1 rounded-full border whitespace-nowrap transition",
              cat === c ? "bg-[var(--brand,#24c7b7)] text-white border-[var(--brand,#24c7b7)]" : "bg-white hover:bg-slate-50"
            )}
            title={`Filtrar por ${c}`}
          >{c}</motion.button>
        ))}
      </div>

      <ul className="space-y-3">
        {filtered.map((p) => (
          <li key={p.id} className="rounded-2xl border bg-white" data-prod={p.id}>
            {/* Header de producto compacto */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-lg shrink-0">{catIcon(p.category)}</div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{fixText(p.name) || "(sin nombre)"}</div>
                  <div className="text-xs text-slate-500 truncate">cat: <span className="capitalize">{p.category}</span> Â· {p.active ? "Activo" : "Inactivo"} Â· {p.sizes.length} tamaÃ±o(s)</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost" onClick={() => setOpen(p.id)}>Editar</button>
                {p.id && <button className="btn btn-danger" onClick={() => remove(p.id)}>Eliminar</button>}
              </div>
            </div>

            {open === p.id && (
              <ProductEditor
                p={p}
                isSizesOpen={isSizesOpen}
                toggleSizes={toggleSizes}
                setItems={(fn) => { setDirty(true); setItems(fn); }}
                onCancel={() => { if (dirty && !confirm("Hay cambios sin guardar. Â¿Descartar?")) return; setOpen(null); setDirty(false); }}
                onSave={(prod) => upsert(prod)}
                saving={saving}
                inventory={inv}
                stdForCategory={stdByCat[p.category as Cat] || { recipe: {} }}
              />
            )}
          </li>
        ))}
      </ul>

      {/* Modal Receta EstÃ¡ndar */}
      <StdRecipeModal
        open={stdOpen}
        onClose={() => setStdOpen(false)}
        value={stdByCat[cat]}
        onChange={(r) => { setStd(cat, r); setDirty(true); }}
        inventory={inv}
        category={cat}
      />

      {/* NUEVO: Modal para aplicar base a Plantillas */}
      <ApplyBaseModal
        open={applyBaseOpen}
        onClose={() => setApplyBaseOpen(false)}
        products={filtered}
        onApply={(ids, mode) => { if (ids.length) applyStdToProducts(ids, mode); setApplyBaseOpen(false); }}
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
  onSave: (p: Product) => void;
  saving: boolean;
  inventory: InventoryItem[];
  stdForCategory: StdRecipe;
}) {
  // Modal por tamaÃ±o
  const [openSizeId, setOpenSizeId] = useState<string | null>(null);

  // ðŸ”§ Cabecera minimalista con toggle para editar datos
  const [editMeta, setEditMeta] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(p); }
      if (inInput && e.key === " ") e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey as any, true);
  }, [onSave, p]);

  return (
    <div className="px-4 pb-4 space-y-4">
      {/* Header sticky compacto (sin inputs visibles) */}
      <div className="sticky top-14 z-10 -mx-4 px-4 py-3 backdrop-blur bg-white/70 border-b flex flex-wrap items-center gap-3">
        <div className="font-semibold text-lg">{p.name || "(sin nombre)"}</div>
        <span className="px-2 py-1 rounded-full border bg-white text-sm capitalize">{p.category}</span>
        <label className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded-full border bg-white">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x)))}
          />
          Activo
        </label>

        <button className="btn btn-ghost btn-sm" onClick={() => setEditMeta((v) => !v)}>
          {editMeta ? "Ocultar datos" : "Editar datos"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(p)}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>

      {/* Panel de ediciÃ³n de nombre/categorÃ­a (colapsable y minimal) */}
      {editMeta && (
        <div className="rounded-xl border bg-white p-3 grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2">
          <input
            className="input h-10"
            placeholder="Nombre del producto"
            value={p.name}
            onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
          />
          <select
            className="input h-10"
            value={p.category}
            onChange={(e) => setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, category: e.target.value } : x)))}
          >
            {CATS.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
      )}

      {/* TamaÃ±os (lista compacta, una fila + CTA Editar) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">TamaÃ±os</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => toggleSizes(p.id)}>{isSizesOpen(p.id) ? "Ocultar" : "Mostrar"}</button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const s: Size = { id: crypto.randomUUID(), name: "nuevo", price: 0, recipe: {}, notes: "", checks: {}, tools: [] };
                setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, sizes: [...x.sizes, s] } : x)));
              }}
            >AÃ±adir tamaÃ±o</button>
          </div>
        </div>

        {!isSizesOpen(p.id) && (
          <div className="flex flex-wrap gap-2">
            {p.sizes.map((s) => (
              <span key={s.id} className="px-2 py-1 rounded-full border text-xs text-slate-700 bg-white" title={`Precio: $${Number(s.price || 0).toLocaleString()}`}>
                {fixText(s.name)} Â· ${Number(s.price || 0).toLocaleString()}
              </span>
            ))}
            {p.sizes.length === 0 && <span className="text-sm text-slate-500">Sin tamaÃ±os.</span>}
          </div>
        )}

        {isSizesOpen(p.id) && (
          <div className="space-y-2">
            {p.sizes.length === 0 && <div className="text-sm text-slate-500">Sin tamaÃ±os.</div>}
            {p.sizes.map((s) => (
              <SizeRow
                key={s.id}
                p={p}
                s={s}
                inventory={inventory}
                stdForCategory={stdForCategory}
                setItems={setItems}
                onOpen={() => setOpenSizeId(s.id)}
                onRemove={() => {
                  if (!confirm(`Eliminar tamaÃ±o "${fixText(s.name)}"?`)) return;
                  setItems(cur => cur.map(prod => prod.id !== p.id ? prod : ({ ...prod, sizes: prod.sizes.filter(x => x.id !== s.id) })));
                }}
              />
            ))}

            {/* Modal unificado para ediciÃ³n del tamaÃ±o */}
            {p.sizes.map((s) => (
              <SizeModal
                key={"modal:"+s.id}
                open={openSizeId === s.id}
                onClose={() => setOpenSizeId(null)}
                p={p}
                s={s}
                inventory={inventory}
                setItems={setItems}
                stdForCategory={stdForCategory}
                onSaved={(prod) => onSave(prod)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =============== Fila compacta de tamaÃ±o =============== */
function SizeRow({
  p, s, inventory, stdForCategory, setItems, onOpen, onRemove,
}: {
  p: Product;
  s: Size;
  inventory: InventoryItem[];
  stdForCategory: StdRecipe;
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const invMap = useMemo(() => mapOf(inventory), [inventory]);
  const recipeCost = Object.entries(s.recipe || {}).reduce((sum, [ing, q]) => sum + Number(q || 0) * Number(invMap[ing]?.costPerUnit || 0), 0);
  const margin = Number(s.price || 0) - recipeCost;
  const pct = s.price > 0 ? (margin / s.price) * 100 : 0;

  const baseMissing = Object.keys(stdForCategory?.recipe || {}).filter((id) => (s.recipe || {})[id] === undefined || Number((s.recipe || {})[id]) <= 0);
  const baseOk = baseMissing.length === 0;

  const rows = Object.values(s.recipe || {});
  const completed = rows.filter(v => Number(v) > 0).length;
  const total = rows.length;

  const update = (patch: Partial<Size>) =>
    setItems((cur) => cur.map((x) => (x.id !== p.id ? x : { ...x, sizes: x.sizes.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) })));

  return (
    <div className="rounded-xl border bg-white px-3 py-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
      {/* Nombre + Precio */}
      <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
        <input className="input h-9" value={s.name} onChange={(e)=>update({ name: e.target.value })} />
        <input className="input h-9 text-right" type="number" inputMode="numeric" value={String(s.price)} onChange={(e)=>update({ price: Number(e.target.value || 0) })}/>
      </div>

      {/* Costo/Margen */}
      <div className="text-sm text-slate-600 text-right">
        Costo <b>${recipeCost.toLocaleString()}</b> Â· Margen{" "}
        <b className={cls(margin < 0 ? "text-red-600" : "text-emerald-600")}>
          ${margin.toLocaleString()} ({pct.toFixed(1)}%)
        </b>
      </div>

      {/* Estado comprimido */}
      <div className="flex items-center justify-end gap-1">
        <span className={cls("px-2 py-1 rounded-full border text-xs", baseOk ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-amber-500 text-amber-700 bg-amber-50")}>
          Base {baseOk ? "OK" : "â€”"}
        </span>
        <span className="px-2 py-1 rounded-full border text-xs text-slate-600">{completed}/{total || 0}</span>
        <span className={cls("px-2 py-1 rounded-full border text-xs", s.checks?.finalOk ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-slate-300 text-slate-600 bg-white")}>
          Final {s.checks?.finalOk ? "OK" : "â€”"}
        </span>
      </div>

      {/* Acciones: 1 CTA visible + eliminar */}
      <div className="flex items-center justify-end gap-2">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn btn-primary btn-sm" onClick={onOpen}>Editar</motion.button>
        <button className="btn btn-ghost btn-sm" onClick={onRemove} title="Eliminar tamaÃ±o">Eliminar</button>
      </div>
    </div>
  );
}

/* =============== Modal unificado de tamaÃ±o =============== */
function SizeModal({
  open, onClose, p, s, inventory, setItems, stdForCategory, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  p: Product;
  s: Size;
  inventory: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
  stdForCategory: StdRecipe;
  onSaved: (p: Product) => void;
}) {
  const [tab, setTab] = useState<"receta" | "studio" | "maquinaria" | "notas">("receta");
  const [local, setLocal] = useState<Size>(s);
  const [copyOpen, setCopyOpen] = useState(false);

  useEffect(()=>{ if (open) setLocal(s); }, [open, s.id]);

  // Atajo guardar: Ctrl/Cmd + Enter
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveAndClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, local]);

  const invMap = useMemo(() => mapOf(inventory), [inventory]);

  // ðŸ‘‰ overrides locales para reflejar cambios al instante en el modal
  const [unitEdits, setUnitEdits] = useState<Record<string, Unit>>({});
  const [cpuEdits, setCpuEdits] = useState<Record<string, number>>({});

  const unitOf = (id: string): Unit =>
    (unitEdits[id] as Unit) ?? (invMap[id]?.unit ?? "u");

  const cpuOf = (id: string) =>
    (cpuEdits[id] ?? Number(invMap[id]?.costPerUnit || 0));

  const nameOf = (id: string) => fixText(invMap[id]?.name || id);

  // Acciones para guardar en Firestore
  const saveUnit = async (id: string, u: Unit) => {
    setUnitEdits((m) => ({ ...m, [id]: u }));
    try {
      await setDoc(doc(db, "inventoryItems", id), { orgId: getOrgId(), unit: u }, { merge: true });
    } catch (e) {
      console.error(e);
      alert("No pude guardar la unidad. Verifica permisos/reglas.");
    }
  };

  const saveCpu = async (id: string, cost: number) => {
    const v = Math.max(0, Number.isFinite(cost) ? Number(cost) : 0);
    setCpuEdits((m) => ({ ...m, [id]: v }));
    try {
      await setDoc(doc(db, "inventoryItems", id), { orgId: getOrgId(), costPerUnit: v }, { merge: true });
    } catch (e) {
      console.error(e);
      alert("No pude guardar el costo por unidad. Verifica permisos/reglas.");
    }
  };

  const rows = Object.entries(local.recipe || {});
  const completed = rows.filter(([,q]) => Number(q) > 0).length;
  const total = rows.length;

  const recipeCost = rows.reduce((sum, [ing, amount]) => sum + cpuOf(ing) * Number(amount || 0), 0);
  const margin = Number(local.price || 0) - recipeCost;
  const pct = local.price > 0 ? (margin / local.price) * 100 : 0;

  const baseMissing = Object.keys(stdForCategory?.recipe || {}).filter((id) => (local.recipe || {})[id] === undefined || Number((local.recipe || {})[id]) <= 0);
  const baseOk = baseMissing.length === 0;

  const setAmount = (ing: string, amount: number) => {
    const next = { ...(local.recipe || {}) };
    const v = Math.max(0, Number.isFinite(amount as any) ? Number(amount) : 0);
    next[ing] = v;
    let order = (Array.isArray(local.recipeOrder) && local.recipeOrder.length
      ? [...local.recipeOrder]
      : Object.keys(next));
    if (!order.includes(ing)) order.push(ing);
    setLocal({ ...local, recipe: next, recipeOrder: order });
  };
  const onRemove = (ing: string) => {
    setLocal(cur => {
      const nextRecipe = { ...(cur.recipe || {}) };
      delete nextRecipe[ing];

      const remainingIds = Object.keys(nextRecipe);
      const baseOrder = (Array.isArray(cur.recipeOrder) && cur.recipeOrder.length
        ? cur.recipeOrder
        : Object.keys(cur.recipe || {}));
      const nextOrder = baseOrder.filter(id => id !== ing && remainingIds.includes(id));
      return { ...cur, recipe: nextRecipe, recipeOrder: nextOrder };
    });
  };
  const onReorder = (fromId: string, toIndex: number) => {
    const ids = Object.keys(local.recipe || {});
    const baseOrder = (Array.isArray(local.recipeOrder) && local.recipeOrder.length
      ? local.recipeOrder
      : ids).filter((id) => ids.includes(id));
    const order = [...baseOrder];
    const fromIndex = order.indexOf(fromId);
    if (fromIndex === -1) return;
    order.splice(fromIndex, 1);
    const idx = Math.max(0, Math.min(toIndex, order.length));
    order.splice(idx, 0, fromId);
    setLocal({ ...local, recipeOrder: order });
  };

  const toStudioKind = (role: Role): VizKind =>
    role === "syrup" ? "syrup" :
    role === "ice" ? "ice" :
    role === "topping" ? "topping" :
    role === "sparkling" ? "sparkling" :
    "liquid";

  const vizItems: VizItem[] = Object.entries(local.recipe || {}).map(([ing, amount]) => {
    const nm = nameOf(ing);
    const { role } = roleOf(nm);
    return { name: nm, unit: unitOf(ing), amount: Number(amount || 0), type: toStudioKind(role) };
  });

  // ðŸ”§ Guarda SOLO lo que realmente quedÃ³ en state y persiste ese mismo objeto.
  const saveAndClose = () => {
    const willBaseOk = Object.keys(stdForCategory?.recipe || {}).every((id)=>Number((local.recipe||{})[id]||0) > 0);
    const next: Size = { ...local, checks: { ...(local.checks||{}), baseOk: willBaseOk } };

    const productAfter: Product = {
      ...p,
      sizes: p.sizes.map(sz => sz.id === s.id ? next : sz),
    };

    setLocal(next);
    setItems(cur => cur.map(prod => prod.id !== p.id ? prod : productAfter));
    onSaved(productAfter);
    onClose();
  };

  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[98] bg-black/30 flex items-center justify-center p-4"
        onClick={(e)=>e.target===e.currentTarget && onClose()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl w-full max-w-3xl shadow-xl border overflow-hidden"
          initial={{ y: 30, scale: 0.98 }} animate={{ y: 0, scale: 1, transition: { type: "spring", damping: 22, stiffness: 220 } }} exit={{ y: 20, opacity: 0 }}
        >
          {/* Header del modal */}
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <div className="font-medium truncate">{fixText(p.name)} â€” <b>{fixText(local.name)}</b></div>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className={cls("px-2 py-1 rounded-full border", baseOk ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-amber-500 text-amber-700 bg-amber-50")}>
                Base {baseOk ? "OK" : "â€”"}
              </span>
              <span className="px-2 py-1 rounded-full border text-slate-600">{completed}/{total || 0}</span>
              <span className={cls("px-2 py-1 rounded-full border", local.checks?.finalOk ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-slate-300 text-slate-600 bg-white")}>
                Final {local.checks?.finalOk ? "OK" : "â€”"}
              </span>
              <span className="pl-2 text-slate-600 hidden md:inline">
                Costo <b>${recipeCost.toLocaleString()}</b> Â· Margen{" "}
                <b className={cls(margin < 0 ? "text-red-600" : "text-emerald-600")}>${margin.toLocaleString()} ({pct.toFixed(1)}%)</b>
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-4 pt-3">
            <div className="flex gap-2">
              {(["receta","studio","maquinaria","notas"] as const).map(k => (
                <motion.button
                  key={k}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={cls("px-3 py-1 rounded-full border text-sm",
                    tab===k ? "bg-[var(--brand,#24c7b7)] text-white border-[var(--brand,#24c7b7)]" : "bg-white")}
                  onClick={()=>setTab(k)}>{k[0].toUpperCase()+k.slice(1)}</motion.button>
              ))}
            </div>
          </div>

          {/* Contenido */}
          <div className="p-4 max-h-[70vh] overflow-auto">
            {tab === "receta" && (
              <RecipeTable
                rows={(
                  Array.isArray(local.recipeOrder) && local.recipeOrder.length
                    ? local.recipeOrder
                    : Object.keys(local.recipe || {})
                )
                  .filter(id => (local.recipe||{})[id] !== undefined)
                  .map((id) => [id, (local.recipe||{})[id] as number])}
                nameOf={nameOf}
                unitOf={unitOf}
                cpuOf={cpuOf}
                setAmount={setAmount}
                onRemove={onRemove}
                onReorder={onReorder}
                inventory={inventory}
                onQuickAdd={(id, qty) => setAmount(id, Math.max(0, qty))}
                /* ðŸ‘‡ NUEVO: permite editar unidad y costo por unidad desde la receta */
                editableInventory
                onUnitChange={saveUnit}
                onCpuChange={saveCpu}
              />
            )}

            {tab === "studio" && (
              <FrappeStudio
                open={true}
                onClose={()=>{}}
                items={vizItems}
                sizeName={local.name}
                productName={p.name}
                onFinish={()=>{}}
                celebrate={false}
              />
            )}

            {tab === "maquinaria" && (
              <ToolsInline
                value={local.tools || []}
                inventory={inventory}
                onChange={(tools)=>setLocal({...local, tools})}
              />
            )}

            {tab === "notas" && (
              <div className="space-y-2">
                <div className="label">Notas</div>
                <textarea className="input min-h-[120px]" value={local.notes || ""} onChange={(e)=>setLocal({...local, notes: e.target.value})}/>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded-full border bg-white">
                <input
                  type="checkbox"
                  checked={!!local.checks?.finalOk}
                  onChange={(e)=>setLocal({...local, checks:{...(local.checks||{}), finalOk: e.target.checked}})}
                />
                Marcar Final OK
              </label>

              {local.checks?.finalOk && (
                <button
                  className="btn btn-accent btn-sm"
                  onClick={() => {
                    const willBaseOk = Object.keys(stdForCategory?.recipe || {}).every((id)=>Number((local.recipe||{})[id]||0) > 0);
                    const next = { ...local, checks: { ...(local.checks||{}), baseOk: willBaseOk } };
                    setLocal(next);
                    setItems(cur => cur.map(prod => prod.id !== p.id ? prod : ({
                      ...prod,
                      sizes: prod.sizes.map(sz => sz.id === s.id ? next : sz)
                    })));
                    setCopyOpen(true);
                  }}
                >
                  Guardar y copiar aâ€¦
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
              <button className="btn btn-primary" onClick={saveAndClose}>Guardar</button>
            </div>
          </div>

          {/* Copiar a tamaÃ±os â€” COPIA EXACTA */}
          <CopyToSizesModal
            open={copyOpen}
            onClose={()=>setCopyOpen(false)}
            product={p}
            source={local}
            onApply={(updates: Record<string, Partial<Size>>) => {
              const willBaseOk = Object.keys(stdForCategory?.recipe || {}).every((id)=>Number((local.recipe||{})[id]||0) > 0);
              const srcNext: Size = { ...local, checks: { ...(local.checks||{}), baseOk: willBaseOk } };

              const productAfter: Product = {
                ...p,
                sizes: p.sizes.map(sz =>
                  sz.id === srcNext.id
                    ? srcNext
                    : (updates[sz.id] ? { ...sz, ...updates[sz.id] } : sz)
                ),
              };

              setItems(cur => cur.map(prod => prod.id !== p.id ? prod : productAfter));
              onSaved(productAfter);
              setCopyOpen(false);
            }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* =============== Herramienta Maquinaria inline (tab) =============== */
function ToolsInline({
  value, inventory, onChange,
}: {
  value: string[];
  inventory: InventoryItem[];
  onChange: (tools: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(value || []));
  useEffect(()=>setSel(new Set(value || [])), [value]);

  const equipment = useMemo(
    () => inventory.filter(i => isEquipmentName(i.name)).sort((a,b)=>fixText(a.name).localeCompare(fixText(b.name))),
    [inventory]
  );
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr><th className="px-3 py-2 text-left">Usar</th><th className="px-3 py-2 text-left">Equipo</th></tr>
        </thead>
        <tbody>
          {equipment.map(it => (
            <tr key={it.id} className="border-t">
              <td className="px-3 py-2"><input type="checkbox" checked={sel.has(it.id)} onChange={()=>toggle(it.id)} /></td>
              <td className="px-3 py-2">{fixText(it.name)}</td>
            </tr>
          ))}
          {equipment.length===0 && (
            <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={2}>No se detectÃ³ maquinaria en bodega.</td></tr>
          )}
        </tbody>
      </table>

      <div className="p-2 border-t flex justify-end">
        <button className="btn btn-primary btn-sm" onClick={()=>onChange([...sel])}>Guardar selecciÃ³n</button>
      </div>
    </div>
  );
}

/* =============== Chip de SECCIÃ“N editable =============== */
function SectionChip({
  ingId, inventory,
}: {
  ingId: string;
  inventory: InventoryItem[];
}) {
  const initial = sectionOf(inventory, ingId);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<InventorySection>(initial);
  const options: InventorySection[] = ["Comida", "Bebidas", "Aseo", "Maquinaria", "Desechables", "Otros"];

  const save = async (s: InventorySection) => {
    setCur(s);
    try {
      await setDoc(doc(db, "inventoryItems", ingId), { orgId: getOrgId(), section: s }, { merge: true });
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar la secciÃ³n. Revisa permisos/reglas.");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="px-2 py-[2px] rounded-full text-[11px] border bg-white hover:bg-neutral-50"
        onClick={() => setOpen((v) => !v)}
        title="Editar secciÃ³n de bodega"
      >
        {cur} âœŽ
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-40 rounded-xl border bg-white shadow-lg p-1">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { save(opt); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-neutral-100 text-sm"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Receta TABLE V2 (compacta) ================= */
function RecipeTable({
  rows, nameOf, unitOf, cpuOf, setAmount, onRemove, onReorder, inventory, onQuickAdd,
  editableInventory, onUnitChange, onCpuChange,
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
  /** NUEVO */
  editableInventory?: boolean;
  onUnitChange?: (id: string, u: Unit) => void;
  onCpuChange?: (id: string, cost: number) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const getDisplay = (id: string, amount: number) => (id in drafts ? drafts[id] : String(amount ?? 0));

  // NUEVO: ediciÃ³n puntual de $/u activada por el botÃ³n de lÃ¡piz
  const [draftCpu, setDraftCpu] = useState<Record<string, string>>({});
  const [editCpuFor, setEditCpuFor] = useState<string | null>(null);
  const getCpuDisplay = (id: string) => (id in draftCpu ? draftCpu[id] : String(cpuOf(id) ?? 0));

  // Quick add
  const [qaText, setQaText] = useState<string>("");
  const [qaQty, setQaQty] = useState<string>("1");
  const byName = (txt: string) => inventory.find(i => normalize(i.name) === normalize(txt) || i.id === txt);
  const units = (id: string) => (inventory.find(i => i.id === id)?.unit ?? "u");

  // "3 toppings" -> usa Ã­tem topping
  const parseToppings = (txt: string): number | null => {
    const m = txt.trim().match(/^(\d+(?:[.,]\d+)?)\s*(topping|toppings?|topin(?:g)?s?)$/i);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const findToppingItem = () => {
    let it = inventory.find(i => normalize(i.name) === normalize("1 topping"));
    if (!it) it = inventory.find(i => /topping/i.test(i.name));
    return it || null;
  };

  return (
    <div
      className={cls("rounded-2xl border bg-white/90", dragId && "ring-2 ring-sky-200")}
      onDragOver={(e) => { if (!dragId) return; e.preventDefault(); }}
      onDrop={(e) => { if (!dragId) return; e.preventDefault(); const idx = overIndex ?? rows.length; onReorder(dragId, idx); setOverIndex(null); setDragId(null); }}
    >
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="font-medium text-sm">Receta</div>
        <div className="text-xs text-slate-500">Arrastra â‹® para reordenar</div>
      </div>

      {/* Quick add inline */}
      <div className="px-3 pb-2 grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2 items-center">
        <input
          list="inv-list"
          className="input"
          placeholder="AÃ±adir ingredienteâ€¦ (escribe y elige)"
          value={qaText}
          onChange={(e) => setQaText(e.target.value)}
        />
        <input
          className="input text-center"
          type="number" inputMode="numeric" min={0}
          value={qaQty}
          onChange={(e) => setQaQty(e.target.value)}
          placeholder="cantidad"
          onKeyDown={(e) => { if (e.key === "Enter") (document.getElementById("btn-qa-add") as HTMLButtonElement)?.click(); }}
        />
        <button
          id="btn-qa-add"
          className="btn btn-sm"
          onClick={() => {
            const tops = parseToppings(qaText);
            if (tops !== null) {
              const it = findToppingItem();
              if (!it) return alert("No hay un Ã­tem de bodega para 'topping'.");
              onQuickAdd(it.id, Math.max(0, tops));
              setQaText(""); setQaQty(units(it.id) === "u" ? "1" : "1");
              return;
            }
            const it = byName(qaText);
            if (!it) return alert("Selecciona un ingrediente vÃ¡lido de la lista.");
            const q = Number(qaQty || 0);
            onQuickAdd(it.id, Math.max(0, q));
            setQaText(""); setQaQty(units(it.id) === "u" ? "1" : "1");
          }}
        >AÃ±adir</button>
        <datalist id="inv-list">
          {inventory.map(i => <option key={i.id} value={fixText(i.name)} />)}
        </datalist>
      </div>

      {rows.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">Sin ingredientes todavÃ­a.</div>}

      <ul className="divide-y">
        {rows.map(([ing, amount], idx) => {
          const nm = nameOf(ing);
          const u = unitOf(ing);
          const { role, color } = roleOf(nm);

          const typedCpuMaybe = parseDecimal(getCpuDisplay(ing));
          const effCpu = typedCpuMaybe ?? (cpuOf(ing) ?? 0);
          const rowCost = Math.max(0, effCpu * Number(amount || 0));

          const icon =
            role === "liquid" ? "ðŸ’§" :
            role === "sparkling" ? "ðŸ¥‚" :
            role === "syrup" ? "ðŸ§ª" :
            role === "ice" ? "ðŸ§Š" :
            role === "topping" ? "ðŸª" :
            role === "whipped" ? "ðŸ¦" : "ðŸ§‹";
          const tint = `${color}${color.length === 7 ? "14" : ""}`;
          const isOver = overIndex === idx;

          const inputId = `qty-${idx}-${ing}`;

          return (
            <li
              key={ing}
              className={cls(
                "px-3 py-2 grid items-center gap-2",
                "grid-cols-[14px_minmax(220px,1fr)_auto_auto_auto]",
                "md:grid-cols-[14px_minmax(280px,1fr)_auto_auto_auto]",
                isOver && "bg-sky-50"
              )}
              style={{ borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${tint}, transparent 30%)` }}
              draggable
              onDragStart={(e) => { setDragId(ing); e.dataTransfer.setData("text/x-recipe-id", ing); }}
              onDragEnd={() => { setDragId(null); setOverIndex(null); }}
              onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOverIndex(idx); }}
            >
              <div className="cursor-grab text-slate-400 select-none" title="Arrastra">â‹®â‹®</div>

              {/* Nombre (no se tapa) */}
              <div className="min-w-0 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[12px] border shrink-0" style={{ borderColor: color }}>
                  {icon}
                </span>
                <span className="truncate text-sm">{nm}</span>
                <SectionChip ingId={ing} inventory={inventory} />
              </div>

              {/* Cantidad + unidad (compacto) */}
              <div className="flex items-center gap-1 justify-end shrink-0">
                <button className="btn btn-sm" onClick={() => setAmount(ing, Math.max(0, Number(amount || 0) - 1))} title="Disminuir cantidad">â€“</button>
                <label htmlFor={inputId} className="sr-only">Cantidad para {nm}</label>
                <input
                  id={inputId}
                  className="input w-16 md:w-20 text-center"
                  type="number"
                  inputMode="numeric"
                  value={getDisplay(ing, amount)}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [ing]: e.target.value }));
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setAmount(ing, n);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      setAmount(ing, Number.isFinite(v) ? v : 0);
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  onBlur={() => setDrafts((d) => { const { [ing]: _omit, ...rest } = d; return rest; })}
                  aria-label={`Cantidad de ${nm} en ${u}`}
                />

                {editableInventory ? (
                  <select
                    className="input h-9 w-[64px] md:w-[72px] text-sm"
                    value={unitOf(ing) ?? "u"}
                    onChange={(e) => onUnitChange?.(ing, e.target.value as Unit)}
                    aria-label="Unidad"
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="u">u</option>
                  </select>
                ) : (
                  <span className="text-sm text-slate-500 pl-1">{u}</span>
                )}

                <button className="btn btn-sm" onClick={() => setAmount(ing, Number(amount || 0) + 1)} title="Aumentar cantidad">+</button>
              </div>

              {/* SOLO precio final + botÃ³n editar */}
              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                {editCpuFor === ing ? (
                  <>
                    <span className="text-xs text-slate-500">$/u</span>
                    <input
                      autoFocus
                      className="input w-20 md:w-24 text-right"
                      type="number"
                      inputMode="decimal"
                      value={getCpuDisplay(ing)}
                      onChange={(e) => setDraftCpu((m) => ({ ...m, [ing]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = parseDecimal((e.currentTarget as HTMLInputElement).value);
                          if (v !== null) onCpuChange?.(ing, v);
                          setEditCpuFor(null);
                          setDraftCpu((m) => { const { [ing]: _omit, ...rest } = m; return rest; });
                        }
                        if (e.key === "Escape") {
                          setEditCpuFor(null);
                          setDraftCpu((m) => { const { [ing]: _omit, ...rest } = m; return rest; });
                        }
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        const v = parseDecimal(draftCpu[ing] ?? String(cpuOf(ing) ?? 0));
                        if (v !== null) onCpuChange?.(ing, v);
                        setEditCpuFor(null);
                        setDraftCpu((m) => { const { [ing]: _omit, ...rest } = m; return rest; });
                      }}
                      title="Guardar costo por unidad"
                    >
                      OK
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setEditCpuFor(null); setDraftCpu((m) => { const { [ing]: _omit, ...rest } = m; return rest; }); }}
                      title="Cancelar"
                    >
                      âœ•
                    </button>
                  </>
                ) : (
                  <>
                    <span aria-live="polite" className="tabular-nums text-sm text-slate-700">= ${rowCost.toLocaleString()}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Editar costo por unidad"
                      onClick={() => {
                        setEditCpuFor(ing);
                        setDraftCpu((m) => ({ ...m, [ing]: String(cpuOf(ing) ?? 0) }));
                      }}
                    >
                      âœŽ
                    </button>
                  </>
                )}
              </div>

              <button className="btn btn-ghost btn-sm" onClick={() => onRemove(ing)} title="Quitar">âœ•</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================= Modal Receta EstÃ¡ndar ================= */
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
  const unitOf = (id: string): Unit => (inventory.find((x) => x.id === id)?.unit ?? "u");
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
    next[id] = n;
    let order = (Array.isArray(local.recipeOrder) && local.recipeOrder.length
      ? [...local.recipeOrder]
      : Object.keys(next));
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

  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[94] bg-black/30 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl border p-4"
          initial={{ y: 30, scale: 0.98 }} animate={{ y: 0, scale: 1, transition: { type: "spring", damping: 22, stiffness: 220 }}} exit={{ y: 20, opacity: 0 }}>
          <div className="flex items-center justify-between">
            <div className="font-semibold">Receta estÃ¡ndar â€” <span className="capitalize">{category}</span></div>
            <div className="flex items-center gap-2">
              <button className="btn btn-primary" onClick={() => { onChange(local); onClose(); }}>Guardar</button>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1">Base (vaso, hielo, leche, etc.). No marca el producto como listo.</p>

          <div className="mt-3">
            <RecipeTable
              rows={rows}
              nameOf={nameOf}
              unitOf={unitOf}
              cpuOf={() => 0}
              setAmount={setAmount}
              onRemove={(id) => {
                const next = { ...(local.recipe||{}) }; delete next[id];
                const remaining = Object.keys(next);
                const base = (Array.isArray(local.recipeOrder) && local.recipeOrder.length
                  ? local.recipeOrder
                  : Object.keys(local.recipe || {}));
                const order = base.filter(x => x !== id && remaining.includes(x));
                setLocal({ ...local, recipe: next, recipeOrder: order });
              }}
              onReorder={onReorder}
              inventory={inventory}
              onQuickAdd={(id, qty) => setAmount(id, qty)}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* =============== NUEVO: Modal Aplicar base a Plantillas =============== */
function ApplyBaseModal({
  open, onClose, products, onApply,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onApply: (ids: string[], mode: "replace" | "merge") => void;
}) {
  const [rows, setRows] = useState(
    products.map(p => ({ id: p.id, name: fixText(p.name), sizes: p.sizes.length, selected: true }))
  );
  const [mode, setMode] = useState<"replace" | "merge">("replace");

  useEffect(() => {
    if (!open) return;
    setRows(products.map(p => ({ id: p.id, name: fixText(p.name), sizes: p.sizes.length, selected: true })));
    setMode("replace");
  }, [open, products]);

  if (!open) return null;

  const selectedCount = rows.filter(r => r.selected).length;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[97] bg-black/30 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border p-4"
          initial={{ y: 30, scale: 0.98 }} animate={{ y: 0, scale: 1, transition: { type: 'spring', damping: 22, stiffness: 220 } }}
          exit={{ y: 20, opacity: 0 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Aplicar base a Plantillas</div>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" onClick={() => setRows(r => r.map(x => ({ ...x, selected: true })))}>Todo</button>
              <button className="btn btn-ghost" onClick={() => setRows(r => r.map(x => ({ ...x, selected: false })))}>Nada</button>
              <button
                className="btn btn-primary"
                onClick={() => onApply(rows.filter(r => r.selected).map(r => r.id), mode)}
                disabled={selectedCount === 0}
                title={selectedCount === 0 ? "Selecciona al menos 1 producto" : undefined}
              >
                Aplicar ({selectedCount})
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-600 mt-1">
            Se aplicarÃ¡ la <b>receta base</b> de la categorÃ­a actual a <b>todos los tamaÃ±os</b> de cada producto seleccionado.
          </p>

          <div className="mt-3 rounded-xl border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Aplicar</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right"># TamaÃ±os</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={e => setRows(arr => arr.map((x, k) => (k === i ? { ...x, selected: e.target.checked } : x)))}
                      />
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right">{r.sizes}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={3}>No hay Plantillas en esta categorÃ­a.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="text-sm text-slate-700">Modo:</div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                Reemplazar (pisa receta actual)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                Combinar (solo agrega base faltante)
              </label>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* =============== Copiar a tamaÃ±os â€” COPIA EXACTA =============== */
function CopyToSizesModal({
  open, onClose, product, source, onApply,
}: {
  open: boolean;
  onClose: () => void;
  product: Product;
  source: Size;
  onApply: (updates: Record<string, Partial<Size>>) => void;
}) {
  const dstSizes = (product.sizes || []).filter(s => s.id !== source.id);
  const [rows, setRows] = useState(() =>
    dstSizes.map(s => ({
      id: s.id,
      name: fixText(s.name),
      price: Number(s.price || 0),
      selected: true
    }))
  );

  useEffect(() => {
    if (!open) return;
    setRows(dstSizes.map(s => ({ id: s.id, name: fixText(s.name), price: Number(s.price || 0), selected: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product.id, source.id]);

  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[96] bg-black/30 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border p-4"
          initial={{ y: 30, scale: 0.98 }} animate={{ y: 0, scale: 1, transition: { type: "spring", damping: 22, stiffness: 220 } }} exit={{ y: 20, opacity: 0 }}>

          <div className="flex items-center justify-between">
            <div className="font-semibold">Copiar receta â€” Origen: <b>{fixText(source.name)}</b></div>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" onClick={() => setRows(r => r.map(x => ({ ...x, selected: true })))}>Todo</button>
              <button className="btn btn-ghost" onClick={() => setRows(r => r.map(x => ({ ...x, selected: false })))}>Nada</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const updates: Record<string, Partial<Size>> = {};
                  const order = Array.isArray(source.recipeOrder) && source.recipeOrder.length ? [...source.recipeOrder] : Object.keys(source.recipe || {});
                  dstSizes.forEach(s => {
                    const row = rows.find(r => r.id === s.id);
                    if (!row?.selected) return;
                    updates[s.id] = {
                      recipe: { ...(source.recipe || {}) },
                      recipeOrder: order,
                      checks: { baseOk: true, finalOk: false },
                    };
                  });
                  onApply(updates);
                }}
              >Aplicar</button>
            </div>
          </div>

          <p className="text-xs text-slate-600 mt-2">
            Se copiarÃ¡n <b>exactamente los mismos ingredientes</b> y <b>el mismo orden</b> del tamaÃ±o <b>{fixText(source.name)}</b>.
            Luego puedes ajustar cantidades manualmente en cada tamaÃ±o.
          </p>

          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Copiar</th>
                  <th className="px-3 py-2 text-left">TamaÃ±o</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => setRows(arr => arr.map((x, k) => k === i ? { ...x, selected: e.target.checked } : x))}
                      />
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right">${r.price.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t bg-slate-50">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 font-medium">Origen: {fixText(source.name)}</td>
                  <td className="px-3 py-2 text-right">${Number(source.price || 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query as fsQuery, setDoc, where, serverTimestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import type { BuilderConfig, BuilderLimits, PriceRules, Recipe, SizeDef, InventoryItem, Unit } from "@/helpers/builder";
import { roleOf } from "@/helpers/builder";

function fixText(s?: string) { return (s || "").normalize("NFC"); }

export default function BuilderConfigPage() {
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [cfg, setCfg] = useState<BuilderConfig | null>(null);
  const orgId = getOrgId();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const invSnap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId), orderBy("name")));
      const invArr: InventoryItem[] = invSnap.docs.map(d => {
        const x: any = d.data();
        return { id: d.id, name: fixText(x.name || ""), unit: x.unit as Unit, costPerUnit: Number(x.costPerUnit || 0), section: x.section };
      });

      const snap = await getDoc(doc(db, "builderConfigs", orgId));
      const def: BuilderConfig = snap.exists()
        ? (snap.data() as any)
        : {
            orgId,
            sizes: [
              { id: "9oz", name: "9 oz", volumeMl: 266, basePrice: 6000, baseRecipe: {} },
              { id: "12oz", name: "12 oz", volumeMl: 355, basePrice: 8000, baseRecipe: {} },
              { id: "16oz", name: "16 oz", volumeMl: 473, basePrice: 9500, baseRecipe: {} },
            ],
            limits: { maxSyrups: 2, maxToppings: 2, stepMl: 10, stepG: 5, allowWhipped: true, maxIceMl: 200 },
            priceRules: {
              mode: "base_plus_addons",
              basePriceBySize: { "9oz": 6000, "12oz": 8000, "16oz": 9500 },
              addon: { syrupPer10ml: 500, liquidPer50ml: 700, toppingPerUnit: 1000, icePer50ml: 0, whippedPerUnit: 1200 }
            },
            kioskPin: "2580",
          };

      setInv(invArr);
      setCfg(def);
      setLoading(false);
    })();
  }, [orgId]);

  const invMap = useMemo(() => Object.fromEntries(inv.map(i => [i.id, i] as const)), [inv]);
  const nameOf = (id: string) => fixText(invMap[id]?.name || id);
  const unitOf = (id: string) => (invMap[id]?.unit || "u") as Unit;

  const save = async () => {
    if (!cfg) return;
    await setDoc(doc(db, "builderConfigs", orgId), { ...cfg, orgId, updatedAt: serverTimestamp() }, { merge: true });
    alert("Guardado ✓");
  };

  if (loading || !cfg) return <div className="p-6">Cargando…</div>;
  /** Alias no–nulo para evitar los ts(18047) en funciones internas */
  const C = cfg as BuilderConfig;

  return (
    <main className="container-app p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Builder · Configuración</h1>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Tamaños & Base de vaso</h2>
          <button
            className="btn"
            onClick={() => {
              const id = crypto.randomUUID().slice(0, 6);
              const next: SizeDef = { id, name: "nuevo", volumeMl: 300, basePrice: 0, baseRecipe: {} };
              setCfg(c => {
                const cur = c as BuilderConfig;
                return { ...cur, sizes: [...cur.sizes, next] };
              });
            }}
          >
            Añadir tamaño
          </button>
        </div>

        <ul className="space-y-4">
          {C.sizes.map((s, idx) => (
            <li key={s.id} className="rounded-xl border p-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px_auto] gap-2 items-center">
                <input className="input h-9" value={s.name} onChange={(e) => updateSize(idx, { name: e.target.value })} />
                <input className="input h-9 text-right" type="number" value={String(s.volumeMl)} onChange={(e) => updateSize(idx, { volumeMl: Number(e.target.value || 0) })} placeholder="ml" />
                <input className="input h-9 text-right" type="number" value={String(s.basePrice ?? 0)} onChange={(e) => updateSize(idx, { basePrice: Number(e.target.value || 0) })} placeholder="$ base" />
                <div className="text-sm text-slate-600">id: <b>{s.id}</b></div>
                <div className="flex justify-end"><button className="btn btn-ghost" onClick={() => removeSize(s.id)}>Eliminar</button></div>
              </div>

              <RecipeEditor
                rows={orderOf(s)}
                nameOf={nameOf}
                unitOf={unitOf}
                onAdd={(ingId, qty) => {
                  const r = { ...(s.baseRecipe || {}) };
                  r[ingId] = Math.max(0, Number(qty || 0));
                  const o = normalizeOrder(s, r, ingId);
                  updateSize(idx, { baseRecipe: r, baseRecipeOrder: o });
                }}
                onChangeQty={(ingId, qty) => {
                  const r = { ...(s.baseRecipe || {}) };
                  r[ingId] = Math.max(0, Number(qty || 0));
                  updateSize(idx, { baseRecipe: r });
                }}
                onRemove={(ingId) => {
                  const r = { ...(s.baseRecipe || {}) };
                  delete r[ingId];
                  const o = (s.baseRecipeOrder || []).filter(x => x !== ingId);
                  updateSize(idx, { baseRecipe: r, baseRecipeOrder: o });
                }}
                onReorder={(fromId, toIndex) => {
                  const ids = Object.keys(s.baseRecipe || {});
                  const base = Array.isArray(s.baseRecipeOrder) ? s.baseRecipeOrder.filter(id => ids.includes(id)) : ids;
                  const o = [...base];
                  const i = o.indexOf(fromId);
                  if (i > -1) {
                    o.splice(i, 1);
                    const t = Math.max(0, Math.min(toIndex, o.length));
                    o.splice(t, 0, fromId);
                    updateSize(idx, { baseRecipeOrder: o });
                  }
                }}
                inventory={inv}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="font-medium">Límites</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {num("Sirops máx.", "maxSyrups")}
          {num("Toppings máx.", "maxToppings")}
          {num("Paso ml", "stepMl")}
          {num("Paso g", "stepG")}
          {num("Hielo máx. ml", "maxIceMl")}
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!C.limits.allowWhipped}
              onChange={(e) =>
                setCfg(c => {
                  const cur = c as BuilderConfig;
                  return { ...cur, limits: { ...cur.limits, allowWhipped: e.target.checked } };
                })
              }
            />
            Permitir crema batida
          </label>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="font-medium">Precios</h2>

        <div className="flex gap-4 flex-wrap">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={C.priceRules.mode === "base_plus_addons"}
              onChange={() =>
                setCfg(c => {
                  const cur = c as BuilderConfig;
                  return {
                    ...cur,
                    priceRules: {
                      mode: "base_plus_addons",
                      basePriceBySize: mapSizes(cur.sizes, 0),
                      addon: { syrupPer10ml: 500, liquidPer50ml: 700, toppingPerUnit: 1000, icePer50ml: 0, whippedPerUnit: 1200 }
                    }
                  };
                })
              }
            />
            Base + add-ons
          </label>

          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={C.priceRules.mode === "cost_plus"}
              onChange={() =>
                setCfg(c => {
                  const cur = c as BuilderConfig;
                  return {
                    ...cur,
                    priceRules: { mode: "cost_plus", marginPct: 0.6, minimumBySize: mapSizes(cur.sizes, 7000) }
                  };
                })
              }
            />
            Cost-plus
          </label>
        </div>

        {C.priceRules.mode === "base_plus_addons" && (
          <>
            <h3 className="text-sm font-medium">Precio base por tamaño</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {C.sizes.map(s => (
                <div key={s.id} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                  <div>{s.name}</div>
                  <input
                    className="input h-9 text-right"
                    type="number"
                    value={String((C.priceRules as any).basePriceBySize[s.id] ?? 0)}
                    onChange={(e) => setBasePrice(s.id, Number(e.target.value || 0))}
                  />
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium mt-2">Tarifas de add-ons</h3>
            {numP("Sirope ($/10ml)", "syrupPer10ml")}
            {numP("Líquido ($/50ml)", "liquidPer50ml")}
            {numP("Topping ($/u)", "toppingPerUnit")}
            {numP("Hielo ($/50ml)", "icePer50ml")}
            {numP("Whipped ($/u)", "whippedPerUnit")}
          </>
        )}

        {C.priceRules.mode === "cost_plus" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                <div>Margen objetivo (%)</div>
                <input
                  className="input h-9 text-right"
                  type="number"
                  value={String(Math.round((C.priceRules as any).marginPct * 100))}
                  onChange={(e) =>
                    setCfg(c => {
                      const cur = c as BuilderConfig;
                      const pct = Math.max(0, Number(e.target.value || 0)) / 100;
                      const prev = cur.priceRules as any;
                      return {
                        ...cur,
                        priceRules: { ...prev, mode: "cost_plus", marginPct: pct, minimumBySize: prev.minimumBySize || mapSizes(cur.sizes, 7000) }
                      };
                    })
                  }
                />
              </div>
            </div>

            <h3 className="text-sm font-medium mt-2">Piso por tamaño</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {C.sizes.map(s => (
                <div key={s.id} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                  <div>{s.name}</div>
                  <input
                    className="input h-9 text-right"
                    type="number"
                    value={String((C.priceRules as any).minimumBySize[s.id] ?? 0)}
                    onChange={(e) => setMinPrice(s.id, Number(e.target.value || 0))}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="font-medium">Modo Kiosk</h2>
        <div className="grid grid-cols-[1fr_120px] gap-2 items-center max-w-md">
          <div>PIN para salir (staff)</div>
          <input
            className="input h-9 text-center"
            value={C.kioskPin || ""}
            onChange={(e) => setCfg(c => {
              const cur = c as BuilderConfig;
              return { ...cur, kioskPin: e.target.value };
            })}
          />
        </div>
      </section>

      <div className="flex justify-end"><button className="btn btn-primary" onClick={save}>Guardar</button></div>
    </main>
  );

  // ---------- helpers que actualizan sobre el estado más reciente ----------
  function updateSize(index: number, patch: Partial<SizeDef>) {
    setCfg(c => {
      const cur = c as BuilderConfig;
      const arr = [...cur.sizes];
      arr[index] = { ...arr[index], ...patch };
      return { ...cur, sizes: arr };
    });
  }

  function removeSize(id: string) {
    setCfg(c => {
      const cur = c as BuilderConfig;
      return { ...cur, sizes: cur.sizes.filter(x => x.id !== id) };
    });
  }

  function orderOf(s: SizeDef): [string, number][] {
    const ids = Object.keys(s.baseRecipe || {});
    const base = Array.isArray(s.baseRecipeOrder) ? s.baseRecipeOrder.filter(id => ids.includes(id)) : ids;
    const missing = ids.filter(id => !base.includes(id));
    const order = [...base, ...missing];
    return order.map<[string, number]>((id) => [id, (s.baseRecipe || {})[id] as number]);
  }

  function normalizeOrder(s: SizeDef, recipe: Recipe, ingId: string) {
    const ids = Object.keys(recipe || {});
    const base = Array.isArray(s.baseRecipeOrder) ? s.baseRecipeOrder.filter(id => ids.includes(id)) : ids;
    const order = [...base];
    if (!order.includes(ingId)) order.push(ingId);
    return order;
  }

  function mapSizes(sizes: SizeDef[], init: number) {
    return Object.fromEntries(sizes.map(s => [s.id, init] as const));
  }

  function setBasePrice(sizeId: string, v: number) {
    setCfg(c => {
      const cur = c as BuilderConfig;
      if (cur.priceRules.mode !== "base_plus_addons") return cur;
      const pr = { ...(cur.priceRules.basePriceBySize || {}) };
      pr[sizeId] = Math.max(0, v);
      return { ...cur, priceRules: { ...(cur.priceRules as any), basePriceBySize: pr } };
    });
  }

  function setMinPrice(sizeId: string, v: number) {
    setCfg(c => {
      const cur = c as BuilderConfig;
      if (cur.priceRules.mode !== "cost_plus") return cur;
      const pr = { ...(cur.priceRules.minimumBySize || {}) };
      pr[sizeId] = Math.max(0, v);
      return { ...cur, priceRules: { ...(cur.priceRules as any), minimumBySize: pr } };
    });
  }

  function num(label: string, key: keyof BuilderLimits) {
    return (
      <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
        <div>{label}</div>
        <input
          className="input h-9 text-right"
          type="number"
          value={String((C.limits as any)[key] ?? 0)}
          onChange={(e) =>
            setCfg(c => {
              const cur = c as BuilderConfig;
              return { ...cur, limits: { ...cur.limits, [key]: Number(e.target.value || 0) } };
            })
          }
        />
      </div>
    );
  }

  function numP(label: string, key: keyof (PriceRules & { addon: any })["addon"]) {
    if (C.priceRules.mode !== "base_plus_addons") return null;
    return (
      <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
        <div>{label}</div>
        <input
          className="input h-9 text-right"
          type="number"
          value={String((C.priceRules as any).addon[key] ?? 0)}
          onChange={(e) =>
            setCfg(c => {
              const cur = c as BuilderConfig;
              return { ...cur, priceRules: { ...(cur.priceRules as any), addon: { ...(cur.priceRules as any).addon, [key]: Number(e.target.value || 0) } } };
            })
          }
        />
      </div>
    );
  }
}

/* Editor simple de receta */
function RecipeEditor({
  rows, nameOf, unitOf, onAdd, onChangeQty, onRemove, onReorder, inventory,
}: {
  rows: [string, number][], nameOf: (id: string) => string, unitOf: (id: string) => Unit,
  onAdd: (ingId: string, qty: number) => void, onChangeQty: (ingId: string, qty: number) => void,
  onRemove: (ingId: string) => void, onReorder: (fromId: string, toIndex: number) => void,
  inventory: InventoryItem[],
}) {
  const [qaText, setQaText] = useState(""); const [qaQty, setQaQty] = useState("1");
  const findByName = (txt: string) => inventory.find(i => i.name.trim().toLowerCase() === txt.trim().toLowerCase());
  return (
    <div className="rounded-xl border mt-3 overflow-hidden">
      <div className="px-3 py-2 text-sm bg-slate-50">Base de vaso</div>
      <div className="p-3 grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2 items-center">
        <input list="inv-list" className="input" placeholder="Añadir ingrediente…" value={qaText} onChange={(e) => setQaText(e.target.value)} />
        <input className="input text-center" type="number" inputMode="numeric" min={0} value={qaQty} onChange={(e) => setQaQty(e.target.value)} />
        <button className="btn btn-sm" onClick={() => { const it = findByName(qaText); if (!it) return alert("Elige un ingrediente válido."); const q = Number(qaQty || 0); onAdd(it.id, Math.max(0, q)); setQaText(""); setQaQty("1"); }}>Añadir</button>
        <datalist id="inv-list">{inventory.map(i => <option key={i.id} value={i.name} />)}</datalist>
      </div>
      <ul>
        {rows.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Sin ingredientes.</li>}
        {rows.map(([id, amount], idx) => {
          const nm = nameOf(id); const u = unitOf(id);
          return (
            <li key={id} className="px-3 py-2 grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center border-t">
              <div className="truncate text-sm">{nm}</div>
              <input className="input h-9 text-right" type="number" value={String(amount)} onChange={(e) => onChangeQty(id, Number(e.target.value || 0))} />
              <div className="text-sm text-slate-600">{u}</div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost btn-sm" title="Subir" onClick={() => onReorder(id, Math.max(0, idx - 1))}>↑</button>
                <button className="btn btn-ghost btn-sm" title="Bajar" onClick={() => onReorder(id, idx + 1)}>↓</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onRemove(id)}>✕</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

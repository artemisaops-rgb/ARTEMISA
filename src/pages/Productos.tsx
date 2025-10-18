// src/pages/Productos.tsx
import { useEffect, useMemo, useState } from "react";
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

type Recipe = Record<string, number>;
type Size = { id: string; name: string; price: number; recipe: Recipe };
type Product = { id: string; name: string; category: string; active: boolean; sizes: Size[] };

type Unit = "g" | "ml" | "u";
type InventoryItem = { id: string; name: string; unit?: Unit; costPerUnit?: number };

const CATS = ["frappes", "coldbrew", "bebidas calientes", "comida"] as const;
const emptyProduct = (): Product => ({ id: "", name: "", category: "frappes", active: true, sizes: [] });

// ——— Curar mojibake en render/búsqueda ———
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

export default function Productos() {
  const [items, setItems] = useState<Product[]>([]);
  const [qtext, setQtext] = useState("");
  const [cat, setCat] = useState<string>(CATS[0]);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // control por producto para mostrar/ocultar tamaños
  const [sizesOpen, setSizesOpen] = useState<Record<string, boolean>>({});
  const isSizesOpen = (productId: string) => sizesOpen[productId] ?? true;
  const toggleSizes = (productId: string) =>
    setSizesOpen((m) => ({ ...m, [productId]: !(m[productId] ?? true) }));

  useEffect(() => {
    (async () => {
      const orgId = getOrgId();

      // Intento con orderBy(name); si falta índice, caigo a base y ordeno en cliente
      let snap;
      try {
        snap = await getDocs(
          fsQuery(collection(db, "products"), where("orgId", "==", orgId), orderBy("name"))
        );
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
        }));
        return {
          id: d.id,
          name: String(x.name ?? ""),
          category: String(x.category ?? "frappes"),
          active: !!x.active,
          sizes,
        };
      });

      // Si vino sin ordenar, ordeno por nombre
      list.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
      setItems(list);
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = qtext.trim().toLowerCase();
    return items
      .filter((p) => p.category === cat)
      .filter((p) => fixText(p.name).toLowerCase().includes(t));
  }, [items, qtext, cat]);

  const upsert = async (p: Product) => {
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
        })),
        updatedAt: serverTimestamp(),
      };

      let newId = p.id;
      if (!p.id) {
        const ref = await addDoc(collection(db, "products"), payload);
        newId = ref.id;
      } else {
        await setDoc(doc(db, "products", p.id), payload, { merge: true });
      }

      // 🔧 FIX duplicado: reemplazar el borrador por el doc real
      const realId = newId;
      const draftId = p.id; // puede ser un UUID provisional
      setItems((cur) =>
        cur
          .map((x) => (x.id === draftId ? { ...p, id: realId } : x))
          .sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)))
      );

      setOpen(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar producto?")) return;
    await deleteDoc(doc(db, "products", id));
    setItems((cur) => cur.filter((x) => x.id !== id));
  };

  return (
    <main className="container-app p-6 pb-28 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <button
          className="btn"
          onClick={() => {
            const draft = { ...emptyProduct(), id: crypto.randomUUID(), name: "Nuevo producto" };
            setItems((cur) => [draft, ...cur]);
            setOpen(draft.id);
          }}
        >
          Nuevo
        </button>
      </div>

      <div className="flex gap-2 overflow-auto pb-1">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "px-3 py-1 rounded-full border whitespace-nowrap " +
              (cat === c ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder="Buscar producto..."
          value={qtext}
          onChange={(e) => setQtext(e.target.value)}
        />
      </div>

      <ul className="space-y-3">
        {filtered.map((p) => (
          <li key={p.id} className="rounded-2xl border bg-white">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{fixText(p.name) || "(sin nombre)"} </div>
                <div className="text-xs text-slate-500">
                  {p.active ? "Activo" : "Inactivo"} · {p.sizes.length} tamaño(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost" onClick={() => setOpen(p.id)}>
                  Editar
                </button>
                {p.id && (
                  <button className="btn btn-danger" onClick={() => remove(p.id)}>
                    Eliminar
                  </button>
                )}
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
              />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function ProductEditor({
  p,
  isSizesOpen,
  toggleSizes,
  setItems,
  onCancel,
  onSave,
  saving,
}: {
  p: Product;
  isSizesOpen: (id: string) => boolean;
  toggleSizes: (id: string) => void;
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="border-t bg-slate-50/50 px-4 pb-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="label">Nombre</div>
          <input
            className="input"
            value={p.name}
            onChange={(e) =>
              setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
            }
          />
        </div>
        <div>
          <div className="label">Categoría</div>
          <select
            className="input"
            value={p.category}
            onChange={(e) =>
              setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, category: e.target.value } : x)))
            }
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={p.active}
              onChange={(e) =>
                setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x)))
              }
            />
            Activo
          </label>
        </div>
      </div>

      {/* ---------- Tamaños ---------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Tamaños</div>

          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => toggleSizes(p.id)}>
              {isSizesOpen(p.id) ? "Ocultar tamaños" : "Mostrar tamaños"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const s: Size = { id: crypto.randomUUID(), name: "nuevo", price: 0, recipe: {} };
                setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, sizes: [...x.sizes, s] } : x)));
              }}
            >
              Añadir tamaño
            </button>
          </div>
        </div>

        {/* Resumen compacto */}
        {!isSizesOpen(p.id) && (
          <div className="flex flex-wrap gap-2">
            {p.sizes.map((s) => (
              <span
                key={s.id}
                className="px-2 py-1 rounded-full border text-xs text-slate-700 bg-white"
                title={`Precio: $${Number(s.price || 0).toLocaleString()}`}
              >
                {fixText(s.name)} · ${Number(s.price || 0).toLocaleString()}
              </span>
            ))}
            {p.sizes.length === 0 && <span className="text-sm text-slate-500">Sin tamaños.</span>}
          </div>
        )}

        {/* Lista completa */}
        {isSizesOpen(p.id) && (
          <>
            {p.sizes.length === 0 && <div className="text-sm text-slate-500">Sin tamaños.</div>}
            <div className="space-y-3">
              {p.sizes.map((s) => (
                <SizeEditor key={s.id} p={p} s={s} setItems={setItems} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function SizeEditor({
  p,
  s,
  setItems,
}: {
  p: Product;
  s: Size;
  setItems: React.Dispatch<React.SetStateAction<Product[]>>;
}) {
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Combobox
  const [search, setSearch] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [picked, setPicked] = useState<InventoryItem | null>(null);
  const [qAdd, setQAdd] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const orgId = getOrgId();
      let snap;
      try {
        snap = await getDocs(
          fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId), orderBy("name"))
        );
      } catch {
        snap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId)));
      }
      const arr = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          name: String(x.name || ""),
          unit: x.unit as Unit,
          costPerUnit: Number(x.costPerUnit || 0),
        };
      });
      arr.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
      setInv(arr);
    })();
  }, []);

  const unitOf = (id: string) => inv.find((x) => x.id === id)?.unit || "";
  const cpuOf = (id: string) => Number(inv.find((x) => x.id === id)?.costPerUnit || 0);
  const nameOf = (id: string) => fixText(inv.find((x) => x.id === id)?.name || id);

  const rows = Object.entries(s.recipe || {});
  const filtered = inv.filter((x) => fixText(x.name).toLowerCase().includes(search.toLowerCase()));

  const update = (patch: Partial<Size>) =>
    setItems((cur) =>
      cur.map((x) => {
        if (x.id !== p.id) return x;
        return { ...x, sizes: x.sizes.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) };
      })
    );

  const setAmount = (ing: string, amount: number) => {
    const recipe = { ...(s.recipe || {}) };
    const v = Math.max(0, Number(amount) || 0);
    if (v > 0) recipe[ing] = v;
    else delete recipe[ing];
    update({ recipe });
  };

  const recipeCost = rows.reduce((sum, [ing, amount]) => sum + cpuOf(ing) * Number(amount || 0), 0);
  const m = Number(s.price || 0) - Number(recipeCost || 0);
  const pct = Number(s.price || 0) > 0 ? (m / Number(s.price)) * 100 : 0;

  return (
    <div className="rounded-xl border p-3 bg-white">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <div className="label">Nombre del tamaño</div>
          <input className="input" value={s.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div>
          <div className="label">Precio</div>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={String(s.price)}
            onChange={(e) => update({ price: Number(e.target.value || 0) })}
          />
        </div>

        <div className="md:col-span-3 flex items-center justify-end gap-2">
          <div className="hidden md:block text-sm text-slate-600">
            Costo receta: <span className="font-semibold">${recipeCost.toLocaleString()}</span> · Margen:{" "}
            <span className={`font-semibold ${m < 0 ? "text-red-600" : "text-emerald-600"}`}>
              ${m.toLocaleString()}
            </span>{" "}
            ·{" "}
            <span className={`font-semibold ${m < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          <button className="btn btn-ghost" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "Mostrar receta" : "Ocultar receta"}
          </button>
        </div>
      </div>

      {/* Añadir ingrediente */}
      <div className="mt-3 rounded-xl border p-3 bg-white">
        <div className="label">Añadir ingrediente</div>

        {picked ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-2 border rounded-lg bg-slate-50">
              <div className="text-sm font-medium">{fixText(picked.name)}</div>
              <div className="text-xs text-slate-500">
                Unidad: {picked?.unit || "u"} · Costo/u: ${Number(picked?.costPerUnit || 0).toLocaleString()}
              </div>
            </div>

            <input
              className="input w-32"
              type="number"
              inputMode="numeric"
              placeholder={`Cant. (${picked?.unit || "u"})`}
              value={String(qAdd)}
              onChange={(e) => setQAdd(Number(e.target.value || 0))}
              autoFocus
            />

            <div className="flex items-center gap-1">
              {[5, 10, 25].map((n) => (
                <button key={n} className="btn btn-sm" onClick={() => setQAdd((v) => Number(v || 0) + n)}>
                  +{n}
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                if (!picked || qAdd <= 0) return;
                setAmount(picked.id, qAdd);
                setPicked(null);
                setQAdd(0);
                setSearch("");
                setComboOpen(false);
              }}
            >
              Añadir
            </button>
            <button className="btn" onClick={() => { setPicked(null); setQAdd(0); }}>
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              className="input w-full"
              placeholder="Buscar ingrediente por nombre..."
              value={search}
              onFocus={() => setComboOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setComboOpen(true);
              }}
            />
            {comboOpen && (
              <div
                className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-xl border bg-white shadow"
                onMouseDown={(e) => e.preventDefault()}
              >
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500">Sin resultados.</div>
                )}
                {filtered.map((it) => (
                  <button
                    key={it.id}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                    onClick={() => {
                      setPicked(it);
                      setComboOpen(false);
                    }}
                  >
                    <div>
                      <div className="font-medium text-sm">{fixText(it.name)}</div>
                      <div className="text-xs text-slate-500">Unidad: {it.unit || "u"}</div>
                    </div>
                    <div className="text-xs text-slate-600">
                      Costo/u: ${Number(it.costPerUnit || 0).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla de receta (colapsable) */}
      {!collapsed && (
        <>
          <div className="overflow-auto mt-3 rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-left">
                  <th className="px-3 py-2">Ingrediente</th>
                  <th className="px-3 py-2">Unidad</th>
                  <th className="px-3 py-2">Cantidad</th>
                  <th className="px-3 py-2">Costo/u</th>
                  <th className="px-3 py-2">Subtotal</th>
                  <th className="px-3 py-2 w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-slate-500" colSpan={6}>
                      Sin receta.
                    </td>
                  </tr>
                )}
                {rows.map(([ing, amount]) => {
                  const cpu = cpuOf(ing);
                  const subtotal = cpu * Number(amount || 0);
                  return (
                    <tr key={ing} className="border-t">
                      <td className="px-3 py-2">{nameOf(ing)}</td>
                      <td className="px-3 py-2">{unitOf(ing)}</td>
                      <td className="px-3 py-2">
                        <input
                          className="input w-24"
                          type="number"
                          inputMode="numeric"
                          value={String(amount)}
                          onChange={(e) => setAmount(ing, Number(e.target.value || 0))}
                        />
                      </td>
                      <td className="px-3 py-2">${cpu.toLocaleString()}</td>
                      <td className="px-3 py-2">${subtotal.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <button className="btn btn-danger btn-sm" onClick={() => setAmount(ing, 0)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-slate-50">
                  <td className="px-3 py-2 font-medium" colSpan={4}>
                    Costo receta
                  </td>
                  <td className="px-3 py-2 font-semibold">${recipeCost.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <div>
              Precio: <span className="font-semibold">${Number(s.price || 0).toLocaleString()}</span>
            </div>
            <div>
              Costo: <span className="font-semibold">${recipeCost.toLocaleString()}</span>
            </div>
            <div>
              Margen:{" "}
              <span className={`font-semibold ${m < 0 ? "text-red-600" : "text-emerald-600"}`}>
                ${m.toLocaleString()}
              </span>
            </div>
            <div>
              Margen %:{" "}
              <span className={`font-semibold ${m < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {pct.toFixed(1)}%
              </span>
            </div>
          </div>
        </>
      )}

      <div className="text-right mt-3">
        <button
          className="btn btn-danger"
          onClick={() => {
            setItems((cur) =>
              cur.map((x) => (x.id === p.id ? { ...x, sizes: x.sizes.filter((y) => y.id !== s.id) } : x))
            );
          }}
        >
          Quitar tamaño
        </button>
      </div>

      <div className="text-right">
        <button className="btn btn-ghost text-xs" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? "Mostrar receta" : "Ocultar receta"}
        </button>
      </div>
    </div>
  );
}

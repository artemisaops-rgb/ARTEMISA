// src/pages/Proveedores.tsx
import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query as fsQuery,
  where,
  orderBy,
  serverTimestamp,
  doc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";

type Provider = {
  id: string;
  orgId: string;
  name: string;
  phone?: string;
  notes?: string;
  packs?: string[];
  createdAt?: any;
};

// Curar mojibake si apareciera
function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map(ch => ch.charCodeAt(0)));
    const dec = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(dec) ? dec : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

export default function Proveedores() {
  const orgId = getOrgId();
  const { user } = useAuth();
  const { isStaff } = useRole(user?.uid);

  const [list, setList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<Partial<Provider>>({
    name: "",
    phone: "",
    notes: "",
    packs: [],
  });
  const [pack, setPack] = useState("");

  // Carga + suscripción (por org, ordenado por nombre). Fallback si falta índice.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const qy = fsQuery(
          collection(db, "providers"),
          where("orgId", "==", orgId),
          orderBy("name", "asc")
        );
        unsub = onSnapshot(qy, (snap) => {
          const xs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Provider[];
          setList(xs);
          setLoading(false);
        });
      } catch {
        // Fallback sin orderBy (por si el índice aún no está compilado en dev)
        const qy2 = fsQuery(collection(db, "providers"), where("orgId", "==", orgId));
        unsub = onSnapshot(qy2, (snap) => {
          const xs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Provider[];
          xs.sort((a, b) => fixText(a.name).localeCompare(fixText(b.name)));
          setList(xs);
          setLoading(false);
        });
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [orgId]);

  const resetForm = () => setForm({ name: "", phone: "", notes: "", packs: [] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = String(form.name || "").trim();
    if (!name) {
      alert("Escribe un nombre de proveedor.");
      return;
    }
    try {
      await addDoc(collection(db, "providers"), {
        orgId,
        name,
        phone: String(form.phone || "").trim(),
        notes: String(form.notes || "").trim(),
        packs: Array.isArray(form.packs) ? form.packs : [],
        createdAt: serverTimestamp(),
      });
      resetForm();
      setPack("");
    } catch (e: any) {
      alert(e?.message || "No se pudo crear el proveedor.");
    }
  };

  const addPack = () => {
    const v = pack.trim();
    if (!v) return;
    setForm((p) => ({ ...p, packs: [...(p.packs || []), v] }));
    setPack("");
  };

  const removePack = (i: number) => {
    setForm((p) => ({ ...p, packs: (p.packs || []).filter((_, idx) => idx !== i) }));
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar proveedor?")) return;
    try {
      await deleteDoc(doc(db, "providers", id));
    } catch (e: any) {
      alert(e?.message || "No se pudo eliminar.");
    }
  };

  // Seguridad UI (las reglas ya lo exigen, pero mostramos mensaje amistoso)
  if (!isStaff) {
    return (
      <div className="container-app p-6">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <div className="mt-3 rounded-2xl border bg-amber-50 text-amber-800 p-4">
          Solo el <b>staff</b> puede ver y administrar proveedores.
        </div>
      </div>
    );
  }

  return (
    <div className="container-app p-6 space-y-6">
      <h1 className="text-2xl font-bold">Proveedores</h1>

      {/* Formulario alta */}
      <form onSubmit={add} className="rounded-2xl border bg-white p-4 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="label">Nombre</div>
          <input
            className="input w-full"
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Lácteos San Juan"
          />
        </div>

        <div>
          <div className="label">Teléfono</div>
          <input
            className="input w-full"
            value={form.phone || ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+57 ..."
          />
        </div>

        <div className="md:col-span-3">
          <div className="label">Notas</div>
          <textarea
            className="input w-full min-h-[80px]"
            value={form.notes || ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Días de entrega, condiciones, observaciones…"
          />
        </div>

        <div className="md:col-span-3">
          <div className="label">Presentaciones típicas</div>
          <div className="flex gap-2">
            <input
              className="input w-full"
              placeholder="Ej: Azúcar x5kg, Leche x1L caja 12"
              value={pack}
              onChange={(e) => setPack(e.target.value)}
            />
            <button type="button" className="btn" onClick={addPack}>
              Agregar
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(form.packs || []).map((p, i) => (
              <span key={i} className="px-2 py-1 rounded-full border text-sm flex items-center gap-2">
                {p}
                <button
                  type="button"
                  className="text-slate-500 hover:text-rose-600"
                  onClick={() => removePack(i)}
                  title="Quitar"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="md:col-span-3 flex justify-end gap-2">
          <button type="button" className="btn" onClick={resetForm}>
            Limpiar
          </button>
          <button className="btn btn-primary">Crear proveedor</button>
        </div>
      </form>

      {/* Listado */}
      <div className="rounded-2xl border overflow-hidden">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2">Proveedor</th>
              <th className="text-left px-3 py-2">Teléfono</th>
              <th className="text-left px-3 py-2">Presentaciones</th>
              <th className="text-left px-3 py-2">Notas</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 font-medium">{fixText(p.name)}</td>
                <td className="px-3 py-2">{p.phone || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(p.packs || []).map((x, i) => (
                      <span key={i} className="px-2 py-1 rounded-full border">
                        {fixText(x)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 max-w-[280px]">
                  <div className="truncate" title={fixText(p.notes) || ""}>
                    {fixText(p.notes) || "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {!loading && list.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                  Sin proveedores
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

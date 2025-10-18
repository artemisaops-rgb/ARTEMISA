import React, { useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

/** Tipos */
type Unit = "g" | "ml" | "u";
type Frequency = "daily" | "weekly" | "monthly";

type CsvRow = {
  name: string;
  unit?: string;
  min?: number | null;
  minStock?: number | null;
  target?: number | null;
  targetStock?: number | null;
  cost?: number | null;
  costPerUnit?: number | null;
  supplier?: string | null;
  provider?: string | null;
  frequency?: string | null; // Diario/Semanal/Mensual o daily/weekly/monthly
};

type SeedItem = {
  name: string;
  unit: Unit;
  minStock: number;
  targetStock: number | null;  // null = usa min*2 en Bodega
  costPerUnit: number;
  supplier: string;
  frequency: Frequency;        // sólo para consumibles
};

const normalizeNum = (v: any): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, "").replace(/[.$]/g, "").replace(",", ".");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const mapFreq = (v?: string | null): Frequency => {
  const s = (v || "").toString().trim().toLowerCase();
  if (["diario", "día", "daily", "d"].includes(s)) return "daily";
  if (["semanal", "weekly", "semana", "w", "s"].includes(s)) return "weekly";
  if (["mensual", "monthly", "mes", "m"].includes(s)) return "monthly";
  return "daily";
};

const mapUnit = (v?: string | null): Unit => {
  const s = (v || "").toString().trim().toLowerCase();
  if (s === "ml") return "ml";
  if (s === "u" || s === "unidad" || s === "unidades") return "u";
  return "g";
};

// CSV muy simple (comas, comillas opcionales). Si ya usas PapaParse puedes cambiarlo.
function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  // parse header
  const splitCsv = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitCsv(lines[0]).map((h) =>
    h.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  );

  const idx = (keys: string[]) =>
    header.findIndex((h) => keys.includes(h));

  const iName = idx(["name", "nombre"]);
  const iUnit = idx(["unit", "unidad"]);
  const iMin = idx(["min", "minimo", "minstock"]);
  const iTarget = idx(["target", "objetivo", "par", "targetstock"]);
  const iCost = idx([
    "cost",
    "costou",
    "costo/u",
    "costo por unidad",
    "costperunit",
    "costperu",
  ]);
  const iSupplier = idx(["supplier", "proveedor", "provider"]);
  const iFreq = idx(["frequency", "frecuencia"]);

  const rows: CsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsv(lines[li]);
    const name = (cols[iName] || "").trim();
    if (!name) continue;

    rows.push({
      name,
      unit: iUnit >= 0 ? cols[iUnit] : undefined,
      min: iMin >= 0 ? normalizeNum(cols[iMin]) : null,
      minStock: iMin >= 0 ? normalizeNum(cols[iMin]) : null,
      target: iTarget >= 0 ? normalizeNum(cols[iTarget]) : null,
      targetStock: iTarget >= 0 ? normalizeNum(cols[iTarget]) : null,
      cost: iCost >= 0 ? normalizeNum(cols[iCost]) : null,
      costPerUnit: iCost >= 0 ? normalizeNum(cols[iCost]) : null,
      supplier: iSupplier >= 0 ? (cols[iSupplier] || "") : "",
      provider: iSupplier >= 0 ? (cols[iSupplier] || "") : "",
      frequency: iFreq >= 0 ? (cols[iFreq] || "") : "",
    });
  }
  return rows;
}

export default function AdminSeed() {
  const { user } = useAuth();
  const orgId = getOrgId();

  const [rawText, setRawText] = useState<string>("");
  const [items, setItems] = useState<SeedItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const countSelected = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  );

  const onFile = async (f: File | null) => {
    if (!f) return;
    const txt = await f.text();
    setRawText(txt);

    const rows = parseCsv(txt);
    const mapped: SeedItem[] = rows.map((r) => ({
      name: r.name.trim(),
      unit: mapUnit(r.unit),
      minStock: Math.max(0, Number(r.minStock ?? r.min ?? 0) || 0),
      targetStock:
        r.targetStock == null && r.target == null
          ? null
          : Math.max(0, Number(r.targetStock ?? r.target ?? 0) || 0),
      costPerUnit: Math.max(0, Number(r.costPerUnit ?? r.cost ?? 0) || 0),
      supplier: (r.supplier ?? r.provider ?? "").toString().trim(),
      frequency: mapFreq(r.frequency),
    }));

    setItems(mapped);
    // seleccionar todo por defecto
    const sel: Record<number, boolean> = {};
    mapped.forEach((_, i) => (sel[i] = true));
    setSelected(sel);
  };

  const toggle = (i: number) =>
    setSelected((p) => ({ ...p, [i]: !p[i] }));

  const replaceInventory = async () => {
    if (!user?.uid) return alert("Inicia sesión primero.");
    if (!items.length) return alert("Sube el CSV primero.");
    const chosen = items.filter((_, i) => selected[i]);
    if (!chosen.length) return alert("No hay filas seleccionadas.");

    if (
      !confirm(
        `Esto borrará TODOS los items de inventario del org "${orgId}" y creará ${chosen.length} nuevos con stock=0.\n¿Seguro?`
      )
    )
      return;

    setBusy(true);
    try {
      // 1) Borrar actuales del org
      const qy = query(
        collection(db, "inventoryItems"),
        where("orgId", "==", orgId)
      );
      const snap = await getDocs(qy);

      let batch = writeBatch(db);
      let ops = 0;

      snap.forEach((d) => {
        batch.delete(doc(db, "inventoryItems", d.id));
        ops++;
        if (ops >= 450) {
          batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      });
      if (ops > 0) await batch.commit();

      // 2) Crear los nuevos (stock=0)
      batch = writeBatch(db);
      ops = 0;

      chosen.forEach((it) => {
        const ref = doc(collection(db, "inventoryItems"));
        batch.set(ref, {
          id: ref.id,
          orgId,
          name: it.name,
          unit: it.unit,
          stock: 0,
          minStock: it.minStock,
          targetStock: it.targetStock, // null => Bodega usa min*2 como par
          costPerUnit: it.costPerUnit,
          supplier: it.supplier || "",
          provider: it.supplier || "",
          frequency: it.frequency,           // sólo aplica a consumibles
          periodicity:
            it.frequency === "daily"
              ? "daily"
              : it.frequency === "monthly"
              ? "monthly"
              : "weekly",
          kind: "consumable",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
        if (ops >= 450) {
          batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      });
      if (ops > 0) await batch.commit();

      alert("Inventario reemplazado con éxito. Ve a Bodega para verlo.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo reemplazar el inventario");
    } finally {
      setBusy(false);
    }
  };

  const wipeOnly = async () => {
    if (!confirm(`Esto borrará TODOS los items de inventario del org "${orgId}". ¿Continuar?`))
      return;
    setBusy(true);
    try {
      const qy = query(collection(db, "inventoryItems"), where("orgId", "==", orgId));
      const snap = await getDocs(qy);
      let batch = writeBatch(db);
      let ops = 0;
      snap.forEach((d) => {
        batch.delete(doc(db, "inventoryItems", d.id));
        ops++;
        if (ops >= 450) {
          batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      });
      if (ops > 0) await batch.commit();
      alert("Inventario borrado.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-app max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AdminSeed — Inventario ideal</h1>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-sm text-slate-600">
          Org actual: <b>{orgId}</b>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="file"
            accept=".csv,text/csv"
            className="border rounded-xl px-3 py-2"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button
            className="btn"
            onClick={wipeOnly}
            disabled={busy}
            title="Borra todos los items del org actual"
          >
            Borrar inventario del org
          </button>
        </div>

        {items.length > 0 && (
          <>
            <div className="text-sm">
              Filas: <b>{items.length}</b> · Seleccionadas: <b>{countSelected}</b>
            </div>
            <div className="rounded-xl border overflow-auto">
              <table className="table min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <th>Nombre</th>
                    <th>Unidad</th>
                    <th>Mín</th>
                    <th>Objetivo</th>
                    <th>Costo/u</th>
                    <th>Proveedor</th>
                    <th>Frecuencia</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selected[i]}
                          onChange={() => toggle(i)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{it.name}</td>
                      <td className="px-3 py-2">{it.unit}</td>
                      <td className="px-3 py-2">{it.minStock.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {it.targetStock == null ? <span className="text-slate-400">—</span> : it.targetStock}
                      </td>
                      <td className="px-3 py-2">${it.costPerUnit.toLocaleString()}</td>
                      <td className="px-3 py-2">{it.supplier || <span className="text-slate-400">-</span>}</td>
                      <td className="px-3 py-2">
                        {it.frequency === "daily" ? "Diario" : it.frequency === "weekly" ? "Semanal" : "Mensual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              className="btn btn-primary w-full"
              disabled={busy || countSelected === 0}
              onClick={replaceInventory}
              title="Borra todo y crea lo del CSV con stock=0"
            >
              {busy ? "Procesando..." : "Reemplazar inventario con CSV (stock=0)"}
            </button>
            <div className="text-xs text-slate-500">
              • Los campos aceptados por el CSV son flexibles: <i>name/nombre, unit/unidad, min/minStock,
              target/objetivo/par, cost/costo/u, supplier/proveedor, frequency/frecuencia</i>.<br />
              • Si <b>Objetivo</b> está vacío, Bodega usará <b>mínimo × 2</b> como par sugerido.
            </div>
          </>
        )}
      </section>
    </div>
  );
}

import React, { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

export default function Apertura() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]); // foto_wpp_sent, foto_wpp_double
  const [cash, setCash] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const toggle = (k: string, list: string[], setList: (xs: string[]) => void) =>
    setList(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const save = async () => {
    if (!user) return;

    // Reglas operativas: exige ambas confirmaciones de WhatsApp
    const needed = ["foto_wpp_sent", "foto_wpp_double"];
    const missing = needed.filter((k) => !tasks.includes(k));
    if (missing.length) {
      alert("Falta completar las confirmaciones de WhatsApp (foto enviada y doble confirmación).");
      return;
    }

    setSaving(true);
    try {
      const dateKey = ymd();
      const id = `${dateKey}_${user.uid}`;
      await setDoc(
        doc(db, "openings", id),
        {
          orgId: import.meta.env.VITE_ORG_ID ?? "default",
          userId: user.uid,
          dateKey,
          checklist: checks,
          tasksDone: tasks,
          initialCash: Number(cash || 0),
          status: "open",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Apertura registrada.");
      setChecks([]);
      setTasks([]);
      setCash(0);
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar la apertura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-app p-6 space-y-4">
      <h1 className="text-2xl font-bold">Apertura</h1>
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Checklist</div>
        {[
          "Limpieza del área",
          "Puesto armado y ordenado",
          "Equipos encendidos y probados",
          "Insumos verificados (stock mínimo)",
        ].map((txt) => (
          <label key={txt} className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="accent-[var(--brand,#f97316)]"
              checked={checks.includes(txt)}
              onChange={() => toggle(txt, checks, setChecks)}
            />
            <span>{txt}</span>
          </label>
        ))}

        <div className="font-semibold pt-2">Confirmaciones WhatsApp (obligatorias)</div>
        {[
          { k: "foto_wpp_sent", label: "Envié la foto del inicio de caja al grupo" },
          { k: "foto_wpp_double", label: "Otra persona confirmó (doble confirmación)" },
        ].map(({ k, label }) => (
          <label key={k} className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="accent-[var(--brand,#f97316)]"
              checked={tasks.includes(k)}
              onChange={() => toggle(k, tasks, setTasks)}
            />
            <span>{label}</span>
          </label>
        ))}

        <div className="mt-2">
          <div className="text-sm text-slate-600">Efectivo inicial</div>
          <input
            type="number"
            value={cash}
            onChange={(e) => setCash(Number(e.target.value || 0))}
            className="w-full rounded-xl border px-3 py-2"
          />
        </div>

        <button disabled={!user || saving} onClick={save} className="btn">
          {saving ? "Guardando..." : "Aperturar"}
        </button>
      </div>
    </div>
  );
}

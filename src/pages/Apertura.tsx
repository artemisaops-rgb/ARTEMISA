// src/pages/Apertura.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import {
  openCaja,
  ymdLocal,
  hasWppConfirmations,
  openingDocIdForUser,
} from "@/lib/cashbox";

type OpeningStatus = "none" | "open" | "closed";

export default function Apertura() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]); // 'foto_wpp_sent', 'foto_wpp_double'
  const [cash, setCash] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OpeningStatus>("none");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const dateKey = ymdLocal();
  const openingId = user?.uid ? openingDocIdForUser(user.uid) : null;

  const toggle = (k: string, list: string[], setList: (xs: string[]) => void) =>
    setList(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  // Cargar apertura existente del día (si hay)
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        const id = openingDocIdForUser(user.uid);
        const ref = doc(db, "openings", id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const v: any = snap.data();
          setChecks(Array.isArray(v?.checklist) ? v.checklist : []);
          const tasksDone: string[] = Array.isArray(v?.tasksDone) ? v.tasksDone : [];
          setTasks(tasksDone);
          setCash(Number(v?.initialCash || 0));
          setStatus(v?.status === "closed" ? "closed" : "open");
        } else {
          setChecks([]);
          setTasks([]);
          setCash(0);
          setStatus("none");
        }
        setLastLoadedAt(new Date());
      } catch {
        // silencioso
      }
    })();
  }, [user?.uid]);

  const hasAllTasks = hasWppConfirmations(tasks);
  const canSave = !!user && hasAllTasks && status !== "closed";

  const save = async () => {
    if (!user) return;
    if (!hasAllTasks) {
      alert("Falta completar las confirmaciones de WhatsApp (foto enviada y doble confirmación).");
      return;
    }
    if (!openingId) return;

    setSaving(true);
    try {
      await openCaja(db, {
        uid: user.uid,
        initialCash: Number(cash || 0),
        checklist: checks,
        tasksDone: tasks, // openCaja valida las 2 confirmaciones
      });

      alert(status === "none" ? "Apertura registrada." : "Apertura actualizada.");
      setStatus("open");
      setLastLoadedAt(new Date());
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo guardar la apertura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-app p-6 space-y-4">
      <h1 className="text-2xl font-bold">Apertura</h1>

      {/* Estado/ayuda */}
      {status === "closed" && (
        <div className="rounded-xl border bg-emerald-50 text-emerald-700 px-4 py-3">
          La apertura de hoy ya fue <b>cerrada</b>. Ve a{" "}
          <Link to="/caja" className="underline font-medium">Caja</Link> para ver el resumen del día.
        </div>
      )}
      {status === "open" && (
        <div className="rounded-xl border bg-amber-50 text-amber-700 px-4 py-3">
          Tienes una apertura <b>activa</b> hoy. Puedes actualizar el efectivo inicial o la checklist.
          Cuando termines el día, cierra en{" "}
          <Link to="/caja" className="underline font-medium">Caja</Link>.
        </div>
      )}
      {status === "none" && (
        <div className="rounded-xl border bg-slate-50 text-slate-700 px-4 py-3">
          Crea la apertura del día. <b>No cargues fotos aquí</b>: solo confirma que las enviaste por WhatsApp.
        </div>
      )}

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
              disabled={status === "closed"}
            />
            <span>{txt}</span>
          </label>
        ))}

        <div className="font-semibold pt-2">Confirmaciones de WhatsApp (obligatorias)</div>
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
              disabled={status === "closed"}
            />
            <span>{label}</span>
          </label>
        ))}

        <div className="mt-2">
          <div className="text-sm text-slate-600">Efectivo inicial</div>
          <input
            type="number"
            min={0}
            value={cash}
            onChange={(e) => setCash(Number(e.target.value || 0))}
            className="w-full rounded-xl border px-3 py-2"
            disabled={status === "closed"}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={!canSave || saving}
            onClick={save}
            className="btn btn-primary disabled:opacity-60"
            title={!hasAllTasks ? "Marca las dos confirmaciones de WhatsApp" : ""}
          >
            {saving ? "Guardando..." : status === "none" ? "Aperturar" : "Actualizar apertura"}
          </button>

          <Link to="/caja" className="btn">Ir a Caja</Link>

          {lastLoadedAt && (
            <span className="text-xs text-slate-500 ml-auto">
              Actualizado: {lastLoadedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

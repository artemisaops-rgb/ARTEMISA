import React, { useEffect, useState } from "react";
// import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"; // eliminado
import { getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { getTodaysShiftTasks, saveShiftTasks } from "@/services/worker";

type TaskKey = "apertura" | "durante" | "cierre" | "limpieza" | "compras";
const DEFAULT_LIST: Record<TaskKey, string[]> = {
  apertura: [
    "Limpieza del área",
    "Puesto armado y ordenado",
    "Equipos encendidos y probados",
    "Insumos verificados (stock mínimo)",
    "Foto a WhatsApp del inicio de caja",
  ],
  durante: [
    "Mantener área limpia",
    "Registrar cada venta en la app",
    "Reponer insumos cuando haga falta",
  ],
  cierre: [
    "Cierre de caja en la app",
    "Apagar equipos",
    "Guardar valores en locker",
    "Dejar puesto ordenado",
  ],
  limpieza: [
    "Lavar utensilios",
    "Desinfectar superficies",
    "Sacar basura",
  ],
  compras: [
    "Revisar sección Compras (rojo = comprar)",
    "Comprar y llevar al puesto",
    "Guardar de valor en locker",
  ],
};

export default function Tareas() {
  const { user } = useAuth();
  const orgId = getOrgId();
  const [data, setData] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    getTodaysShiftTasks(user.uid).then(setData);
  }, [user?.uid]);

  const toggle = (k: string) =>
    setData((p) => ({ ...p, [k]: !p[k] }));

  const save = async () => {
    if (!user) return;
    try {
      await saveShiftTasks(orgId, user.uid, data);
      alert("Guardado.");
    } catch (e) {
      alert("Error al guardar: " + String(e));
    }
  };

  return (
    <div className="container-app p-6 space-y-6">
      <h1 className="text-2xl font-bold">Tareas del turno</h1>
      {(Object.keys(DEFAULT_LIST) as TaskKey[]).map((sec) => (
        <section key={sec} className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="font-semibold capitalize">{sec}</div>
          <div className="space-y-2">
            {DEFAULT_LIST[sec].map((txt, i) => {
              const k = `${sec}.${i}`;
              return (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!data[k]} onChange={() => toggle(k)} />
                  <span>{txt}</span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={save}>Guardar</button>
        <div className="text-xs text-slate-500 self-center">Se guarda por día y usuario.</div>
      </div>
    </div>
  );
}

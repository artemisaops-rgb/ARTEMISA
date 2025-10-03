import React, { useEffect, useState } from "react";
import { db } from "@/services/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function AdminSeed() {
  const [monthly, setMonthly] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "fixedCosts"));
        const v: any = snap.data() || {};
        const m = Number(v.monthly || 0);
        if (!Number.isNaN(m)) setMonthly(m);
        const ts = v.updatedAt?.toDate?.() ? v.updatedAt.toDate() : null;
        if (ts) setLoadedAt(ts.toLocaleString());
      } catch {}
    })();
  }, []);

  const save = async () => {
    try {
      setLoading(true);
      const value = Math.max(0, Math.round(Number(monthly || 0)));
      await setDoc(
        doc(db, "settings", "fixedCosts"),
        { monthly: value, updatedAt: serverTimestamp() },
        { merge: true }
      );
      alert("Costos fijos guardados: COP " + value.toLocaleString());
    } catch (e: any) {
      alert(e?.message || "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Semilla: Costos fijos</h1>
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <label className="text-sm">Costos fijos mensuales (COP)</label>
        <input
          type="number"
          inputMode="numeric"
          className="border rounded-xl px-3 py-2 w-full"
          value={Number.isNaN(monthly) ? 0 : monthly}
          onChange={(e) => setMonthly(Number(e.target.value))}
        />
        {loadedAt && <div className="text-xs text-slate-500">�sltima carga: {loadedAt}</div>}
        <button
          onClick={save}
          disabled={loading}
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {loading ? "Guardando�?�" : "Guardar costos fijos"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Este valor alimenta el punto de equilibrio en <b>Estadísticas</b>.
      </p>
    </div>
  );
}

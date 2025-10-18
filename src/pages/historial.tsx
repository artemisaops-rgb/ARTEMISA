import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

type Day = { id: string; dateKey: string; salesCash?: number; cashDiff?: number; expenses?: number; revenue?: number; };

export default function Historial() {
  const orgId = getOrgId();
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    const qy = query(collection(db, "dailySummary"), where("orgId", "==", orgId), orderBy("dateKey", "desc"));
    return onSnapshot(qy, (snap) => {
      setDays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
  }, [orgId]);

  const totals = useMemo(() => {
    const last30 = days.slice(0, 30);
    const s = (f: (d: Day)=>number) => last30.reduce((a, x) => a + (f(x)||0), 0);
    return {
      ventas: s(d => Number(d.salesCash||0)),
      egresos: s(d => Number(d.expenses||0)),
      utilidad: s(d => Number(d.revenue||0)),
    };
  }, [days]);

  const money = (n?: number) => `$${Number(n||0).toLocaleString()}`;

  return (
    <div className="container-app p-6 space-y-6">
      <h1 className="text-2xl font-bold">Historial diario</h1>

      <div className="grid md:grid-cols-3 gap-3">
        <Stat title="Ventas (30d)" value={money(totals.ventas)} />
        <Stat title="Gastos (30d)" value={money(totals.egresos)} />
        <Stat title="Utilidad (30d)" value={money(totals.utilidad)} />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-right px-3 py-2">Ventas (efectivo)</th>
              <th className="text-right px-3 py-2">Egresos</th>
              <th className="text-right px-3 py-2">Utilidad</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2">{d.dateKey}</td>
                <td className="px-3 py-2 text-right">{money(d.salesCash)}</td>
                <td className="px-3 py-2 text-right">{money(d.expenses)}</td>
                <td className="px-3 py-2 text-right">{money(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({title, value}:{title:string; value:string}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

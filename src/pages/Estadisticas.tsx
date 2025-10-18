import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, getDoc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import {
  ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  BarChart, Bar, Legend, PieChart, Pie
} from "recharts";

type KPIs = { today: number; week: number; cogs: number; margin: number };
type DayPoint = { day: string; sales: number };

export default function Estadisticas() {
  const ORG_ID = getOrgId();
  const [data, setData] = useState<KPIs>({ today: 0, week: 0, cogs: 0, margin: 0 });
  const [series30d, setSeries30d] = useState<DayPoint[]>([]);
  const [payDonut, setPayDonut] = useState<{ name: string; value: number }[]>([]);
  const [bep, setBep] = useState({ fixed: 0, margin30d: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

        // Semana (lunes a domingo)
        const wd = (now.getDay() + 6) % 7; // 0=Lunes
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - wd);
        weekStart.setHours(0, 0, 0, 0);

        // Rango 30 días por deliveredAt
        const from30 = new Date(now);
        from30.setDate(now.getDate() - 29);
        from30.setHours(0, 0, 0, 0);

        const q30 = query(
          collection(db, "orders"),
          where("orgId", "==", ORG_ID),
          where("deliveredAt", ">=", Timestamp.fromDate(from30)),
          orderBy("deliveredAt", "asc")
        );
        const snaps = await getDocs(q30);

        // Serie base (todos los días, aunque no haya ventas)
        const map30: Record<string, number> = {};
        const seriesKeys: string[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          d.setHours(0, 0, 0, 0);
          const key = d.toISOString().slice(5, 10); // "MM-DD"
          seriesKeys.push(key);
          map30[key] = 0;
        }

        let today = 0, week = 0, sum30 = 0;
        let cogsWeek = 0, cogs30 = 0;
        const pay = { cash: 0, qr: 0, card: 0, other: 0 as number };

        snaps.forEach((s) => {
          const v: any = s.data();
          if (String(v.status || "") !== "delivered") return;

          const total = Number(v.total) || 0;
          const payMethod = String(v.payMethod || "other") as keyof typeof pay;

          const ts = v.deliveredAt?.toMillis?.() ? v.deliveredAt.toMillis() : 0;
          if (!ts || total <= 0) return;

          const d = new Date(ts); d.setHours(0, 0, 0, 0);
          const key = d.toISOString().slice(5, 10);

          // Ventas (30d, semana, hoy)
          if (key in map30) {
            map30[key] += total;
            sum30 += total;
          }
          if (d.getTime() >= todayStart.getTime()) today += total;
          if (d.getTime() >= weekStart.getTime()) week += total;

          // Métodos de pago (30d)
          if (pay[payMethod] === undefined) pay.other += total; else pay[payMethod] += total;

          // COGS reales si existen; si no, estimación 35% como fallback
          const cogsVal = Number(v.cogs);
          const cogsForThis = Number.isFinite(cogsVal) && cogsVal > 0 ? cogsVal : Math.round(total * 0.35);
          if (key in map30) cogs30 += cogsForThis;
          if (d.getTime() >= weekStart.getTime()) cogsWeek += cogsForThis;
        });

        const margin = week - cogsWeek;
        const margin30d = sum30 - cogs30;

        // Costos fijos mensuales desde settings/fixedCosts (fallback: settings/{orgId})
        let fixed = 0;
        try {
          let st = await getDoc(doc(db, "settings", "fixedCosts"));
          if (!st.exists()) st = await getDoc(doc(db, "settings", ORG_ID));
          const raw: any = st.exists() ? st.data() : {};
          // Admite fixedCosts.monthly o monthlyFixed
          const monthly =
            raw?.fixedCosts?.monthly ??
            raw?.monthlyFixed ??
            0;
          fixed = Number(monthly) || 0;
        } catch { /* noop */ }

        if (!alive) return;
        setData({ today, week, cogs: Math.round(cogsWeek), margin: Math.round(margin) });
        setSeries30d(seriesKeys.map((k) => ({ day: k, sales: map30[k] })));
        setPayDonut([
          { name: "Efectivo", value: pay.cash },
          { name: "QR",       value: pay.qr },
          { name: "Tarjeta",  value: pay.card },
          { name: "Otros",    value: pay.other },
        ]);
        setBep({ fixed, margin30d: Math.round(margin30d) });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ORG_ID]);

  const totalsBar = useMemo(
    () => ([
      { name: "Ventas", value: data.week },
      { name: "COGS",   value: data.cogs },
      { name: "Margen", value: data.margin },
    ]),
    [data]
  );

  const Card = ({ t, v }: { t: string; v: number }) => (
    <div className="bg-white rounded-2xl border p-4">
      <div className="text-slate-500">{t}</div>
      <div className="text-2xl font-semibold">${(Number(v) || 0).toLocaleString()}</div>
    </div>
  );

  return (
    <div className="container-app p-6 pb-28 space-y-6">
      <h1 className="text-2xl font-bold">Estadísticas</h1>

      {loading ? (
        <div className="text-slate-500">Cargando métricas…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card t="Ventas hoy" v={data.today} />
            <Card t="Ventas semana" v={data.week} />
            <Card t="COGS (real/estimado)" v={data.cogs} />
            <Card t="Margen (real/estimado)" v={data.margin} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Línea 30 días */}
            <div className="bg-white rounded-2xl border p-4">
              <div className="mb-2 font-medium">Ventas últimos 30 días</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={series30d}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" /><YAxis /><Tooltip />
                    <Line type="monotone" dataKey="sales" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut métodos de pago */}
            <div className="bg-white rounded-2xl border p-4">
              <div className="mb-2 font-medium">Métodos de pago (30 días)</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={payDonut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} />
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Barras semanales */}
          <div className="bg-white rounded-2xl border p-4">
            <div className="mb-2 font-medium">Semana: Ventas / COGS / Margen</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={totalsBar}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
                  <Bar dataKey="value" name="Monto" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BEP */}
          <div className="bg-white rounded-2xl border p-4">
            <div className="font-medium mb-1">Punto de equilibrio (mensual)</div>
            <div className="text-sm text-slate-600 mb-2">Costos fijos: ${bep.fixed.toLocaleString()}</div>
            <div className="text-sm">
              Margen últimos 30d: <b>${bep.margin30d.toLocaleString()}</b>
            </div>
            <div className="text-sm">
              {bep.margin30d >= bep.fixed
                ? "¡Listo! Cubriste tus fijos este mes."
                : `Te faltan $${(bep.fixed - bep.margin30d).toLocaleString()} para cubrir los fijos.`}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

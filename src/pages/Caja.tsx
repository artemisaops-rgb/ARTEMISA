// src/pages/Caja.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, getOrgId } from "@/services/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/Auth";
import {
  MIN_DRAWER_CASH,
  willViolateMinCash,
  ymdLocal,
  dayRange,
  openingDocIdForUser,
  addCashMovement,
  tryWriteDailySummary,
  closeOpeningForUser,
} from "@/lib/cashbox";

type CashType = "in" | "out";
type Movement = {
  id: string;
  at?: Timestamp | null;
  type: CashType;
  amount: number;
  reason?: string | null;
  orderId?: string | null;
};

type PayMethod = "cash" | "qr" | "card" | "other";
type ByMethod = Record<PayMethod, { total: number; count: number }>;

const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;
const fmt = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default function Caja() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const navigate = useNavigate();
  const orgId = getOrgId();

  const [type, setType] = useState<CashType>("in");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");

  const [movs, setMovs] = useState<Movement[]>([]);
  const [openingCash, setOpeningCash] = useState(0);

  const emptyByMethod: ByMethod = {
    cash: { total: 0, count: 0 },
    qr: { total: 0, count: 0 },
    card: { total: 0, count: 0 },
    other: { total: 0, count: 0 },
  };
  const [salesTotal, setSalesTotal] = useState(0);
  const [refundsTotal, setRefundsTotal] = useState(0);
  const [cogsTotal, setCogsTotal] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [byMethod, setByMethod] = useState<ByMethod>(emptyByMethod);

  const [openingStatus, setOpeningStatus] =
    useState<"unknown" | "absent" | "open" | "closed">("unknown");
  const [openingHasWpp, setOpeningHasWpp] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const [finalCash, setFinalCash] = useState<number>(0);

  // Movimientos del día por orgId
  useEffect(() => {
    const { from, to } = dayRange();
    const qy = query(
      collection(db, "cashMovements"),
      where("orgId", "==", orgId),
      where("at", ">=", from),
      where("at", "<", to),
      orderBy("at", "desc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const xs: Movement[] = [];
      snap.forEach((d) => {
        const v: any = d.data();
        xs.push({
          id: d.id,
          at: v.at ?? null,
          type: v.type,
          amount: Number(v.amount || 0),
          reason: v.reason ?? null,
          orderId: v.orderId ?? null,
        });
      });
      setMovs(xs);
    });
    return () => unsub();
  }, [orgId]);

  // Apertura y confirmaciones
  const refreshOpening = useCallback(async () => {
    if (!uid) {
      setOpeningStatus("absent");
      setOpeningHasWpp(null);
      return;
    }
    const openRefId = openingDocIdForUser(uid);
    const openRef = doc(collection(db, "openings"), openRefId);
    const snap = await getDoc(openRef);
    if (!snap.exists()) {
      setOpeningStatus("absent");
      setOpeningHasWpp(null);
      setOpeningCash(0);
      return;
    }
    const v: any = snap.data();
    setOpeningStatus(v?.status === "closed" ? "closed" : "open");
    setOpeningCash(Number(v?.initialCash || 0));
    const tasks: string[] = Array.isArray(v?.tasksDone) ? v.tasksDone : [];
    setOpeningHasWpp(tasks.includes("foto_wpp_sent") && tasks.includes("foto_wpp_double"));
  }, [uid]);

  // Ventas del día por orgId (para métricas y métodos de pago)
  const refreshOrdersMetrics = useCallback(async () => {
    const { from, to } = dayRange();
    let _sales = 0,
      _cogs = 0,
      _count = 0,
      _refunds = 0;
    const _by: ByMethod = {
      cash: { total: 0, count: 0 },
      qr: { total: 0, count: 0 },
      card: { total: 0, count: 0 },
      other: { total: 0, count: 0 },
    };

    // entregadas hoy
    {
      const qDelivered = query(
        collection(db, "orders"),
        where("orgId", "==", orgId),
        where("deliveredAt", ">=", from),
        where("deliveredAt", "<", to)
      );
      const ss = await getDocs(qDelivered);
      ss.forEach((d) => {
        const v: any = d.data();
        if (String(v.status || "") !== "delivered") return;
        const total = Number(v.total || 0);
        const c = Number(v.cogs || 0);
        const pm = (v.payMethod || "other") as PayMethod;
        if (total > 0) {
          _sales += total;
          _count += 1;
          _by[pm].total += total;
          _by[pm].count += 1;
        }
        if (c > 0) _cogs += c;
      });
    }

    // anuladas hoy
    {
      const qCanceled = query(
        collection(db, "orders"),
        where("orgId", "==", orgId),
        where("canceledAt", ">=", from),
        where("canceledAt", "<", to)
      );
      const ss = await getDocs(qCanceled);
      ss.forEach((d) => {
        const v: any = d.data();
        if (String(v.status || "") !== "canceled") return;
        const total = Number(v.total || 0);
        if (total > 0) _refunds += total;
      });
    }

    setSalesTotal(_sales);
    setCogsTotal(_cogs);
    setDeliveredCount(_count);
    setByMethod(_by);
    setRefundsTotal(_refunds);
  }, [orgId]);

  useEffect(() => {
    refreshOpening();
    refreshOrdersMetrics();
  }, [refreshOpening, refreshOrdersMetrics]);

  // Resumen derivado
  const inTotal = useMemo(
    () => movs.filter((m) => m.type === "in").reduce((a, b) => a + Number(b.amount || 0), 0),
    [movs]
  );
  const outTotal = useMemo(
    () => movs.filter((m) => m.type === "out").reduce((a, b) => a + Number(b.amount || 0), 0),
    [movs]
  );
  const cashSales = byMethod.cash.total;
  const expectedCash = openingCash + cashSales + inTotal - outTotal;

  // Precargar efectivo final con el esperado una vez
  useEffect(() => {
    if (openingStatus === "open" && Number(finalCash) === 0 && expectedCash > 0) {
      setFinalCash(expectedCash);
    }
  }, [openingStatus, expectedCash]); // eslint-disable-line react-hooks/exhaustive-deps

  const canOperate = openingStatus === "open";

  const submit = async () => {
    if (!uid) return alert("Debes iniciar sesión");
    if (!canOperate) return alert("Primero realiza la Apertura de hoy.");
    const amt = Number(amount);
    if (!(amt > 0)) return alert("El monto debe ser mayor a 0");
    if (type === "out" && willViolateMinCash(expectedCash, "out", amt, MIN_DRAWER_CASH)) {
      const ok = confirm(
        `⚠️ Este egreso dejaría la caja por debajo del mínimo (${MIN_DRAWER_CASH.toLocaleString()}). ¿Continuar de todas formas?`
      );
      if (!ok) return;
    }
    try {
      setLoading(true);
      // Usa helper para escribir movimientos coherentes con toda la app
      await addCashMovement(db, {
        userId: uid,
        type,
        amount: amt,
        reason: reason || undefined,
        orderId: orderId || undefined,
      });
      setAmount("");
      setReason("");
      setOrderId("");
    } catch (e: any) {
      alert(e?.message || "No se pudo registrar el movimiento");
    } finally {
      setLoading(false);
    }
  };

  const ticketAvg = deliveredCount ? Math.round(salesTotal / deliveredCount) : 0;
  const profit = salesTotal - cogsTotal - refundsTotal;
  const cashDiff = Number(finalCash || 0) - Number(expectedCash || 0);

  const handleClose = async () => {
    if (!uid) return alert("Debes iniciar sesión");
    try {
      setSavingClose(true);

      // Verifica apertura + confirmaciones WPP
      const openRefId = openingDocIdForUser(uid);
      const openSnap = await getDoc(doc(collection(db, "openings"), openRefId));
      if (!openSnap.exists() || (openSnap.data() as any)?.status !== "open") {
        alert("No hay apertura abierta hoy para tu usuario. Ve a Apertura.");
        setSavingClose(false);
        return;
      }
      const tasks: string[] = Array.isArray((openSnap.data() as any)?.tasksDone)
        ? (openSnap.data() as any).tasksDone
        : [];
      if (!(tasks.includes("foto_wpp_sent") && tasks.includes("foto_wpp_double"))) {
        alert("Faltan las 2 confirmaciones de WhatsApp en la Apertura.");
        setSavingClose(false);
        return;
      }

      // Escribe resumen (si roles lo permiten)
      await tryWriteDailySummary(db, {
        dateKey: ymdLocal(),
        data: {
          date: ymdLocal(),
          totals: {
            sales: salesTotal,
            refunds: refundsTotal,
            cogs: cogsTotal,
            deliveredCount,
            byMethod,
            expectedCash,
            ticketAvg,
            profit,
          },
          finalCash: Number(finalCash || 0),
          cashDiff,
          user: uid,
          createdAt: serverTimestamp(),
          orgId,
        },
      });

      // Cierra usando helper (merge compatible con rules)
      const res = await closeOpeningForUser(db, uid, {
        expectedCash,
        countedCash: Number(finalCash || 0),
      });
      if (res === "no-opening") {
        alert("No se encontró apertura para hoy.");
      } else {
        alert("Cierre de caja registrado.");
        setFinalCash(0);
        setOpeningStatus("closed");
      }
    } catch (e: any) {
      alert(e?.message || "No se pudo cerrar la caja.");
    } finally {
      setSavingClose(false);
    }
  };

  const handleRefresh = () => {
    refreshOpening();
    refreshOrdersMetrics();
  };

  return (
    <div className="container-app p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caja</h1>
        <button onClick={handleRefresh} className="btn">
          Actualizar resumen
        </button>
      </div>

      {/* Banners de estado */}
      {openingStatus === "unknown" && (
        <div className="rounded-xl border bg-slate-50 text-slate-700 px-4 py-3">Cargando estado de Apertura…</div>
      )}
      {openingStatus === "absent" && (
        <div className="rounded-2xl border bg-amber-50 text-amber-800 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="font-semibold">No tienes Apertura registrada hoy.</div>
            <div className="text-sm">Completa checklist + doble confirmación de WhatsApp para operar Caja.</div>
          </div>
          <button
            onClick={() => navigate("/apertura")}
            className="px-4 py-2 rounded-xl bg-[var(--brand,#f97316)] text-white"
          >
            Ir a Apertura
          </button>
        </div>
      )}
      {openingStatus === "closed" && (
        <div className="rounded-2xl border bg-blue-50 text-blue-800 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="font-semibold">La Apertura de hoy ya fue cerrada.</div>
            <div className="text-sm">No se pueden registrar más movimientos. Puedes revisar el resumen diario.</div>
          </div>
          <Link to="/apertura" className="px-4 py-2 rounded-xl bg-white border">
            Ver Apertura
          </Link>
        </div>
      )}
      {openingStatus === "open" && openingHasWpp === false && (
        <div className="rounded-xl border bg-yellow-50 text-yellow-700 px-4 py-3">
          Falta confirmar en Apertura que <b>enviaste la foto al grupo de WhatsApp</b> (2 casillas). Es obligatorio para cerrar
          caja.
        </div>
      )}

      {/* Resumen del día */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-slate-500">Efectivo inicial</div>
          <div className="text-2xl font-semibold">{money(openingCash)}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-slate-500">Ventas (efectivo)</div>
          <div className="text-2xl font-semibold">{money(byMethod.cash.total)}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-slate-500">Ingresos − Egresos</div>
          <div className="text-2xl font-semibold">{money(inTotal - outTotal)}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-slate-500">Efectivo esperado</div>
          <div className="text-2xl font-semibold">{money(expectedCash)}</div>
        </div>
      </div>

      {/* Ventas por método */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="text-lg font-semibold mb-2">Ventas del día por método</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Efectivo</span>
            <span>
              <b>{money(byMethod.cash.total)}</b> ({byMethod.cash.count})
            </span>
          </div>
          <div className="flex justify-between">
            <span>QR</span>
            <span>
              <b>{money(byMethod.qr.total)}</b> ({byMethod.qr.count})
            </span>
          </div>
          <div className="flex justify-between">
            <span>Tarjeta</span>
            <span>
              <b>{money(byMethod.card.total)}</b> ({byMethod.card.count})
            </span>
          </div>
          <div className="flex justify-between">
            <span>Otro</span>
            <span>
              <b>{money(byMethod.other.total)}</b> ({byMethod.other.count})
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          * El <b>esperado</b> de caja incluye solo efectivo; QR/Tarjeta no se suman a la gaveta.
        </div>
      </div>

      {/* Formulario de movimientos */}
      <div className={`bg-white border rounded-2xl p-4 space-y-3 ${!canOperate ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="font-medium">Nuevo movimiento</div>
        <div className="flex flex-wrap gap-2">
          {(["in", "out"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1 rounded-xl border ${
                type === t ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "bg-white"
              }`}
              disabled={!canOperate}
            >
              {t === "in" ? "Ingreso" : "Egreso"}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <input
            className="border rounded-xl px-3 py-2"
            placeholder="Monto"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!canOperate}
          />
          <input
            className="border rounded-xl px-3 py-2 md:col-span-2"
            placeholder="Motivo (opcional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={!canOperate}
          />
          <input
            className="border rounded-xl px-3 py-2"
            placeholder="OrderId (opcional)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            disabled={!canOperate}
          />
        </div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={submit} disabled={!canOperate || loading || !amount}>
            {loading ? "Guardando..." : "Registrar"}
          </button>
          <button className="btn" onClick={handleRefresh}>
            Actualizar resumen
          </button>
        </div>
      </div>

      {/* Movimientos del día */}
      <div className="bg-white border rounded-2xl p-4 space-y-2">
        <div className="font-medium">Movimientos de hoy</div>
        {!movs.length && <div className="text-slate-500">Sin movimientos.</div>}
        {movs.map((m) => {
          const d = m.at && typeof (m.at as any).toDate === "function" ? (m.at as any).toDate() : null;
          return (
            <div key={m.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    m.type === "in" ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {m.type === "in" ? "Ingreso" : "Egreso"}
                </span>
                <span className="font-medium">{money(m.amount)}</span>
                {m.reason ? <span className="text-slate-600 text-sm">· {m.reason}</span> : null}
                {m.orderId ? <span className="text-slate-400 text-xs">· {m.orderId}</span> : null}
              </div>
              <div className="text-slate-500 text-xs">{d ? fmt(d) : ""}</div>
            </div>
          );
        })}
      </div>

      {/* Cierre integrado */}
      <div className={`bg-white border rounded-2xl p-4 max-w-md ${!canOperate ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="text-lg font-semibold mb-2">Cerrar caja</div>
        <div className="text-sm text-slate-500 mb-1">
          Efectivo esperado hoy: <b>{money(expectedCash)}</b>
        </div>
        <label className="block text-sm mb-1">Efectivo final contado</label>
        <input
          type="number"
          value={Number.isNaN(finalCash) ? 0 : finalCash}
          onChange={(e) => setFinalCash(Number(e.target.value))}
          className="w-full border rounded-lg px-3 py-2 mb-2"
          disabled={!canOperate}
        />
        <div
          className={`text-sm mb-3 ${
            cashDiff === 0 ? "text-green-600" : cashDiff > 0 ? "text-amber-600" : "text-red-600"
          }`}
        >
          Diferencia: <b>{money(cashDiff)}</b>
        </div>
        <button
          onClick={handleClose}
          disabled={!canOperate || savingClose}
          className="w-full py-2 rounded-xl bg-[var(--brand,#f97316)] text-white disabled:opacity-60"
        >
          {savingClose ? "Guardando..." : "Cerrar caja"}
        </button>
      </div>
    </div>
  );
}

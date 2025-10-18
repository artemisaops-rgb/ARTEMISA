// src/pages/ComprasDetalle.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import {
  receivePurchase,
  markPurchaseOrdered,
  type PurchaseDoc,
  type PurchaseItem,
} from "@/lib/purchases";
import {
  getTodayCashProjection,
  MIN_DRAWER_CASH,
  willViolateMinCash,
} from "@/lib/cashbox";

type Row = PurchaseItem & {
  original?: { qty: number; unitCost: number };
  totalCost: number;
};

const currency = (n: number) => `$${Number(n || 0).toLocaleString()}`;

function fixText(s?: string) {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const dec = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(dec) ? dec : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

const dateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** ===== Export helpers (texto/whatsapp/clipboard/print) ===== */
function formatPurchaseAsText(p: PurchaseDoc, rows: Row[]) {
  const head = `🧾 Lista de compras — Orden #${p.id}${
    p.supplier ? ` (Proveedor: ${p.supplier})` : ""
  }\n${dateKey()}\n`;
  const body =
    rows.length === 0
      ? "• (Sin ítems)"
      : rows
          .map(
            (r) =>
              `• ${fixText(r.name || "")} — ${Number(r.qty).toLocaleString()} ${
                r.unit || ""
              }`
          )
          .join("\n");
  const total = rows.reduce((s, r) => s + (r.totalCost || 0), 0);
  return `${head}\n${body}\n\nSubtotal: ${currency(total)}`;
}
async function shareText(text: string) {
  try {
    if (navigator.share) return await navigator.share({ title: "Lista de compras", text });
  } catch {}
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copiado al portapapeles ✅");
  } catch {
    alert("No se pudo copiar, intenta manualmente.");
  }
}
function printRows(p: PurchaseDoc, rows: Row[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="4" class="empty">Sin ítems</td></tr>`
      : rows
          .map(
            (r, i) => `<tr>
        <td class="idx">${i + 1}</td>
        <td class="name">${fixText(r.name || "")}</td>
        <td class="qty">${Number(r.qty).toLocaleString()} ${r.unit || ""}</td>
        <td class="money">${currency(r.totalCost || 0)}</td>
      </tr>`
          )
          .join("");
  const subtotal = rows
    .reduce((s, r) => s + (r.totalCost || 0), 0)
    .toLocaleString();
  w.document.write(`
  <html><head><meta charset="utf-8" />
    <title>Orden #${p.id}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:24px}
      h1{font-size:18px;margin:0 0 6px}
      .muted{color:#64748b;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
      .idx{width:40px;text-align:center}
      .qty{width:180px;text-align:right}
      .money{width:160px;text-align:right}
      .empty{text-align:center;color:#64748b}
      .foot{margin-top:10px;text-align:right;font-weight:600}
      @media print{.hint{display:none}}
    </style>
  </head>
  <body>
    <h1>Lista de compras — Orden #${p.id}${p.supplier ? ` (Proveedor: ${p.supplier})` : ""}</h1>
    <div class="muted">${dateKey()}</div>
    <table>
      <thead><tr><th>#</th><th>Ítem</th><th>Cantidad</th><th>Importe</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="foot">Subtotal: $${subtotal}</div>
    <p class="hint">Sugerencia: Archivo → Imprimir → Guardar como PDF.</p>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/** ===== Badge de estado ===== */
const StatusBadge = ({ status }: { status: PurchaseDoc["status"] }) => {
  const m: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    ordered: "bg-blue-100 text-blue-700",
    received: "bg-emerald-100 text-emerald-700",
    canceled: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[status] || "bg-slate-100"}`}>
      {status}
    </span>
  );
};

export default function ComprasDetalle() {
  // Soporta rutas /compras/:id o /compras/:purchaseId
  const params = useParams();
  const purchaseId =
    (params.id as string) ||
    (params.purchaseId as string) ||
    "";
  const navigate = useNavigate();

  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { uiRole } = usePreviewRole();
  const ownerMonitor = realRole === "owner" && (uiRole == null || uiRole === "owner");

  const [purchase, setPurchase] = useState<PurchaseDoc | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Meta (encabezado)
  const [supplierDraft, setSupplierDraft] = useState<string>("");
  const [notesDraft, setNotesDraft] = useState<string>("");

  // Caja (guardrail)
  const [expectedCash, setExpectedCash] = useState<number>(0);
  const [payFromCash, setPayFromCash] = useState<number>(0);

  // Suscripción al purchase
  useEffect(() => {
    if (!purchaseId) return;
    const ref = doc(db, "purchases", purchaseId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setPurchase(null);
        setRows([]);
        setLoading(false);
        return;
      }
      const p = snap.data() as any as PurchaseDoc;
      setPurchase(p);
      setSupplierDraft(p.supplier ?? "");
      setNotesDraft(p.notes ?? "");

      const mapped: Row[] = (p.items || []).map((it) => {
        const qty = Number(it.qty || 0);
        const unitCost = Number(it.unitCost || 0);
        return {
          ...it,
          qty,
          unitCost,
          totalCost: qty * unitCost,
          original: { qty, unitCost },
        };
      });
      setRows(mapped);
      setLoading(false);
    });
    return () => unsub();
  }, [purchaseId]);

  // Proyección de caja (para validar pagos en efectivo)
  useEffect(() => {
    (async () => {
      try {
        const proj = await getTodayCashProjection(db);
        setExpectedCash(Number(proj.expectedCash || 0));
      } catch {
        setExpectedCash(0);
      }
    })();
  }, []);

  // Aviso al navegar con cambios sin guardar
  const isLinesDirty = useMemo(
    () =>
      rows.some(
        (r) =>
          Number(r.qty) !== Number(r.original?.qty ?? r.qty) ||
          Number(r.unitCost) !== Number(r.original?.unitCost ?? r.unitCost)
      ),
    [rows]
  );
  const isMetaDirty = useMemo(
    () =>
      (purchase?.supplier ?? "") !== supplierDraft ||
      (purchase?.notes ?? "") !== notesDraft,
    [purchase, supplierDraft, notesDraft]
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isLinesDirty || isMetaDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isLinesDirty, isMetaDirty]);

  const canOperate = useMemo(() => {
    if (!purchase || ownerMonitor) return false;
    return purchase.status === "draft" || purchase.status === "ordered";
  }, [purchase, ownerMonitor]);

  const updateRow = (idx: number, patch: Partial<PurchaseItem>) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], ...patch } as Row;
      r.qty = Math.max(0, Number(r.qty || 0));
      r.unitCost = Math.max(0, Number(r.unitCost || 0));
      r.totalCost = Number(r.qty || 0) * Number(r.unitCost || 0);
      next[idx] = r;
      return next;
    });
  };

  const removeRow = (idx: number) => {
    if (!canOperate) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetChanges = () => {
    if (!purchase) return;
    const mapped: Row[] = (purchase.items || []).map((it) => {
      const qty = Number(it.qty || 0);
      const unitCost = Number(it.unitCost || 0);
      return {
        ...it,
        qty,
        unitCost,
        totalCost: qty * unitCost,
        original: { qty, unitCost },
      };
    });
    setRows(mapped);
    setSupplierDraft(purchase.supplier ?? "");
    setNotesDraft(purchase.notes ?? "");
  };

  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + Number(r.totalCost || 0), 0),
    [rows]
  );

  const rowsPayload = useMemo(
    () =>
      rows.map((r) => ({
        ingredientId: r.ingredientId,
        name: r.name,
        unit: r.unit ?? null,
        qty: Number(r.qty || 0),
        unitCost: Number(r.unitCost || 0),
        totalCost: Number(r.qty || 0) * Number(r.unitCost || 0),
      })),
    [rows]
  );

  const saveLines = async () => {
    if (!purchaseId) return;
    await updateDoc(doc(db, "purchases", purchaseId), {
      items: rowsPayload,
      total: rowsPayload.reduce((s, i) => s + i.totalCost, 0),
      updatedAt: serverTimestamp(),
    });
  };

  const saveMeta = async () => {
    if (!purchaseId || !isMetaDirty) return;
    await updateDoc(doc(db, "purchases", purchaseId), {
      supplier: supplierDraft || null,
      notes: notesDraft || null,
      updatedAt: serverTimestamp(),
    });
  };

  const saveAllIfDirty = async () => {
    if (isMetaDirty) await saveMeta();
    if (isLinesDirty) await saveLines();
  };

  const markAsOrdered = async () => {
    if (!purchase || !purchaseId) return;
    if (purchase.status !== "draft") return;
    try {
      setBusy(true);
      await saveAllIfDirty();
      await markPurchaseOrdered(db, purchaseId);
      alert("Orden marcada como 'ordered'.");
    } catch (e: any) {
      alert(`No se pudo actualizar: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const onReceive = async () => {
    if (!purchase || !purchaseId) return;
    if (!rows.length) return alert("No hay ítems.");
    if (!confirm("¿Confirmar recepción? Esto afectará el inventario.")) return;

    // Guardrail: mínimo de caja si se paga en efectivo
    if (payFromCash > 0 && willViolateMinCash(expectedCash, "out", payFromCash, MIN_DRAWER_CASH)) {
      const ok = confirm(
        `⚠️ Este pago en efectivo dejaría la caja por debajo del mínimo (${MIN_DRAWER_CASH.toLocaleString()}). ¿Continuar de todas formas?`
      );
      if (!ok) return;
    }

    try {
      setBusy(true);
      await saveAllIfDirty();
      await receivePurchase(
        db,
        purchaseId,
        rows.map((r) => ({
          ingredientId: r.ingredientId,
          qty: Number(r.qty || 0),
          unitCost: Number(r.unitCost || 0),
        })),
        {
          payFromCash: Math.max(0, Number(payFromCash || 0)),
          userId: user?.uid ?? null,
        }
      );
      alert("Compra recibida. Inventario actualizado.");
      navigate("/compras");
    } catch (e: any) {
      alert(`No se pudo recibir: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-4">Cargando...</div>;
  if (!purchase) return <div className="p-4">Compra no encontrada.</div>;

  const shareTextContent = formatPurchaseAsText(purchase, rows);
  const disabledByStatus = purchase.status === "received";

  return (
    <div className="container-app space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Compra #{purchase.id}</h1>
          <div className="text-slate-600 text-sm flex flex-wrap gap-2 items-center">
            <StatusBadge status={purchase.status} />
            <span className="hidden md:inline">·</span>
            <span className="text-slate-500">
              Subtotal actual: <b>{currency(subtotal)}</b>
            </span>
            {(isLinesDirty || isMetaDirty) && (
              <span className="text-amber-600">(cambios sin guardar)</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="dropdown">
            <button className="btn">Exportar</button>
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={() => shareText(shareTextContent)}>
                WhatsApp / Compartir
              </button>
              <button className="dropdown-item" onClick={() => copyToClipboard(shareTextContent)}>
                Copiar texto
              </button>
              <button className="dropdown-item" onClick={() => printRows(purchase, rows)}>
                Imprimir / PDF
              </button>
            </div>
          </div>

          <button className="btn" onClick={() => navigate(-1)}>
            Volver
          </button>
          <button
            className="btn"
            onClick={markAsOrdered}
            disabled={!canOperate || purchase.status !== "draft" || busy || disabledByStatus}
            title={
              purchase.status !== "draft"
                ? "Sólo se puede marcar 'ordered' desde 'draft'"
                : "Marcar como ordenada"
            }
          >
            Marcar ordenada
          </button>
          <button
            className="btn btn-primary"
            onClick={onReceive}
            disabled={!canOperate || busy || rows.length === 0 || disabledByStatus}
            title="Recibir y actualizar inventario (con opción de pago en efectivo)"
          >
            {busy ? "Procesando..." : "Recibir compra"}
          </button>
        </div>
      </div>

      {/* Meta: proveedor y notas */}
      <div className={`rounded-2xl border bg-white p-4 ${disabledByStatus ? "opacity-75" : ""}`}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="label">Proveedor</div>
            <input
              className="input w-full"
              value={supplierDraft}
              onChange={(e) => setSupplierDraft(e.target.value)}
              placeholder="Nombre del proveedor"
              disabled={!canOperate || disabledByStatus}
            />
          </div>
          <div className="md:col-span-2">
            <div className="label">Notas</div>
            <textarea
              className="input w-full h-[72px]"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Observaciones de la orden"
              disabled={!canOperate || disabledByStatus}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button className="btn" onClick={resetChanges} disabled={!canOperate || (!isLinesDirty && !isMetaDirty)}>
            Deshacer cambios
          </button>
          <button
            className="btn"
            onClick={saveMeta}
            disabled={!canOperate || !isMetaDirty || disabledByStatus || busy}
          >
            Guardar encabezado
          </button>
        </div>
      </div>

      {/* Pago en efectivo (opcional) */}
      <div className="rounded-2xl border bg-white p-4 max-w-xl space-y-2">
        <div className="text-sm text-slate-600">Pago en efectivo al recibir (opcional)</div>
        <input
          type="number"
          min={0}
          className="w-full input"
          value={Number(payFromCash || 0)}
          onChange={(e) => setPayFromCash(Number(e.target.value || 0))}
          placeholder="0"
          disabled={!canOperate || disabledByStatus}
        />
        <div className="text-xs text-slate-500">
          Efectivo esperado actual: <b>{currency(expectedCash)}</b>. Mínimo de caja: <b>{currency(MIN_DRAWER_CASH)}</b>.
        </div>
      </div>

      {/* Tabla editable */}
      <div className={`rounded-2xl border bg-white overflow-auto ${disabledByStatus ? "opacity-75" : ""}`}>
        <table className="table min-w-[980px]">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Unidad</th>
              <th className="w-36">Cant.</th>
              <th className="w-40">Costo/u</th>
              <th className="w-40">Costo línea</th>
              <th className="w-28">Δ</th>
              <th className="w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const deltaQty = Number(r.qty) - Number(r.original?.qty ?? r.qty);
              const deltaCpu = Number(r.unitCost) - Number(r.original?.unitCost ?? r.unitCost);
              const showDelta = deltaQty !== 0 || deltaCpu !== 0;
              return (
                <tr key={r.ingredientId} className={showDelta ? "bg-amber-50/40" : ""}>
                  <td className="px-3 py-2 font-medium">{fixText(r.name)}</td>
                  <td className="px-3 py-2">{r.unit || ""}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-28"
                      type="number"
                      min={0}
                      step={r.unit === "u" ? 1 : 0.01}
                      disabled={!canOperate || busy || disabledByStatus}
                      value={String(r.qty)}
                      onChange={(e) => updateRow(idx, { qty: Number(e.target.value || 0) })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-32"
                      type="number"
                      min={0}
                      step={0.01}
                      disabled={!canOperate || busy || disabledByStatus}
                      value={String(r.unitCost)}
                      onChange={(e) => updateRow(idx, { unitCost: Number(e.target.value || 0) })}
                    />
                  </td>
                  <td className="px-3 py-2">{currency(r.totalCost || 0)}</td>
                  <td className="px-3 py-2 text-xs">
                    {showDelta ? (
                      <div className="space-y-0.5">
                        {deltaQty !== 0 ? (
                          <div className={deltaQty > 0 ? "text-blue-700" : "text-rose-700"}>
                            qty: {deltaQty > 0 ? "+" : ""}{deltaQty}
                          </div>
                        ) : null}
                        {deltaCpu !== 0 ? (
                          <div className={deltaCpu > 0 ? "text-blue-700" : "text-rose-700"}>
                            cpu: {deltaCpu > 0 ? "+" : ""}{deltaCpu.toFixed(2)}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeRow(idx)}
                      disabled={!canOperate || busy || disabledByStatus}
                      title="Eliminar línea"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                  Sin líneas en esta orden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totales / acciones */}
      <div className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-slate-600">
          {rows.length} líneas · Subtotal{" "}
          <span className="font-semibold">{currency(subtotal)}</span>
          {(isLinesDirty || isMetaDirty) && (
            <span className="ml-2 text-amber-600">(cambios sin guardar)</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button
            className="btn"
            disabled={!canOperate || (!isLinesDirty && !isMetaDirty) || busy || disabledByStatus}
            onClick={saveAllIfDirty}
            title="Guardar encabezado y líneas"
          >
            Guardar cambios
          </button>
          <button
            className="btn"
            onClick={markAsOrdered}
            disabled={!canOperate || (purchase?.status !== "draft") || busy || disabledByStatus}
          >
            Marcar ordenada
          </button>
          <button
            className="btn btn-primary"
            onClick={onReceive}
            disabled={!canOperate || busy || rows.length === 0 || disabledByStatus}
            title="Recibir y actualizar inventario (con opción de pago en efectivo)"
          >
            {busy ? "Procesando..." : "Recibir compra"}
          </button>
        </div>
      </div>
    </div>
  );
}

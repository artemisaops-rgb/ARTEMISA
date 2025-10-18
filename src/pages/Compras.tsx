// src/pages/Compras.tsx
// Reabastecer manual + Lista de órdenes de compra
// Ahora con confirmación explícita y previsualización. Kardex: type:"in", reason:"manual".

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  runTransaction,
  where,
  Timestamp,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import {
  createPurchaseOrder,
  markPurchaseOrdered,
  type PurchaseDoc,
  type PurchaseStatus,
} from "@/lib/purchases";

type Inv = {
  id: string;
  name?: string;
  unit?: string;
  stock?: number;
  min?: number;        // compat legacy
  minStock?: number;   // preferido
  targetStock?: number;
};

// ==== Utils ====

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

// Fecha local YYYY-MM-DD en America/Bogota
const toDateKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

// Mostrar Timestamp de Firestore en zona Bogotá
function tsToBogota(ts?: Timestamp | null): string {
  if (!ts) return "-";
  const d = ts.toDate();
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ===== Export helpers (texto / impresión / whatsapp) =====

function formatPurchaseText(p: PurchaseDoc) {
  const header = `🧾 Orden de compra — ${p.id}\n${toDateKey()}\nEstado: ${p.status}\nProveedor: ${p.supplier ?? "-"}\n`;
  const body =
    (p.items || []).length === 0
      ? "• (Sin líneas)"
      : p.items
          .map((l) => `• ${fixText(l.name)} — ${Number(l.qty).toLocaleString()} ${l.unit ?? ""}`)
          .join("\n");
  const total = `\n\nTotal estimado: $${Number(p.total || 0).toLocaleString()}`;
  return `${header}\n${body}${total}`;
}

async function shareText(text: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title: "Lista de compras", text });
      return;
    }
  } catch {
    // fallback a WA
  }
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copiado al portapapeles ✅");
  } catch {
    alert("No se pudo copiar, intenta manualmente.");
  }
}

function printPurchase(p: PurchaseDoc) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows =
    (p.items || []).length === 0
      ? `<tr><td colspan="3" class="empty">Sin líneas</td></tr>`
      : p.items
          .map(
            (l, i) => `<tr>
      <td class="idx">${i + 1}</td>
      <td class="name">${fixText(l.name)}</td>
      <td class="qty">${Number(l.qty).toLocaleString()} ${l.unit ?? ""}</td>
    </tr>`
          )
          .join("");
  w.document.write(`
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Orden ${p.id}</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 24px; }
        h1 { font-size: 18px; margin: 0 0 10px; }
        .muted { color:#64748b; margin-bottom: 16px; }
        table { width:100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align:left; }
        .idx { width: 40px; text-align: center; }
        .qty { width: 200px; text-align:right; }
        .empty { text-align:center; color:#64748b; }
        @media print { .print-hint { display:none; } }
      </style>
    </head>
    <body>
      <h1>Orden de compra — ${p.id}</h1>
      <div class="muted">Estado: ${p.status} · ${toDateKey()}</div>
      <table>
        <thead><tr><th>#</th><th>Ítem</th><th>Cantidad</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="print-hint">Sugerencia: Archivo → Imprimir → Guardar como PDF.</p>
    </body>
  </html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ====== Página ======

export default function Compras() {
  const orgId = getOrgId();
  const navigate = useNavigate();

  // Reabastecer manual (sólo ítems bajos)
  const [items, setItems] = useState<Inv[]>([]);
  const [restockAmounts, setRestockAmounts] = useState<Record<string, number>>({});

  // Órdenes de compra
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "all">("all");

  // Errores de permisos (para banners)
  const [permErrorInv, setPermErrorInv] = useState<string | null>(null);
  const [permErrorPurch, setPermErrorPurch] = useState<string | null>(null);

  // Confirmaciones
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAck, setConfirmAck] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"one" | "all">("one");
  const [confirmTarget, setConfirmTarget] = useState<Inv | null>(null);
  const [confirmQty, setConfirmQty] = useState<number>(0);

  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { uiRole } = usePreviewRole();
  const ownerMonitor = realRole === "owner" && (uiRole == null || uiRole === "owner");

  // === Inventario bajo (para reabastecer manual) ===
  useEffect(() => {
    const qy = query(collection(db, "inventoryItems"), where("orgId", "==", orgId));
    const unsub = onSnapshot(
      qy,
      (snapshot) => {
        const list: Inv[] = [];
        snapshot.forEach((d) => {
          const x = d.data() as any;
          const stock = Number(x.stock) || 0;
          const min =
            x.minStock != null ? Number(x.minStock) :
            x.min != null ? Number(x.min) : undefined;

          const target =
            x.targetStock == null || Number(x.targetStock) <= 0
              ? min != null ? Math.max(min * 2, 0) : undefined
              : Number(x.targetStock);

          if (min !== undefined && stock <= min) {
            list.push({
              id: d.id,
              name: x.name,
              stock,
              unit: x.unit || "g",
              min,
              minStock: x.minStock,
              targetStock: target,
            });
          }
        });
        setItems(list);
        setPermErrorInv(null);
      },
      (err) => {
        console.error("Compras: error inventario", err);
        setPermErrorInv(err?.message || "Missing or insufficient permissions");
        setItems([]); // limpiamos para no mostrar basura
      }
    );
    return () => unsub();
  }, [orgId]);

  const suggestions = useMemo(() => {
    return items.map((it) => {
      const target = Number(it.targetStock ?? 0);
      const cur = Number(it.stock ?? 0);
      const toBuy = Math.max(target - cur, 0);
      return { ...it, suggested: toBuy };
    });
  }, [items]);

  // === Órdenes de compra (lista) ===
  useEffect(() => {
    const qy = query(
      collection(db, "purchases"),
      where("orgId", "==", orgId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: PurchaseDoc[] = snap.docs.map((d) => d.data() as any as PurchaseDoc);
        setPurchases(list);
        setPermErrorPurch(null);
      },
      (err) => {
        console.error("Compras: error purchases", err);
        setPermErrorPurch(err?.message || "Missing or insufficient permissions");
        setPurchases([]);
      }
    );
    return () => unsub();
  }, [orgId]);

  const filteredPurchases = useMemo(
    () => purchases.filter((p) => (statusFilter === "all" ? true : p.status === statusFilter)),
    [purchases, statusFilter]
  );

  const todayKey = toDateKey();
  const todayOrder = useMemo(
    () => purchases.find((p) => (p as any).dateKey === todayKey),
    [purchases, todayKey]
  );

  // === Reabastecer (manual) ===

  const handleAmountChange = (id: string, value: string) =>
    setRestockAmounts((prev) => ({ ...prev, [id]: Math.max(0, Number(value || 0)) }));

  const handleUseSuggestion = (id: string, suggested: number) =>
    setRestockAmounts((p) => ({ ...p, [id]: suggested }));

  // --- Transacción real (1 ítem) ---
  const restockOneTx = async (item: Inv, amount: number) => {
    const itemRef = doc(db, "inventoryItems", item.id);
    const moveRef = doc(collection(db, "stockMovements"));

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error("Ítem no existe.");
      const cur = Number(snap.data()?.stock || 0);
      const next = cur + amount; // entrada
      if (next < 0) throw new Error("Cantidad inválida.");

      tx.update(itemRef, { stock: next, updatedAt: serverTimestamp() });

      // Kardex alineado a rules (modelo nuevo)
      tx.set(moveRef, {
        id: moveRef.id,
        orgId,
        dateKey: toDateKey(),
        at: serverTimestamp(),
        type: "in",               // entrada manual
        ingredientId: item.id,
        qty: amount,              // SIEMPRE positiva
        reason: "manual",         // permitido por rules
        metaReason: "restock",    // informativo
        itemName: item.name ?? item.id,
        unit: item.unit || "g",
        userId: user?.uid ?? null,
      });
    });
  };

  // Abrir modal para 1 ítem
  const openConfirmOne = (it: Inv) => {
    if (ownerMonitor) return alert("Activa 'Worker' para reabastecer.");
    const qty = Math.max(0, Number(restockAmounts[it.id] ?? 0));
    if (qty <= 0) return alert("Ingresa una cantidad válida para reabastecer.");
    setConfirmMode("one");
    setConfirmTarget(it);
    setConfirmQty(qty);
    setConfirmAck(false);
    setConfirmOpen(true);
  };

  // Abrir modal para todos
  const openConfirmAll = () => {
    if (ownerMonitor) return;
    const pending = suggestions.filter((s: any) => s.suggested > 0);
    if (!pending.length) return alert("No hay cantidades sugeridas para reabastecer.");
    setConfirmMode("all");
    setConfirmTarget(null);
    setConfirmQty(0);
    setConfirmAck(false);
    setConfirmOpen(true);
  };

  // Ejecutar tras confirmar
  const doConfirmedAction = async () => {
    if (!confirmAck) return;

    if (confirmMode === "one" && confirmTarget) {
      try {
        await restockOneTx(confirmTarget, confirmQty);
        setRestockAmounts((prev) => ({ ...prev, [confirmTarget.id]: 0 }));
      } catch (e: any) {
        alert(`Error al reabastecer ${fixText(confirmTarget.name) || confirmTarget.id}: ${e?.message || e}`);
      }
    } else if (confirmMode === "all") {
      const pending = suggestions.filter((s: any) => s.suggested > 0);
      try {
        for (const it of pending) {
          await restockOneTx(it, it.suggested);
        }
        alert("Reabastecimiento sugerido completado ✅");
      } catch (e: any) {
        alert(`Error al reabastecer: ${e?.message || e}`);
      }
    }

    setConfirmOpen(false);
  };

  // === Crear una orden de compra (borrador) desde faltantes sugeridos ===
  const createDraftFromSuggestions = async () => {
    const lines = suggestions
      .filter((s) => s.suggested > 0)
      .map((s) => ({ ingredientId: s.id, qty: s.suggested }));
    if (!lines.length) return alert("No hay faltantes para armar el borrador.");
    try {
      const pid = await createPurchaseOrder(db, lines, { status: "draft" });
      alert(`Borrador de compra creado: ${pid}`);
      navigate(`/compras/${pid}`);
    } catch (e: any) {
      alert(`No se pudo crear el borrador: ${e?.message || e}`);
    }
  };

  // === Orden de HOY (auto / idempotente) ===
  const openOrCreateToday = async () => {
    if (ownerMonitor) return;
    if (todayOrder) {
      navigate(`/compras/${todayOrder.id}`);
      return;
    }
    const lines = suggestions
      .filter((s) => s.suggested > 0)
      .map((s) => ({ ingredientId: s.id, qty: s.suggested }));
    if (!lines.length) {
      alert("Hoy no hay faltantes para crear una orden.");
      return;
    }
    try {
      const pid = await createPurchaseOrder(db, lines, { status: "draft", dateKey: todayKey });
      navigate(`/compras/${pid}`);
    } catch (e: any) {
      alert(`No se pudo abrir/crear la orden de hoy: ${e?.message || e}`);
    }
  };

  // === Acciones sobre cada purchase ===
  const handleMarkOrdered = async (p: PurchaseDoc) => {
    if (ownerMonitor) return;
    try {
      await markPurchaseOrdered(db, p.id);
    } catch (e: any) {
      alert(`No se pudo marcar como ordered: ${e?.message || e}`);
    }
  };

  const exportPurchase = async (p: PurchaseDoc, mode: "wa" | "copy" | "print") => {
    const text = formatPurchaseText(p);
    if (mode === "wa") return shareText(text);
    if (mode === "copy") return copyToClipboard(text);
    if (mode === "print") return printPurchase(p);
  };

  const StatusBadge = ({ status }: { status: PurchaseStatus }) => {
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

  // Helpers preview modal
  const totalSuggested = useMemo(() => {
    const pending = suggestions.filter((s: any) => s.suggested > 0);
    const units = pending.reduce((s: number, a: any) => s + Number(a.suggested || 0), 0);
    return { count: pending.length, units };
  }, [suggestions]);

  return (
    <div className="container-app space-y-6">
      {/* ===== Reabastecer manual ===== */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Compras</h1>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={openConfirmAll}
            disabled={ownerMonitor || suggestions.every((s: any) => s.suggested <= 0)}
            title="Moverá stock en Bodega y registrará en Kardex (requiere confirmación)"
          >
            Ajustar stock (sugerido)
          </button>
          <button
            className="btn"
            onClick={openOrCreateToday}
            disabled={ownerMonitor}
            title={todayOrder ? "Abrir orden de hoy" : "Crear orden de hoy (auto, no mueve stock)"}
          >
            {todayOrder ? "Abrir orden de hoy" : "Orden de hoy (auto)"}
          </button>
          <button
            className="btn btn-primary"
            onClick={createDraftFromSuggestions}
            disabled={ownerMonitor || suggestions.every((s: any) => s.suggested <= 0)}
            title="Crea un borrador de orden con los faltantes (no mueve stock)"
          >
            Generar orden (borrador)
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-3 text-sm text-slate-700">
        <b>Nota:</b> Los botones de <b>Reabastecer/Ajustar stock</b> <u>modifican el stock de Bodega</u> y crean un
        registro en el <b>Kardex</b>. Si sólo quieres la lista para comprar, usa <b>Generar orden (borrador)</b>.
      </div>

      {ownerMonitor && (
        <div className="rounded-2xl border bg-amber-50 text-amber-800 p-3">
          Estás en <b>modo Owner (monitor)</b>. Las acciones están deshabilitadas.
        </div>
      )}

      {permErrorInv && (
        <div className="rounded-2xl border bg-rose-50 text-rose-700 p-3">
          No se pudo leer <b>inventario</b> (permission-denied). Verifica que el usuario esté
          <b> agregado a la organización</b> y que los <b>docs tengan orgId</b>. Detalle: {permErrorInv}
        </div>
      )}

      {permErrorPurch && (
        <div className="rounded-2xl border bg-rose-50 text-rose-700 p-3">
          No se pudo leer <b>purchases</b> (permission-denied). Revisa reglas y orgId. Detalle: {permErrorPurch}
        </div>
      )}

      {/* Tarjeta orden de hoy si existe */}
      {todayOrder && (
        <div className="rounded-2xl border bg-white p-3 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">Orden de hoy:</span>{" "}
            <span className="font-mono">{todayOrder.id}</span>{" "}
            <span className="ml-2 align-middle">
              <StatusBadge status={todayOrder.status} />
            </span>
          </div>
          <div className="flex gap-2">
            <Link className="btn btn-sm" to={`/compras/${todayOrder.id}`}>Abrir</Link>
          </div>
        </div>
      )}

      {/* Tarjetas de inventario bajo */}
      <section className="space-y-2">
        <div className="font-semibold">Ajustes rápidos de bodega</div>
        {suggestions.length === 0 ? (
          <p className="text-slate-500">No hay insumos por debajo del mínimo.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((it: any) => {
              const val = restockAmounts[it.id] ?? it.suggested ?? 0;
              return (
                <li
                  key={it.id}
                  className="bg-white border rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{fixText(it.name) || it.id}</div>
                    <div className="text-sm text-slate-600">
                      Stock: {Number(it.stock ?? 0).toLocaleString()} {it.unit || ""} · Mín:{" "}
                      {Number(it.min ?? 0).toLocaleString()} · Objetivo:{" "}
                      {Number(it.targetStock ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${ownerMonitor ? "opacity-60 pointer-events-none" : ""}`}>
                    <input
                      type="number"
                      className="w-24 border rounded-lg px-2 py-1"
                      value={val || ""}
                      min={0}
                      onChange={(e) => handleAmountChange(it.id, e.target.value)}
                    />
                    <button
                      className="px-2 py-1 rounded-lg border"
                      onClick={() => handleUseSuggestion(it.id, it.suggested || 0)}
                      title="Usar sugerido hasta objetivo"
                    >
                      Sugerido
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg bg-[var(--brand,#d4af37)] text-[var(--blue-deep,#0f2a47)] disabled:opacity-60"
                      onClick={() => openConfirmOne(it)}
                      disabled={ownerMonitor || (restockAmounts[it.id] ?? 0) <= 0}
                      title="Moverá stock en Bodega y registrará en Kardex (requiere confirmación)"
                    >
                      Reabastecer
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== Lista de órdenes de compra ===== */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Órdenes</div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Estado</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">Todos</option>
              <option value="draft">draft</option>
              <option value="ordered">ordered</option>
              <option value="received">received</option>
              <option value="canceled">canceled</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-auto">
          <table className="table min-w-[980px]">
            <thead>
              <tr>
                <th>ID</th>
                <th>Estado</th>
                <th>Proveedor</th>
                <th>Creada</th>
                <th>Items</th>
                <th>Total</th>
                <th className="w-64">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                    Sin órdenes con el filtro actual.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => {
                  const lines = (p.items || []).length;
                  const isToday = (p as any).dateKey === todayKey;
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.id}{" "}
                        {isToday && (
                          <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] align-middle">
                            hoy
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                      <td className="px-3 py-2">{p.supplier ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">{tsToBogota((p as any).createdAt as Timestamp)}</td>
                      <td className="px-3 py-2">{lines}</td>
                      <td className="px-3 py-2">${Number(p.total || 0).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className={"flex flex-wrap gap-2 " + (ownerMonitor ? "opacity-60 pointer-events-none" : "")}>
                          <Link className="btn btn-sm" to={`/compras/${p.id}`}>Abrir</Link>
                          <div className="dropdown">
                            <button className="btn btn-sm">Exportar</button>
                            <div className="dropdown-menu">
                              <button className="dropdown-item" onClick={() => exportPurchase(p, "wa")}>
                                WhatsApp / Compartir
                              </button>
                              <button className="dropdown-item" onClick={() => exportPurchase(p, "copy")}>
                                Copiar texto
                              </button>
                              <button className="dropdown-item" onClick={() => exportPurchase(p, "print")}>
                                Imprimir / PDF
                              </button>
                            </div>
                          </div>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleMarkOrdered(p)}
                            disabled={p.status !== "draft" || ownerMonitor}
                            title={p.status !== "draft" ? "Sólo desde draft" : "Marcar como ordered"}
                          >
                            Marcar ordenada
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Modal de confirmación de reabastecimiento ===== */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && setConfirmOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg space-y-3">
            <div className="text-lg font-semibold">
              {confirmMode === "one" ? "Confirmar REABASTECER" : "Confirmar AJUSTE DE STOCK (sugerido)"}
            </div>

            {confirmMode === "one" && confirmTarget && (
              <div className="text-sm text-slate-700 space-y-2">
                <div>
                  Ítem: <b>{fixText(confirmTarget.name) || confirmTarget.id}</b> · Unidad: {confirmTarget.unit || "g"}
                </div>
                <div className="font-mono">
                  {Number(confirmTarget.stock || 0).toLocaleString()} {confirmTarget.unit || "g"} {" + "}
                  {confirmQty.toLocaleString()} {confirmTarget.unit || "g"} {" = "}
                  <b>{(Number(confirmTarget.stock || 0) + confirmQty).toLocaleString()} {confirmTarget.unit || "g"}</b>
                </div>
              </div>
            )}

            {confirmMode === "all" && (
              <div className="text-sm text-slate-700">
                Se ajustará el stock de <b>{totalSuggested.count}</b> ítem(s) por un total de{" "}
                <b>{totalSuggested.units.toLocaleString()}</b> unidades (sumadas). Este proceso es ítem por ítem.
              </div>
            )}

            <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-2">
              Esta acción <b>modifica el stock de Bodega</b> y genera un registro en el <b>Kardex</b>.
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmAck}
                onChange={(e) => setConfirmAck(e.target.checked)}
                className="accent-current"
              />
              Entiendo y deseo continuar.
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={doConfirmedAction}
                disabled={!confirmAck}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

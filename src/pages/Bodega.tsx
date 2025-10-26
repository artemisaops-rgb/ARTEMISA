// src/pages/Bodega.tsx
import { useEffect, useMemo, useState, useCallback, useRef, type FormEvent, type ReactNode } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  orderBy,
  query as fsQuery,
  serverTimestamp,
  runTransaction,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { upsertDraftForToday } from "@/lib/purchases";
import { scrub, safeNumber } from "@/utils/firestoreSafe";

/** ===== Tipos ===== */
type Unit = "g" | "ml" | "u";
type Frequency = "daily" | "weekly" | "monthly";
type Kind = "consumable" | "equipment";
type Category =
  | "comida"
  | "bebidas"
  | "aseo"
  | "maquinaria"
  | "desechables"
  | "otros";

const CATEGORIES: Category[] = [
  "comida",
  "bebidas",
  "aseo",
  "maquinaria",
  "desechables",
  "otros",
];

type Item = {
  id: string;
  name: string;
  unit: Unit | string;
  stock: number;
  minStock: number;
  targetStock?: number | null;
  costPerUnit: number;
  supplier?: string;
  provider?: string;
  frequency?: Frequency;
  periodicity?: "daily" | "monthly" | "weekly";
  kind?: Kind;
  category?: Category;
  packSize?: number | null;
  packLabel?: string | null;
};

type SeedRow = {
  name: string;
  unit: Unit | string;
  minStock: number;
  targetStock?: number | null;
  costPerUnit: number;
  supplier?: string;
  category?: Category;
  packSize?: number | null;
  packLabel?: string | null;
};

/** ====== NUEVO: tipos helpers masivos ====== */
type BulkScope = { type: "all" } | { type: "category"; category: Category };

type BulkResult = {
  updated?: number;
  deleted?: number;
  movements: number;
  errors: number;
};

const makeSeedRow = (over: Partial<SeedRow> = {}): SeedRow => ({
  name: "",
  unit: "g",
  minStock: 0,
  targetStock: null,
  costPerUnit: 0,
  supplier: "",
  category: "otros" as Category,
  packSize: null,
  packLabel: "",
  ...over,
});

const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
};

type SortKey = "name" | "stock" | "minStock" | "costPerUnit" | "par" | "faltan";

/** ===== Utilidades ===== */

// YYYY-MM-DD en America/Bogota
const dateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}
function currency(n: number) {
  return `$${Number(n || 0).toLocaleString()}`;
}

function formatLinesAsText(
  lines: { name: string; qty: number; unit: string }[],
  title: string
) {
  const d = dateKey();
  const body =
    lines.length === 0
      ? "• (Sin faltantes)"
      : lines.map((l) => `• ${fixText(l.name)} — ${l.qty} ${l.unit}`).join("\n");
  return `🧾 Lista de compras — ${title}\n${d}\n\n${body}`;
}

async function shareText(text: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title: "Lista de compras", text });
      return;
    }
  } catch {}
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
function printLines(
  lines: { name: string; qty: number; unit: string }[],
  title: string
) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows =
    lines.length === 0
      ? `<tr><td colspan="3" class="empty">Sin faltantes</td></tr>`
      : lines
          .map(
            (l, i) => `<tr>
          <td class="idx">${i + 1}</td>
          <td class="name">${fixText(l.name)}</td>
          <td class="qty">${l.qty} ${l.unit}</td>
        </tr>`
          )
          .join("");
  w.document.write(`<html><head><meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:24px}
      h1{font-size:18px;margin:0 0 10px}.muted{color:#64748b;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
      .idx{width:40px;text-align:center}.qty{width:160px;text-align:right}.empty{text-align:center;color:#64748b}
      @media print{.print-hint{display:none}}
    </style></head>
    <body>
      <h1>Lista de compras — ${title}</h1>
      <div class="muted">${dateKey()}</div>
      <table><thead><tr><th>#</th><th>Ítem</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="print-hint">Sugerencia: Archivo → Imprimir → Guardar como PDF.</p>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

async function confirmDanger(opts: {
  title: string;
  message: string;
  type: "wipe" | "delete";
  requireText?: "BORRAR";
}): Promise<boolean> {
  if (opts.type === "delete" && opts.requireText === "BORRAR") {
    const v = prompt(
      `${opts.title}\n\n${opts.message}\n\nEscribe BORRAR para confirmar:`
    );
    return v?.trim?.().toUpperCase() === "BORRAR";
  }
  return confirm(`${opts.title}\n\n${opts.message}`);
}

/** ======= Página ======= */
export default function Bodega() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  const [filterKind, setFilterKind] = useState<Kind | "all">("all");
  const [filterFreq, setFilterFreq] = useState<Frequency | "all">("all");
  const [onlyMissing, setOnlyMissing] = useState<boolean>(false);

  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});

  // NUEVO: modal de edición
  const [editOpen, setEditOpen] = useState(false);
  const openEdit = (row: Item) => {
    if (ownerMonitor) return alert("Activa “Worker” para editar.");
    setEditingId(row.id);
    setDraft({ ...row });
    setEditOpen(true);
  };

  const [showNew, setShowNew] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedRows, setSeedRows] = useState<SeedRow[]>([makeSeedRow()]);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState<"in" | "out">("in");
  const [moveQty, setMoveQty] = useState<number>(0);
  const [moveReason, setMoveReason] = useState<string>("");
  const [moveItem, setMoveItem] = useState<Item | null>(null);
  const [moveAck, setMoveAck] = useState<boolean>(false);
  const [movePacks, setMovePacks] = useState<number>(0);

  const [packOpen, setPackOpen] = useState(false);
  const [packItem, setPackItem] = useState<Item | null>(null);
  const [packSizeDraft, setPackSizeDraft] = useState<number | null>(null);
  const [packLabelDraft, setPackLabelDraft] = useState("");

  const [viewMode, setViewMode] = useState<"table" | "sections">("sections");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ===== Apariencia (movida a modal ⚙️) =====
  type ColPrefs = {
    showPack: boolean;
    showSupplier: boolean;
    showCost: boolean;
    showFreq: boolean;
  };
  const [colPrefs, setColPrefs] = useState<ColPrefs>(() => {
    try {
      const raw = localStorage.getItem("bodega:pref:cols");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { showPack: false, showSupplier: false, showCost: false, showFreq: false }; // minimal
  });
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bodega:pref:compact") === "1";
    } catch {
      return true;
    }
  });
  const [advanced, setAdvanced] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bodega:pref:advanced") === "1";
    } catch {
      return false;
    }
  });
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("bodega:filtersOpen");
      if (v != null) return v === "1";
      if (typeof window !== "undefined")
        return !window.matchMedia("(max-width: 768px)").matches;
    } catch {}
    return true;
  });
  const [optsOpen, setOptsOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem("bodega:pref:cols", JSON.stringify(colPrefs));
    } catch {}
  }, [colPrefs]);
  useEffect(() => {
    try {
      localStorage.setItem("bodega:pref:compact", compact ? "1" : "0");
    } catch {}
  }, [compact]);
  useEffect(() => {
    try {
      localStorage.setItem("bodega:pref:advanced", advanced ? "1" : "0");
    } catch {}
  }, [advanced]);
  useEffect(() => {
    try {
      localStorage.setItem("bodega:filtersOpen", filtersOpen ? "1" : "0");
    } catch {}
  }, [filtersOpen]);

  // Orden de hoy (auto)
  const [todayPurchaseId, setTodayPurchaseId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  // NUEVO: banner de permiso denegado (403)
  const [permDenied, setPermDenied] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const handleError = (err: any, { silentAlert = false } = {}) => {
    const code = err?.code || "";
    theMsg: {
      const msg = err?.message || String(err || "");
      const is403 =
        code === "permission-denied" ||
        /permission[-_ ]denied/i.test(msg) ||
        /403/.test(msg);
      if (is403) {
        setPermDenied(true);
        setErrorNote(
          "Permiso denegado por las reglas de seguridad. Si estás en modo Owner, cambia a Worker. Si persiste, revisa reglas y claims."
        );
        if (!silentAlert) console.warn("permission-denied:", err);
        break theMsg;
      }
      setErrorNote(msg);
      if (!silentAlert) alert("No se pudo completar la acción.\n\n" + msg);
      console.error(err);
    }
  };

  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { uiRole } = usePreviewRole();
  const ownerMonitor =
    realRole === "owner" && (uiRole == null || uiRole === "owner");

  /** ===== Carga inventario ===== */
  useEffect(() => {
    const orgId = getOrgId();
    const qy = fsQuery(
      collection(db, "inventoryItems"),
      where("orgId", "==", orgId),
      orderBy("name")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: Item[] = snap.docs.map((d) => {
          const x: any = d.data();
          const frequency: Frequency =
            (x.frequency as Frequency) ||
            (x.periodicity as Frequency) ||
            "daily";
          const kind: Kind = (x.kind as Kind) || "consumable";
          const unit: Unit | string = (x.unit as Unit) || "g";
          const stock = Number(x.stock) || 0;
          const minStock = Number(x.minStock) || 0;
          const targetStock =
            x.targetStock === null || x.targetStock === undefined
              ? null
              : Number(x.targetStock);
          const costPerUnit = Number(x.costPerUnit) || 0;
          const supplier = String(x.supplier ?? x.provider ?? "");

          const rawCat = String(x.category ?? "otros");
          const category: Category = (CATEGORIES as string[]).includes(rawCat)
            ? (rawCat as Category)
            : "otros";

          const packSize = x.packSize == null ? null : Number(x.packSize);
          const packLabel = x.packLabel == null ? null : String(x.packLabel);
          return {
            id: d.id,
            name: String(x.name ?? ""),
            unit,
            stock,
            minStock,
            targetStock,
            costPerUnit,
            supplier,
            provider: x.provider,
            periodicity: x.periodicity,
            frequency,
            kind,
            category,
            packSize,
            packLabel,
          };
        });
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  /** ===== Suscripción: Orden de hoy (sólo draft) ===== */
  useEffect(() => {
    const orgId = getOrgId();
    const today = dateKey();
    const qy = fsQuery(
      collection(db, "purchases"),
      where("orgId", "==", orgId),
      where("status", "==", "draft"),
      where("dateKey", "==", today),
      limit(1)
    );
    const unsub = onSnapshot(qy, (snap) => {
      if (!snap.empty) setTodayPurchaseId(snap.docs[0].id);
      else setTodayPurchaseId(null);
    });
    return () => unsub();
  }, []);

  /** ===== Edición ===== */
  const startEdit = (row: Item) => {
    if (ownerMonitor) return;
    setEditingId(row.id);
    setDraft({ ...row });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (ownerMonitor)
      return alert("Activa “Worker” en el conmutador para editar.");
    const nm = String((draft as any).name || "").trim();
    if (!nm) return alert("Nombre requerido.");

    const parsedTarget =
      draft.targetStock == null || Number(draft.targetStock) <= 0
        ? null
        : Math.max(0, Number(draft.targetStock));

    const payload = scrub({
      name: nm,
      unit: (draft.unit as Unit) || "g",
      stock: Math.max(0, safeNumber(draft.stock, 0)),
      minStock: Math.max(0, safeNumber(draft.minStock, 0)),
      targetStock: parsedTarget,
      costPerUnit: Math.max(0, safeNumber(draft.costPerUnit, 0)),
      supplier: String(draft.supplier ?? draft.provider ?? ""),
      provider: String(draft.supplier ?? draft.provider ?? ""),
      frequency:
        (draft.frequency as Frequency) ||
        ((draft.periodicity as Frequency) || "daily"),
      periodicity:
        ((draft.frequency as Frequency) || "daily") === "daily"
          ? "daily"
          : ((draft.frequency as Frequency) || "daily") === "monthly"
          ? "monthly"
          : "weekly",
      kind: (draft.kind as Kind) || "consumable",
      category: (draft.category as Category) || "otros",
      packSize: draft.packSize ?? null,
      packLabel: (draft.packLabel?.trim?.() || "") || null,
      updatedAt: serverTimestamp(),
    });
    try {
      await updateDoc(doc(db, "inventoryItems", editingId), payload as any);
      setEditingId(null);
      setDraft({});
    } catch (err: any) {
      handleError(err);
    }
  };

  /** ===== Helpers rápidos ===== */
  const changeCategoryTo = async (row: Item, cat: Category) => {
    if (ownerMonitor) return;
    try {
      await updateDoc(
        doc(db, "inventoryItems", row.id),
        scrub({ category: cat, updatedAt: serverTimestamp() }) as any
      );
    } catch (err) {
      handleError(err);
    }
  };

  const setPackSuggested = async (
    row: Item,
    size: number | null,
    label?: string | null
  ) => {
    if (ownerMonitor) return;
    try {
      await updateDoc(
        doc(db, "inventoryItems", row.id),
        scrub({
          packLabel: (label?.trim?.() || "") || null,
          packSize: size ?? null,
          updatedAt: serverTimestamp(),
        }) as any
      );
    } catch (err) {
      handleError(err);
    }
  };
  const openPackModal = (row: Item) => {
    if (ownerMonitor) return;
    setPackItem(row);
    setPackSizeDraft(row.packSize ?? null);
    setPackLabelDraft(row.packLabel ?? "");
    setPackOpen(true);
  };
  const savePackModal = async () => {
    if (!packItem) return;
    try {
      await updateDoc(
        doc(db, "inventoryItems", packItem.id),
        scrub({
          packSize: packSizeDraft ?? null,
          packLabel: (packLabelDraft?.trim?.() || "") || null,
          updatedAt: serverTimestamp(),
        }) as any
      );
      setPackOpen(false);
      setPackItem(null);
    } catch (err) {
      handleError(err);
    }
  };

  /** ===== Acciones individuales ===== */
  const zeroItem = async (it: Item) => {
    if (ownerMonitor) return alert("Activa “Worker” para editar.");
    const ok = await confirmDanger({
      title: "Vaciar stock de ítem",
      message: `Se pondrá el stock de “${fixText(
        it.name
      )}” en 0 y se registrará salida en Kardex.`,
      type: "wipe",
    });
    if (!ok) return;

    try {
      const user = getAuth().currentUser;
      const itemRef = doc(db, "inventoryItems", it.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        if (!snap.exists()) return;
        const cur = Number(snap.data()?.stock || 0);
        tx.update(
          itemRef,
          scrub({ stock: 0, updatedAt: serverTimestamp() }) as any
        );
        if (cur > 0) {
          const mref = doc(collection(db, "stockMovements"));
          tx.set(
            mref,
            scrub({
              id: mref.id,
              orgId: getOrgId(),
              at: serverTimestamp(),
              dateKey: dateKey(),
              type: "out",
              ingredientId: it.id,
              qty: safeNumber(cur, 0),
              reason: "manual", // <- antes "reset"
              userId: user?.uid || null,
              itemName: it.name,
              unit: String(it.unit || "u"),
            }) as any
          );
        }
      });
    } catch (err) {
      handleError(err);
    }
  };

  const borrar = async (id: string) => {
    if (ownerMonitor)
      return alert("Activa “Worker” en el conmutador para eliminar.");
    const row = items.find((x) => x.id === id);
    if (!row) return;
    const ok = await confirmDanger({
      title: "Borrar ingrediente",
      message: `Eliminarás “${fixText(
        row.name
      )}”. Si tiene stock, se registrará salida en Kardex con reason=delete.`,
      type: "delete",
      requireText: "BORRAR",
    });
    if (!ok) return;

    try {
      const user = getAuth().currentUser;
      const ref = doc(db, "inventoryItems", id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const cur: any = snap.data();
        const stock = Number(cur?.stock || 0);
        if (stock > 0) {
          const mref = doc(collection(db, "stockMovements"));
          tx.set(
            mref,
            scrub({
              id: mref.id,
              orgId: getOrgId(),
              at: serverTimestamp(),
              dateKey: dateKey(),
              type: "out",
              ingredientId: id,
              qty: safeNumber(stock, 0),
              reason: "delete",
              userId: user?.uid || null,
              itemName: String(cur?.name || ""),
              unit: String(cur?.unit || "u"),
            }) as any
          );
        }
        tx.delete(ref);
      });
    } catch (err) {
      handleError(err);
    }
  };

  /** ===== Crear ===== */
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: "",
    unit: "g",
    stock: 0,
    minStock: 0,
    targetStock: undefined,
    costPerUnit: 0,
    supplier: "",
    kind: "consumable",
    frequency: "daily",
    category: "otros",
  });

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (ownerMonitor)
      return alert("Activa “Worker” en el conmutador para crear ítems.");
    const nm = String(newItem.name || "").trim();
    if (!nm) return;

    const parsedTarget =
      newItem.targetStock == null || Number(newItem.targetStock) <= 0
        ? null
        : Math.max(0, Number(newItem.targetStock));

    const payload = scrub({
      orgId: getOrgId(),
      name: nm,
      unit: (newItem.unit as Unit) || "g",
      stock: Math.max(0, safeNumber(newItem.stock, 0)),
      minStock: Math.max(0, safeNumber(newItem.minStock, 0)),
      targetStock: parsedTarget,
      costPerUnit: Math.max(0, safeNumber(newItem.costPerUnit, 0)),
      supplier: String(newItem.supplier ?? ""),
      provider: String(newItem.supplier ?? ""),
      frequency: (newItem.frequency as Frequency) || "daily",
      periodicity:
        ((newItem.frequency as Frequency) || "daily") === "daily"
          ? "daily"
          : ((newItem.frequency as Frequency) || "daily") === "monthly"
          ? "monthly"
          : "weekly",
      kind: (newItem.kind as Kind) || "consumable",
      category: (newItem.category as Category) || "otros",
      packSize: newItem.packSize ?? null,
      packLabel: (newItem.packLabel?.trim?.() || "") || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await addDoc(collection(db, "inventoryItems"), payload as any);
      setShowNew(false);
      setNewItem({
        name: "",
        unit: "g",
        stock: 0,
        minStock: 0,
        targetStock: undefined,
        costPerUnit: 0,
        supplier: "",
        kind: "consumable",
        frequency: "daily",
        category: "otros",
      });
    } catch (err) {
      handleError(err);
    }
  };

  /** ===== Movimientos ===== */
  const openMove = (it: any, type: "in" | "out") => {
    if (ownerMonitor) return;
    setMoveItem(it);
    setMoveType(type);
    setMoveQty(0);
    setMoveReason("");
    setMovePacks(0);
    setMoveAck(false);
    setMoveOpen(true);
  };

  const confirmMove = async () => {
    if (!moveOpen || !moveItem) return;
    if (ownerMonitor)
      return alert("Activa “Worker” en el conmutador para mover stock.");
    const qty = Math.abs(Number(moveQty) || 0);
    if (qty <= 0) return;
    if (!moveAck)
      return alert(
        "Confirma que entiendes que se modificará el stock de bodega."
      );

    try {
      const user = getAuth().currentUser;
      const itemRef = doc(db, "inventoryItems", moveItem.id);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        if (!snap.exists()) throw new Error("Ítem no existe");
        const cur = Number(snap.data()?.stock || 0);

        const next = cur + (moveType === "in" ? qty : -qty);
        if (next < 0) throw new Error("La salida dejaría el stock negativo.");

        tx.update(
          itemRef,
          scrub({ stock: next, updatedAt: serverTimestamp() }) as any
        );

        // Debe coincidir con reglas: null | sale | cancel | delete | purchase | manual
        const allowed = new Set(["sale", "cancel", "delete", "purchase", "manual"]);
        const safeReason = allowed.has(moveReason.trim())
          ? moveReason.trim()
          : null;

        const mref = doc(collection(db, "stockMovements"));
        tx.set(
          mref,
          scrub({
            id: mref.id,
            orgId: getOrgId(),
            at: serverTimestamp(),
            dateKey: dateKey(),
            type: moveType,
            ingredientId: moveItem.id,
            qty: safeNumber(qty, 0),
            reason: safeReason,
            userId: user?.uid || null,
            itemName: moveItem.name,
            unit: String(moveItem.unit || "u"),
          }) as any
        );
      });

      setMoveOpen(false);
      setMoveItem(null);
    } catch (err) {
      handleError(err);
    }
  };

  /** ===== Derivados / Auditoría ===== */
  const withAudit = useMemo(() => {
    return items.map((it) => {
      const tgt =
        it.targetStock == null || Number(it.targetStock) <= 0
          ? null
          : Number(it.targetStock);
      const par = tgt ?? (it.minStock ? it.minStock * 2 : 0);
      const faltan = Math.max(0, par - Number(it.stock || 0));
      const unitCost = Number(it.costPerUnit || 0);
      const lineCost = faltan * unitCost;
      const packSize = Number(it.packSize || 0) > 0 ? Number(it.packSize) : 0;
      const packsToBuy = packSize > 0 ? Math.ceil(faltan / packSize) : 0;
      return { ...it, par, faltan, lineCost, packsToBuy };
    });
  }, [items]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return withAudit
      .filter((i) =>
        filterKind === "all" ? true : (i.kind || "consumable") === filterKind
      )
      .filter((i) =>
        filterFreq === "all"
          ? true
          : (i.frequency || i.periodicity || "daily") === filterFreq
      )
      .filter((i) => (onlyMissing ? (i as any).faltan > 0 : true))
      .filter((i) =>
        t ? fixText(i.name).toLowerCase().includes(t) : true
      );
  }, [withAudit, q, filterKind, filterFreq, onlyMissing]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a: any, b: any) => {
      switch (sortBy) {
        case "name":
          return fixText(a.name).toLowerCase() <
            fixText(b.name).toLowerCase()
            ? -1 * dir
            : fixText(a.name).toLowerCase() >
              fixText(b.name).toLowerCase()
            ? 1 * dir
            : 0;
        case "stock":
        case "minStock":
        case "costPerUnit":
        case "par":
        case "faltan":
          return (a[sortBy] - b[sortBy]) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const onSort = useCallback(
    (k: SortKey) => {
      if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortBy(k);
        setSortDir("asc");
      }
    },
    [sortBy]
  );

  const faltantes = useMemo(
    () =>
      withAudit
        .filter((x: any) => x.faltan > 0)
        .sort((a, b) => (b as any).lineCost - (a as any).lineCost)
        .map((a: any) => ({
          id: a.id,
          name: a.name,
          qty: a.faltan,
          unit: String(a.unit),
          unitCost: a.costPerUnit,
        })),
    [withAudit]
  );

  const costoEstimado = useMemo(
    () => faltantes.reduce((s, a) => s + a.qty * (a.unitCost || 0), 0),
    [faltantes]
  );

  const exportarFaltantes = async (mode: "wa" | "copy" | "print") => {
    const lines = faltantes.map((f) => ({
      name: f.name,
      qty: f.qty,
      unit: String(f.unit),
    }));
    const text = formatLinesAsText(lines, "Bodega");
    if (mode === "wa") return shareText(text);
    if (mode === "copy") return copyToClipboard(text);
    if (mode === "print") return printLines(lines, "Bodega");
  };

  /** ===== Auto-crear/mergear orden del día (no toca stock) ===== */
  useEffect(() => {
    if (ownerMonitor) return;
    if (autoTried) return;
    if (todayPurchaseId) return;
    if (!faltantes.length) return;

    let alive = true;
    (async () => {
      try {
        setAutoBusy(true);
        const pid = await upsertDraftForToday(
          db,
          faltantes.map((a) => ({
            ingredientId: a.id,
            qty: a.qty,
            unitCost: a.unitCost,
          })),
          {}
        );
        if (!alive) return;
        if (pid) setTodayPurchaseId(pid);
      } finally {
        if (alive) {
          setAutoBusy(false);
          setAutoTried(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [ownerMonitor, autoTried, todayPurchaseId, faltantes]);

  /** Agrupación por categorías (vista “secciones”) */
  const groupedByCategory = useMemo(() => {
    const base = sorted;
    const groups: Record<
      Category,
      (Item & {
        par: number;
        faltan: number;
        lineCost: number;
        packsToBuy: number;
      })[]
    > = {
      comida: [],
      bebidas: [],
      aseo: [],
      maquinaria: [],
      desechables: [],
      otros: [],
    };

    for (const it of base as any[]) {
      const raw = String((it as any).category ?? "otros");
      const cat = (CATEGORIES as string[]).includes(raw)
        ? (raw as Category)
        : "otros";
      groups[cat].push(it as any);
    }
    return groups;
  }, [sorted]);

  const toggleExpand = (cat: string) =>
    setExpanded((p) => ({ ...p, [cat]: !(p[cat] ?? true) }));

  const expandAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    CATEGORIES.forEach((c) => (next[c] = open));
    setExpanded(next);
  };

  /** ===== Helpers de UI ===== */
  const nameToneClass = (stock: number, faltan: number) =>
    Number(stock || 0) <= 0
      ? "text-rose-700"
      : faltan > 0
      ? "text-amber-700"
      : "text-emerald-700";

  /** ===== Acciones masivas (parche: transacciones por ítem, no batch gigante) ===== */
  async function bulkZeroStock(scope: BulkScope): Promise<BulkResult> {
    const orgId = getOrgId();
    const userId = getAuth().currentUser?.uid || null;
    const today = dateKey();

    const baseQ = [
      where("orgId", "==", orgId),
      ...(scope.type === "category"
        ? [where("category", "==", scope.category)]
        : []),
    ] as const;

    const qy = fsQuery(collection(db, "inventoryItems"), ...baseQ);
    const snap = await getDocs(qy);
    const docs = snap.docs.map((d) => ({ id: d.id } as any));

    let updated = 0,
      movements = 0,
      errors = 0;

    for (const it of docs) {
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "inventoryItems", it.id);
          const s = await tx.get(ref);
          if (!s.exists()) return;
          const cur = Number(s.data()?.stock || 0);
          tx.update(ref, scrub({ stock: 0, updatedAt: serverTimestamp() }) as any);
          if (cur > 0) {
            const mref = doc(collection(db, "stockMovements"));
            tx.set(
              mref,
              scrub({
                id: mref.id,
                orgId,
                at: serverTimestamp(),
                dateKey: today,
                type: "out",
                ingredientId: it.id,
                qty: safeNumber(cur, 0),
                reason: "manual", // <- antes "reset"
                userId,
                itemName: String(s.data()?.name || ""),
                unit: String(s.data()?.unit || "u"),
              }) as any
            );
            movements++;
          }
        });
        updated++;
      } catch (err) {
        errors++;
        handleError(err, { silentAlert: true });
      }
    }
    return { updated, movements, errors };
  }

  async function bulkDeleteItems(scope: BulkScope): Promise<BulkResult> {
    const orgId = getOrgId();
    const userId = getAuth().currentUser?.uid || null;
    const today = dateKey();

    const baseQ = [
      where("orgId", "==", orgId),
      ...(scope.type === "category"
        ? [where("category", "==", scope.category)]
        : []),
    ] as const;

    const qy = fsQuery(collection(db, "inventoryItems"), ...baseQ);
    const snap = await getDocs(qy);
    const docs = snap.docs.map((d) => ({ id: d.id } as any));

    let deleted = 0,
      movements = 0,
      errors = 0;

    for (const it of docs) {
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "inventoryItems", it.id);
          const s = await tx.get(ref);
          if (!s.exists()) return;
          const cur = Number(s.data()?.stock || 0);
          if (cur > 0) {
            const mref = doc(collection(db, "stockMovements"));
            tx.set(
              mref,
              scrub({
                id: mref.id,
                orgId,
                at: serverTimestamp(),
                dateKey: today,
                type: "out",
                ingredientId: it.id,
                qty: safeNumber(cur, 0),
                reason: "delete",
                userId,
                itemName: String(s.data()?.name || ""),
                unit: String(s.data()?.unit || "u"),
              }) as any
            );
            movements++;
          }
          tx.delete(ref);
        });
        deleted++;
      } catch (err) {
        errors++;
        handleError(err, { silentAlert: true });
      }
    }
    return { deleted, movements, errors };
  }

  const handleBulkZero = async (scope: BulkScope) => {
    if (ownerMonitor) return alert("Activa Worker para editar.");
    const scopeLabel =
      scope.type === "all"
        ? "todos los ingredientes"
        : `la sección “${scope.category}”`;
    const ok = await confirmDanger({
      title: "Vaciar stock (masivo)",
      message: `Se pondrá el stock en 0 para ${scopeLabel}. Se registrará salida (out) en Kardex por las cantidades actuales.`,
      type: "wipe",
    });
    if (!ok) return;

    const res = await bulkZeroStock(scope);
    alert(`Vaciar stock listo ✅
Actualizados: ${res.updated}
Movimientos kardex: ${res.movements}
Errores: ${res.errors}`);
  };

  const handleBulkDelete = async (scope: BulkScope) => {
    if (ownerMonitor) return alert("Activa Worker para editar.");
    const scopeLabel =
      scope.type === "all"
        ? "todos los ingredientes"
        : `la sección “${scope.category}”`;
    const ok = await confirmDanger({
      title: "Borrar ingredientes (masivo)",
      message: `Eliminarás ${scopeLabel}. Si tienen stock se registrará 'out delete' en Kardex. Esta acción no se puede deshacer.`,
      type: "delete",
      requireText: "BORRAR",
    });
    if (!ok) return;

    const res = await bulkDeleteItems(scope);
    alert(`Borrado masivo listo ✅
Eliminados: ${res.deleted}
Movimientos kardex: ${res.movements}
Errores: ${res.errors}`);
  };

  /** ===== Render ===== */
  const allOpen = CATEGORIES.every((c) => expanded[c] ?? true);
  const tableDenseClass = compact ? "table table-compact" : "table";

  return (
    <div className="container-app space-y-6">
      {/* Topbar minimal */}
      <div className="sticky top-0 z-20 px-3 md:px-4 py-3 bg-white/95 backdrop-blur border-b">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Bodega</h1>
            {ownerMonitor && (
              <div className="mt-2 rounded-xl border bg-amber-50 text-amber-800 p-2 text-sm">
                Estás en <b>Owner (monitor)</b>. Para editar/crear/mover,
                cambia a <b>Worker</b>.
              </div>
            )}
            {permDenied && (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-2 text-sm flex items-start justify-between gap-2">
                <div>
                  <b>Permiso denegado (403)</b>. {errorNote || ""}{" "}
                  <span className="text-rose-700">
                    Si ves este aviso, la operación no se aplicó.
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPermDenied(false)}
                >
                  Ocultar
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn bg-amber-400 hover:bg-amber-500 text-slate-900 shadow-sm"
              onClick={() => !ownerMonitor && setShowNew(true)}
              disabled={ownerMonitor}
            >
              Nuevo ítem
            </button>
            <button
              className="btn"
              onClick={() => setSeedOpen(true)}
              title="Cargar o actualizar en lote"
            >
              Re-sembrar
            </button>
            <button
              className={`btn ${
                ownerMonitor ? "opacity-60 pointer-events-none" : ""
              }`}
              onClick={() => !ownerMonitor && setBulkOpen(true)}
            >
              Acciones masivas
            </button>
            <button
              className="btn"
              onClick={() => setOptsOpen(true)}
              title="Opciones de vista"
            >
              ⚙️ Opciones
            </button>
          </div>
        </div>

        {/* Controles rápidos */}
        <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <input
              className="input w-full"
              placeholder="Buscar ítem…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm shrink-0">
              <input
                type="checkbox"
                className="accent-current"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
              />
              Sólo faltantes
            </label>
            <select
              className="input shrink-0"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
            >
              <option value="sections">Vista: Secciones</option>
              <option value="table">Vista: Tabla</option>
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="btn" onClick={() => expandAll(!allOpen)}>
              {allOpen ? "Colapsar secciones" : "Expandir secciones"}
            </button>
            <button
              className="btn"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
          </div>
        </div>

        {/* Filtros (sin “Apariencia”) */}
        {filtersOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="input"
              value={filterKind}
              onChange={(e) =>
                setFilterKind(e.target.value as Kind | "all")
              }
              title="Tipo"
            >
              <option value="all">Todos</option>
              <option value="consumable">Consumibles</option>
              <option value="equipment">Maquinaria/Activos</option>
            </select>
            <select
              className="input"
              value={filterFreq}
              onChange={(e) =>
                setFilterFreq(e.target.value as Frequency | "all")
              }
              title="Frecuencia"
            >
              <option value="all">Frecuencia: todas</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
        )}
      </div>

      {/* Resumen compacto */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Ítems totales" value={items.length.toLocaleString()} />
        <StatCard
          label="Ítems con faltantes"
          value={withAudit
            .filter((x: any) => x.faltan > 0)
            .length.toLocaleString()}
        />
        <StatCard
          label="Costo estimado de reposición"
          value={currency(costoEstimado)}
        />
      </div>

      {/* Barra de acciones */}
      <div className="p-3 rounded-2xl border bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <div className="font-semibold">Acciones rápidas</div>
          <div className="text-sm text-slate-600">
            {faltantes.length} ítem(s) por comprar · Estimado{" "}
            <b>{currency(costoEstimado)}</b>
          </div>
          {autoBusy && (
            <div className="text-xs text-slate-500">
              Creando/actualizando borrador de hoy… (no mueve stock)
            </div>
          )}
          {todayPurchaseId && (
            <div className="text-sm">
              Orden de hoy:{" "}
              <a className="underline" href={`/compras/${todayPurchaseId}`}>
                abrir
              </a>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            button={<button className="btn">Exportar faltantes ▾</button>}
          >
            <MenuItem onClick={() => exportarFaltantes("wa")}>
              WhatsApp / Compartir
            </MenuItem>
            <MenuItem onClick={() => exportarFaltantes("copy")}>
              Copiar texto
            </MenuItem>
            <MenuItem onClick={() => exportarFaltantes("print")}>
              Imprimir / PDF
            </MenuItem>
          </Dropdown>
        </div>
      </div>

      {/* ======= Vista SECCIONES (categorías) ======= */}
      {viewMode === "sections" && (
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const arr = groupedByCategory[cat] || [];
            const missing = arr.filter((x: any) => x.faltan > 0);
            const est = missing.reduce(
              (s: number, a: any) => s + a.lineCost,
              0
            );
            const isOpen = expanded[cat] ?? true;

            return (
              <section key={cat} className="rounded-2xl border bg-white">
                <header className="flex items-center justify-between p-3">
                  <button
                    className="font-semibold capitalize"
                    onClick={() => toggleExpand(cat)}
                    aria-expanded={isOpen}
                  >
                    {cat}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-600">
                      {missing.length} faltantes · Estimado{" "}
                      <b>{currency(est)}</b> {isOpen ? "▴" : "▾"}
                    </div>

                    {/* menú por sección */}
                    <Dropdown
                      disabled={ownerMonitor}
                      button={
                        <button
                          className={`btn btn-ghost ${
                            ownerMonitor ? "opacity-60" : ""
                          }`}
                          title={
                            ownerMonitor
                              ? "Activa Worker para editar"
                              : "Acciones sección"
                          }
                        >
                          ⋯
                        </button>
                      }
                    >
                      <MenuItem
                        onClick={() =>
                          handleBulkZero({
                            type: "category",
                            category: cat,
                          })
                        }
                      >
                        Vaciar stock de esta sección
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        onClick={() =>
                          handleBulkDelete({
                            type: "category",
                            category: cat,
                          })
                        }
                      >
                        Borrar ingredientes de esta sección
                      </MenuItem>
                    </Dropdown>
                  </div>
                </header>

                {isOpen && (
                  <div className="overflow-auto">
                    <table className={`${tableDenseClass} min-w-[920px]`}>
                      <thead>
                        <tr>
                          <th>Ítem</th>
                          <th>Estado</th>
                          <th>Stock</th>
                          <th>Par</th>
                          <th>Faltan</th>
                          {colPrefs.showPack && <th>Empaque</th>}
                          {colPrefs.showSupplier && <th>Proveedor</th>}
                          <th className="w-64">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arr.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-3 py-4 text-center text-slate-400"
                            >
                              Sin ítems en esta categoría.
                            </td>
                          </tr>
                        ) : (
                          arr.map((it: any) => {
                            const rowClass =
                              Number(it.stock || 0) <= 0
                                ? "bg-rose-50"
                                : it.faltan > 0
                                ? "bg-amber-50/50"
                                : "";
                            const unitStr = String(it.unit);
                            const sugg =
                              unitStr === "g" || unitStr === "ml"
                                ? [250, 500, 1000]
                                : [1, 5, 10];

                            return (
                              <tr key={it.id} className={rowClass}>
                                <td className="px-3 py-2">
                                  <div
                                    className={`font-semibold truncate ${nameToneClass(
                                      it.stock,
                                      it.faltan
                                    )}`}
                                    title={fixText(it.name)}
                                  >
                                    {fixText(it.name)}
                                  </div>
                                  <div className="text-xs text-slate-500 whitespace-nowrap">
                                    {unitStr} · Cat: {it.category || "otros"}
                                  </div>
                                </td>

                                <td className="px-3 py-2">
                                  <StatusPill
                                    stock={it.stock}
                                    par={it.par}
                                    unit={it.unit}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  {it.stock.toLocaleString()}
                                </td>
                                <td className="px-3 py-2">
                                  {it.par?.toLocaleString?.() ?? "-"}
                                </td>

                                <td className="px-3 py-2">
                                  <span
                                    className={
                                      Number(it.stock || 0) <= 0
                                        ? "font-semibold text-rose-700"
                                        : it.faltan > 0
                                        ? "font-semibold text-amber-700"
                                        : ""
                                    }
                                  >
                                    {it.faltan.toLocaleString()} {unitStr}
                                  </span>
                                  {it.packSize && it.faltan > 0 ? (
                                    <div className="text-xs text-slate-500">
                                      ≈ {it.packsToBuy} u ·{" "}
                                      {it.packLabel ||
                                        `${it.packSize} ${unitStr}/u`}
                                    </div>
                                  ) : null}
                                </td>

                                {colPrefs.showPack && (
                                  <td className="px-3 py-2">
                                    {it.packSize ? (
                                      it.packLabel ||
                                      `${it.packSize} ${unitStr}/u`
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                )}

                                {colPrefs.showSupplier && (
                                  <td className="px-3 py-2">
                                    {it.supplier || (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                )}

                                <td className="px-3 py-2">
                                  <div
                                    className={
                                      "flex flex-wrap items-center gap-2 " +
                                      (ownerMonitor
                                        ? "opacity-60 pointer-events-none"
                                        : "")
                                    }
                                  >
                                    <button
                                      className="btn btn-sm bg-emerald-500 hover:bg-emerald-600 text-white"
                                      onClick={() => openMove(it, "in")}
                                      title="Registrar entrada"
                                    >
                                      Entrada
                                    </button>
                                    <button
                                      className="btn btn-sm bg-rose-500 hover:bg-rose-600 text-white"
                                      onClick={() => openMove(it, "out")}
                                      title="Registrar salida"
                                    >
                                      Salida
                                    </button>

                                    {/* Menú compacto de acciones */}
                                    <Dropdown
                                      button={
                                        <button className="btn btn-ghost btn-sm">
                                          ⋯ Acciones
                                        </button>
                                      }
                                    >
                                      <MenuLabel>Acciones</MenuLabel>
                                      <MenuItem onClick={() => openEdit(it)}>
                                        Editar…
                                      </MenuItem>
                                      <MenuItem
                                        onClick={() => zeroItem(it)}
                                        tone="amber"
                                      >
                                        Vaciar stock (poner en 0)
                                      </MenuItem>
                                      <MenuSeparator />
                                      <MenuLabel>Empaque</MenuLabel>
                                      <MenuItem
                                        onClick={() =>
                                          setPackSuggested(it, null, null)
                                        }
                                      >
                                        Sin empaque
                                      </MenuItem>
                                      {sugg.map((n) => (
                                        <MenuItem
                                          key={n}
                                          onClick={() =>
                                            setPackSuggested(it, n, null)
                                          }
                                        >
                                          {n} {unitStr}/u
                                        </MenuItem>
                                      ))}
                                      <MenuItem onClick={() => openPackModal(it)}>
                                        Personalizado…
                                      </MenuItem>
                                      <MenuSeparator />
                                      <MenuLabel>Categoría</MenuLabel>
                                      {CATEGORIES.map((c) => (
                                        <MenuItem
                                          key={c}
                                          onClick={() =>
                                            changeCategoryTo(it, c)
                                          }
                                        >
                                          {c}
                                        </MenuItem>
                                      ))}
                                      <MenuSeparator />
                                      <MenuItem
                                        onClick={() => borrar(it.id)}
                                        tone="rose"
                                      >
                                        Eliminar
                                      </MenuItem>
                                    </Dropdown>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ======= Vista TABLA ======= */}
      {viewMode === "table" && (
        <div className="rounded-2xl border bg-white overflow-auto">
          <table className={`${tableDenseClass} min-w-[1100px]`}>
            <thead>
              <tr>
                <Th
                  label="Nombre"
                  sortKey="name"
                  activeKey={sortBy}
                  dir={sortDir}
                  onSort={onSort}
                />
                <th>Unidad</th>
                <Th
                  label="Stock"
                  sortKey="stock"
                  activeKey={sortBy}
                  dir={sortDir}
                  onSort={onSort}
                />
                <Th
                  label="Mín"
                  sortKey="minStock"
                  activeKey={sortBy}
                  dir={sortDir}
                  onSort={onSort}
                />
                <Th
                  label="Par"
                  sortKey="par"
                  activeKey={sortBy}
                  dir={sortDir}
                  onSort={onSort}
                />
                <Th
                  label="Faltan"
                  sortKey="faltan"
                  activeKey={sortBy}
                  dir={sortDir}
                  onSort={onSort}
                />
                {colPrefs.showCost && (
                  <Th
                    label="Costo/u"
                    sortKey="costPerUnit"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={onSort}
                  />
                )}
                {colPrefs.showFreq && <th>Frecuencia</th>}
                {colPrefs.showSupplier && <th>Proveedor</th>}
                {colPrefs.showPack && <th>Empaque</th>}
                <th className="w-64">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    {items.length
                      ? "Sin resultados con los filtros actuales."
                      : "Sin ítems."}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    Cargando inventario…
                  </td>
                </tr>
              )}

              {!loading &&
                sorted.map((it: any) => {
                  const editing = editingId === it.id;
                  const row = (editing ? (draft as Item) : it) as Item;

                  const rowClass =
                    Number(it.stock || 0) <= 0
                      ? "bg-rose-50"
                      : it.faltan > 0
                      ? "bg-amber-50/50"
                      : "";
                  const unitStr = String(it.unit);
                  const sugg =
                    unitStr === "g" || unitStr === "ml"
                      ? [250, 500, 1000]
                      : [1, 5, 10];

                  return (
                    <tr key={it.id} className={rowClass}>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            value={(row as any).name || ""}
                            onChange={(e) =>
                              setDraft({ ...(row as any), name: e.target.value })
                            }
                          />
                        ) : (
                          <div className="flex flex-col">
                            <span
                              className={`font-semibold truncate ${nameToneClass(
                                it.stock,
                                it.faltan
                              )}`}
                              title={fixText((row as any).name)}
                            >
                              {fixText((row as any).name)}
                            </span>
                            <span className="text-xs text-slate-500 mt-0.5">
                              Cat: {(it.category as any) || "otros"}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {editing ? (
                          <select
                            className="input"
                            value={(row as any).unit as string}
                            onChange={(e) =>
                              setDraft({
                                ...(row as any),
                                unit: e.target.value as Unit,
                              })
                            }
                          >
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                            <option value="u">u</option>
                          </select>
                        ) : (
                          unitStr
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={String(((row as any).stock ?? 0) as any)}
                            onChange={(e) =>
                              setDraft({
                                ...(row as any),
                                stock: Number(e.target.value || 0),
                              })
                            }
                          />
                        ) : (
                          (it as any).stock.toLocaleString()
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={String(((row as any).minStock ?? 0) as any)}
                            onChange={(e) =>
                              setDraft({
                                ...(row as any),
                                minStock: Number(e.target.value || 0),
                              })
                            }
                          />
                        ) : (
                          (it as any).minStock.toLocaleString()
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={
                              (row as any).targetStock == null
                                ? ""
                                : String((row as any).targetStock)
                            }
                            onChange={(e) =>
                              setDraft({
                                ...(row as any),
                                targetStock:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value || 0),
                              })
                            }
                            placeholder="vacío = usa min*2"
                          />
                        ) : it.par ? (
                          (it.par as number).toLocaleString()
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <span
                          className={
                            Number(it.stock || 0) <= 0
                              ? "font-semibold text-rose-700"
                              : it.faltan > 0
                              ? "font-semibold text-amber-700"
                              : ""
                          }
                        >
                          {(it.faltan as number).toLocaleString()}
                        </span>
                      </td>

                      {colPrefs.showCost && (
                        <td className="px-3 py-2">
                          {editing ? (
                            <input
                              className="input"
                              type="number"
                              min={0}
                              step="0.01"
                              value={String(
                                ((row as any).costPerUnit ?? 0) as any
                              )}
                              onChange={(e) =>
                                setDraft({
                                  ...(row as any),
                                  costPerUnit: Number(e.target.value || 0),
                                })
                              }
                            />
                          ) : (
                            currency((it as any).costPerUnit || 0)
                          )}
                        </td>
                      )}

                      {colPrefs.showFreq && (
                        <td className="px-3 py-2">
                          {editing ? (
                            <select
                              className="input"
                              value={
                                ((row as any).frequency as Frequency) ||
                                "daily"
                              }
                              onChange={(e) =>
                                setDraft({
                                  ...(row as any),
                                  frequency: e.target.value as Frequency,
                                })
                              }
                              disabled={
                                ((row as any).kind || "consumable") ===
                                "equipment"
                              }
                            >
                              <option value="daily">Diario</option>
                              <option value="weekly">Semanal</option>
                              <option value="monthly">Mensual</option>
                            </select>
                          ) : (row.kind || "consumable") === "equipment" ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            FREQ_LABEL[
                              (((row as any).frequency || "daily") as Frequency)
                            ]
                          )}
                        </td>
                      )}

                      {colPrefs.showSupplier && (
                        <td className="px-3 py-2">
                          {editing ? (
                            <input
                              className="input"
                              value={(row as any).supplier || ""}
                              onChange={(e) =>
                                setDraft({
                                  ...(row as any),
                                  supplier: e.target.value,
                                  provider: e.target.value,
                                })
                              }
                              placeholder="Nombre proveedor"
                            />
                          ) : (
                            (fixText((row as any).supplier) as any) || (
                              <span className="text-slate-400">-</span>
                            )
                          )}
                        </td>
                      )}

                      {colPrefs.showPack && (
                        <td className="px-3 py-2">
                          {it.packSize ? (
                            it.packLabel ||
                            `${it.packSize} ${unitStr}/u`
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      <td className="px-3 py-2">
                        <div
                          className={
                            "flex flex-wrap items-center gap-2 " +
                            (ownerMonitor
                              ? "opacity-60 pointer-events-none"
                              : "")
                          }
                        >
                          {!editing ? (
                            <>
                              <button
                                className="btn btn-sm bg-emerald-500 hover:bg-emerald-600 text-white"
                                onClick={() => openMove(it, "in")}
                              >
                                Entrada
                              </button>
                              <button
                                className="btn btn-sm bg-rose-500 hover:bg-rose-600 text-white"
                                onClick={() => openMove(it, "out")}
                              >
                                Salida
                              </button>

                              <Dropdown
                                button={
                                  <button className="btn btn-ghost btn-sm">
                                    ⋯ Acciones
                                  </button>
                                }
                              >
                                <MenuLabel>Acciones</MenuLabel>
                                <MenuItem onClick={() => openEdit(it)}>
                                  Editar…
                                </MenuItem>
                                <MenuItem
                                  onClick={() => zeroItem(it)}
                                  tone="amber"
                                >
                                  Vaciar stock (poner en 0)
                                </MenuItem>
                                <MenuSeparator />
                                <MenuLabel>Empaque</MenuLabel>
                                <MenuItem
                                  onClick={() =>
                                    setPackSuggested(it, null, null)
                                  }
                                >
                                  Sin empaque
                                </MenuItem>
                                {sugg.map((n) => (
                                  <MenuItem
                                    key={n}
                                    onClick={() =>
                                      setPackSuggested(it, n, null)
                                    }
                                  >
                                    {n} {unitStr}/u
                                  </MenuItem>
                                ))}
                                <MenuItem onClick={() => openPackModal(it)}>
                                  Personalizado…
                                </MenuItem>
                                <MenuSeparator />
                                <MenuLabel>Categoría</MenuLabel>
                                {CATEGORIES.map((c) => (
                                  <MenuItem
                                    key={c}
                                    onClick={() => changeCategoryTo(it, c)}
                                  >
                                    {c}
                                  </MenuItem>
                                ))}
                                <MenuSeparator />
                                <MenuItem
                                  onClick={() => borrar(it.id)}
                                  tone="rose"
                                >
                                  Eliminar
                                </MenuItem>
                              </Dropdown>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-sm" onClick={cancelEdit}>
                                Cancelar
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={saveEdit}
                              >
                                Guardar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL Acciones masivas */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setBulkOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setBulkOpen(false)}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Acciones masivas</div>
              <button className="btn" onClick={() => setBulkOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-slate-500 mb-2">
                  Global
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    className="btn"
                    onClick={() => handleBulkZero({ type: "all" })}
                  >
                    Vaciar stock (todos)
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleBulkDelete({ type: "all" })}
                  >
                    Borrar ingredientes (todos)
                  </button>
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-slate-500 mb-2">
                  Por categoría
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => (
                    <div key={c} className="rounded-lg border p-2">
                      <div className="text-sm capitalize mb-2">{c}</div>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            handleBulkZero({ type: "category", category: c })
                          }
                        >
                          Vaciar
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            handleBulkDelete({ type: "category", category: c })
                          }
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-2">
              Estas acciones no se pueden deshacer. Se registrará salida en
              Kardex cuando corresponda.
            </div>
          </div>
        </div>
      )}

      {/* MODAL Opciones (antes “Apariencia”) */}
      {optsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && setOptsOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Opciones de vista</div>
              <button className="btn" onClick={() => setOptsOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="grid gap-3">
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-slate-500 mb-2">
                  Columnas opcionales
                </div>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={colPrefs.showPack}
                    onChange={(e) =>
                      setColPrefs({ ...colPrefs, showPack: e.target.checked })
                    }
                  />{" "}
                  Empaque
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={colPrefs.showSupplier}
                    onChange={(e) =>
                      setColPrefs({
                        ...colPrefs,
                        showSupplier: e.target.checked,
                      })
                    }
                  />{" "}
                  Proveedor
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={colPrefs.showCost}
                    onChange={(e) =>
                      setColPrefs({ ...colPrefs, showCost: e.target.checked })
                    }
                  />{" "}
                  Costo/u
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={colPrefs.showFreq}
                    onChange={(e) =>
                      setColPrefs({ ...colPrefs, showFreq: e.target.checked })
                    }
                  />{" "}
                  Frecuencia
                </label>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs uppercase text-slate-500 mb-2">
                  Ajustes
                </div>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={compact}
                    onChange={(e) => setCompact(e.target.checked)}
                  />{" "}
                  Compacto
                </label>
                <label
                  className="text-sm flex items-center gap-2"
                  title="Muestra el botón Editar por ítem"
                >
                  <input
                    type="checkbox"
                    checked={advanced}
                    onChange={(e) => setAdvanced(e.target.checked)}
                  />{" "}
                  Acciones avanzadas (Editar)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Nuevo */}
      {showNew && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && setShowNew(false)}
        >
          <form
            onSubmit={crear}
            className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-lg space-y-3"
          >
            <div className="text-lg font-semibold">Nuevo ítem</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="label">Nombre</div>
                <input
                  className="input w-full"
                  value={newItem.name || ""}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <div>
                <div className="label">Unidad</div>
                <select
                  className="input"
                  value={newItem.unit as Unit}
                  onChange={(e) =>
                    setNewItem({ ...newItem, unit: e.target.value as Unit })
                  }
                >
                  <option value="g">Gramos (g)</option>
                  <option value="ml">Mililitros (ml)</option>
                  <option value="u">Unidades (u)</option>
                </select>
              </div>
              <div>
                <div className="label">Stock</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={String(newItem.stock ?? 0)}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      stock: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div>
                <div className="label">Mínimo</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={String(newItem.minStock ?? 0)}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      minStock: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div>
                <div className="label">Objetivo (par)</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={
                    newItem.targetStock == null
                      ? ""
                      : String(newItem.targetStock)
                  }
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      targetStock:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value || 0),
                    })
                  }
                  placeholder="vacío = usa min*2"
                />
              </div>
              <div>
                <div className="label">Costo por unidad</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(newItem.costPerUnit ?? 0)}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      costPerUnit: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div>
                <div className="label">Frecuencia</div>
                <select
                  className="input"
                  value={(newItem.frequency as Frequency) || "daily"}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      frequency: e.target.value as Frequency,
                    })
                  }
                  disabled={(newItem.kind as Kind) === "equipment"}
                >
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
              <div>
                <div className="label">Proveedor</div>
                <input
                  className="input"
                  value={newItem.supplier || ""}
                  onChange={(e) =>
                    setNewItem({ ...newItem, supplier: e.target.value })
                  }
                  placeholder='Ej: "Distribuidor XYZ"'
                />
              </div>
              <div>
                <div className="label">Tipo</div>
                <select
                  className="input"
                  value={(newItem.kind as Kind) || "consumable"}
                  onChange={(e) =>
                    setNewItem({ ...newItem, kind: e.target.value as Kind })
                  }
                >
                  <option value="consumable">Consumible</option>
                  <option value="equipment">Maquinaria / Activo</option>
                </select>
              </div>
              <div>
                <div className="label">Categoría</div>
                <select
                  className="input"
                  value={(newItem.category as Category) || "otros"}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      category: e.target.value as Category,
                    })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn"
                onClick={() => setShowNew(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary">Crear</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL Editar ítem */}
      {editOpen && editingId && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && (setEditOpen(false), cancelEdit())}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => { e.preventDefault(); saveEdit().then(() => setEditOpen(false)); }}
            className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-lg space-y-3"
          >
            <div className="text-lg font-semibold">Editar ítem</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="label">Nombre</div>
                <input
                  className="input w-full"
                  value={String((draft as any).name || "")}
                  onChange={(e) => setDraft({ ...(draft as any), name: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <div className="label">Unidad</div>
                <select
                  className="input"
                  value={String((draft as any).unit || "g")}
                  onChange={(e) => setDraft({ ...(draft as any), unit: e.target.value })}
                >
                  <option value="g">Gramos (g)</option>
                  <option value="ml">Mililitros (ml)</option>
                  <option value="u">Unidades (u)</option>
                </select>
              </div>

              <div>
                <div className="label">Stock</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={String((draft as any).stock ?? 0)}
                  onChange={(e) => setDraft({ ...(draft as any), stock: Number(e.target.value || 0) })}
                />
              </div>
              <div>
                <div className="label">Mínimo</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={String((draft as any).minStock ?? 0)}
                  onChange={(e) => setDraft({ ...(draft as any), minStock: Number(e.target.value || 0) })}
                />
              </div>
              <div>
                <div className="label">Objetivo (par)</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={(draft as any).targetStock == null ? "" : String((draft as any).targetStock)}
                  onChange={(e) =>
                    setDraft({
                      ...(draft as any),
                      targetStock: e.target.value === "" ? null : Number(e.target.value || 0),
                    })
                  }
                  placeholder="vacío = usa min*2"
                />
              </div>

              <div>
                <div className="label">Costo por unidad</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={String((draft as any).costPerUnit ?? 0)}
                  onChange={(e) =>
                    setDraft({ ...(draft as any), costPerUnit: Number(e.target.value || 0) })
                  }
                />
              </div>

              <div>
                <div className="label">Proveedor</div>
                <input
                  className="input"
                  value={String((draft as any).supplier || (draft as any).provider || "")}
                  onChange={(e) =>
                    setDraft({
                      ...(draft as any),
                      supplier: e.target.value,
                      provider: e.target.value,
                    })
                  }
                  placeholder='Ej: "Distribuidor XYZ"'
                />
              </div>

              <div>
                <div className="label">Categoría</div>
                <select
                  className="input"
                  value={String((draft as any).category || "otros")}
                  onChange={(e) => setDraft({ ...(draft as any), category: e.target.value as any })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="label">Tamaño de pack (opcional)</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={(draft as any).packSize == null ? "" : String((draft as any).packSize)}
                  onChange={(e) =>
                    setDraft({
                      ...(draft as any),
                      packSize: e.target.value === "" ? null : Number(e.target.value || 0),
                    })
                  }
                  placeholder="p.ej 1000 para 1L o 1000g"
                />
              </div>
              <div className="md:col-span-2">
                <div className="label">Etiqueta pack (opcional)</div>
                <input
                  className="input"
                  value={String((draft as any).packLabel || "")}
                  onChange={(e) => setDraft({ ...(draft as any), packLabel: e.target.value || null })}
                  placeholder='Ej: "botella 1 L"'
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn"
                onClick={() => { setEditOpen(false); cancelEdit(); }}
              >
                Cancelar
              </button>
              <button className="btn btn-primary">Guardar cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL Movimiento de stock */}
      {moveOpen && moveItem && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && setMoveOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg space-y-3">
            <div className="text-lg font-semibold">
              {moveType === "in"
                ? "Registrar ENTRADA a bodega"
                : "Registrar SALIDA (consumo/merma)"}
            </div>
            <div className="text-sm text-slate-600">
              Ítem:{" "}
              <span className="font-medium">{fixText(moveItem.name)}</span> ·
              Unidad: {String(moveItem.unit)}
            </div>
            <PreviewImpact
              moveType={moveType}
              qty={moveQty}
              current={moveItem.stock}
              unit={String(moveItem.unit)}
            />

            <div className="grid gap-3">
              {moveItem.packSize ? (
                <div>
                  <div className="label">
                    Empaques (1 pack = {moveItem.packSize}{" "}
                    {String(moveItem.unit)}){" "}
                    {moveItem.packLabel ? `· ${moveItem.packLabel}` : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      value={String(movePacks)}
                      onChange={(e) => {
                        const p = Math.max(0, Number(e.target.value || 0));
                        setMovePacks(p);
                        setMoveQty(p * (Number(moveItem.packSize) || 0));
                      }}
                    />
                    <div className="flex gap-1">
                      {[1, 2, 5].map((n) => (
                        <button
                          key={n}
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setMovePacks(n);
                            setMoveQty(
                              n * (Number(moveItem.packSize) || 0)
                            );
                          }}
                          type="button"
                        >
                          {n}x pack
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="label">
                  Cantidad ({String(moveItem.unit)})
                </div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={String(moveQty)}
                  onChange={(e) => {
                    const q = Math.max(0, Number(e.target.value || 0));
                    setMoveQty(q);
                  }}
                />
              </div>

              <div>
                <div className="label">Motivo (opcional)</div>
                <input
                  className="input"
                  placeholder='Opcional: "sale", "cancel", "delete", "purchase" o "manual". Otro → se guarda sin motivo'
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                />
              </div>

              <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-2">
                Esta acción <b>modifica el stock de Bodega</b> y genera un
                registro en el <b>Kardex</b>.
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={moveAck}
                  onChange={(e) => setMoveAck(e.target.checked)}
                  className="accent-current"
                />
                Entiendo y deseo{" "}
                {moveType === "in"
                  ? "registrar la entrada"
                  : "registrar la salida"}
                .
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn" onClick={() => setMoveOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmMove}
                disabled={!moveAck || Number(moveQty) <= 0}
                title={!moveAck ? "Marca la casilla de confirmación" : ""}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Pack editor */}
      {packOpen && packItem && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
          onKeyDown={(e) => e.key === "Escape" && setPackOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg space-y-3">
            <div className="text-lg font-semibold">Configurar empaque</div>
            <div className="text-sm text-slate-600">
              Ítem:{" "}
              <span className="font-medium">{fixText(packItem.name)}</span> ·
              Unidad: {String(packItem.unit)}
            </div>
            <div>
              <div className="label">
                Tamaño del pack ({String(packItem.unit)})
              </div>
              <input
                className="input"
                type="number"
                min={0}
                value={packSizeDraft == null ? "" : String(packSizeDraft)}
                onChange={(e) =>
                  setPackSizeDraft(
                    e.target.value === "" ? null : Number(e.target.value || 0)
                  )
                }
                placeholder="Ej: 1000 para 1L o 1000g"
              />
            </div>
            <div>
              <div className="label">Etiqueta (opcional)</div>
              <input
                className="input"
                value={packLabelDraft}
                onChange={(e) => setPackLabelDraft(e.target.value)}
                placeholder='Ej: "botella 1L"'
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setPackOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={savePackModal}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Semilla */}
      {seedOpen && (
        <SeedModal
          seedOpen={seedOpen}
          onClose={() => setSeedOpen(false)}
          seedBusy={seedBusy}
          setSeedBusy={setSeedBusy}
          seedRows={seedRows}
          setSeedRows={setSeedRows}
          items={items}
          ownerMonitor={ownerMonitor}
        />
      )}
    </div>
  );
}

/** ===== UI helpers ===== */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusPill({
  stock,
  par,
  unit,
}: {
  stock: number;
  par: number;
  unit: string | Unit;
}) {
  const faltan = Math.max(0, Number(par || 0) - Number(stock || 0));
  const isZero = Number(stock || 0) <= 0;
  const color = isZero
    ? "bg-rose-100 text-rose-700"
    : faltan > 0
    ? "bg-amber-100 text-amber-700"
    : "bg-emerald-100 text-emerald-700";
  const dot = isZero
    ? "bg-rose-500"
    : faltan > 0
    ? "bg-amber-500"
    : "bg-emerald-500";
  const label = isZero
    ? "Sin stock"
    : faltan > 0
    ? `Faltan ${faltan} ${String(unit)}`
    : "OK";
  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs ${color}`}
      title={label}
      aria-label={label}
      role="status"
    >
      <i className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Th({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey?: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey && activeKey === sortKey;
  return (
    <th
      className={`cursor-pointer select-none ${active ? "underline" : ""}`}
      onClick={() => sortKey && onSort(sortKey)}
      title={sortKey ? "Ordenar" : ""}
      scope="col"
    >
      <span>{label}</span>
      {active ? <span> {dir === "asc" ? "↑" : "↓"}</span> : null}
    </th>
  );
}

/** ===== Dropdown controlado (oculto por defecto, sin depender de CSS externo) ===== */
function Dropdown({
  button,
  children,
  align = "right",
  disabled = false,
}: {
  button: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <div
        onClick={() => !disabled && setOpen((o) => !o)}
        className={disabled ? "opacity-60 pointer-events-none" : ""}
      >
        {button}
      </div>
      {open && (
        <div
          className={`absolute z-50 mt-2 min-w-[220px] rounded-2xl border bg-white shadow-lg p-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}
function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "rose" | "amber";
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
      ? "text-amber-700"
      : "";
  return (
    <button
      className={`block w-full text-left rounded-xl px-3 py-2 hover:bg-slate-100 ${toneCls}`}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}
function MenuSeparator() {
  return <div className="my-1 border-t" />;
}
function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1 text-xs text-slate-500 select-none">{children}</div>
  );
}

/** ===== Helpers Semilla / Modal ===== */
function editSeed(
  rows: SeedRow[],
  idx: number,
  patch: Partial<SeedRow>
): SeedRow[] {
  const copy = rows.slice();
  copy[idx] = { ...copy[idx], ...patch };
  return copy;
}
function parseSeed(text: string): SeedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes("\t")
    ? "\t"
    : lines[0].includes(";")
    ? ";"
    : ",";
  const toCat = (v: string): Category =>
    (CATEGORIES as string[]).includes(v as any) ? (v as Category) : "otros";
  const toUnit = (v: string): Unit | string =>
    ["g", "ml", "u"].includes(v) ? (v as Unit) : "g";

  const rows: SeedRow[] = [];
  for (const l of lines) {
    const [
      name,
      unit,
      min,
      par,
      cost,
      supplier,
      category,
      packSize,
      packLabel,
    ] = l.split(delim).map((x) => x?.trim?.() ?? "");
    if (!name) continue;
    rows.push({
      name,
      unit: toUnit(unit || "g"),
      minStock: Math.max(0, Number(min || 0)),
      targetStock:
        par === "" ? null : Math.max(0, Number(par || 0)),
      costPerUnit: Math.max(0, Number(cost || 0)),
      supplier: supplier || "",
      category: toCat(category || "otros"),
      packSize: packSize === "" ? null : Number(packSize || 0),
      packLabel: packLabel || "",
    });
  }
  return rows;
}
function PreviewImpact({
  moveType,
  qty,
  current,
  unit,
}: {
  moveType: "in" | "out";
  qty: number;
  current: number;
  unit: string;
}) {
  const cur = Number(current || 0);
  const q = Math.max(0, Number(qty || 0));
  const delta = moveType === "in" ? q : -q;
  const next = cur + delta;
  const bad = next < 0;

  return (
    <div className="text-sm">
      <div className="text-slate-600">Previsualización:</div>
      <div className={`font-mono ${bad ? "text-rose-700" : "text-slate-800"}`}>
        {cur.toLocaleString()} {unit} {moveType === "in" ? " + " : " - "}{" "}
        {q.toLocaleString()} {unit} {" = "}
        <b>
          {next.toLocaleString()} {unit}
        </b>
      </div>
      {bad && (
        <div className="text-rose-700">
          La operación no es válida: dejaría el stock en negativo.
        </div>
      )}
    </div>
  );
}

function SeedModal({
  seedOpen,
  onClose,
  seedBusy,
  setSeedBusy,
  seedRows,
  setSeedRows,
  items,
  ownerMonitor,
}: any) {
  const tableDenseClass = "table table-compact";
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Re-sembrar ingredientes</div>
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="text-sm text-slate-600">
          Usa la tabla para <b>cargar o actualizar</b> ingredientes en lote. Si
          el <b>nombre coincide</b> con uno existente, se <b>actualiza</b> (no
          toca el stock). Si no existe, se <b>crea</b> con <b>stock 0</b>.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            type="button"
            onClick={() =>
              setSeedRows((r: SeedRow[]) => [
                ...r,
                ...Array.from({ length: 5 }, () => makeSeedRow()),
              ])
            }
          >
            +5 filas
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const text = prompt(
                "Pega aquí desde Excel/CSV.\nColumnas (tab/coma/;): name, unit, min, par, cost, supplier, category, packSize, packLabel"
              );
              if (!text) return;
              const rows = parseSeed(text);
              if (!rows.length) return alert("No se detectaron filas válidas.");
              setSeedRows(rows);
            }}
          >
            Pegar desde Excel/CSV
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => setSeedRows([makeSeedRow()])}
          >
            Limpiar
          </button>
          <button
            className="btn btn-primary"
            disabled={seedBusy}
            onClick={async () => {
              if (ownerMonitor) return alert("Activa “Worker” para re-sembrar.");
              const valid = seedRows.filter(
                (r: SeedRow) => String(r.name || "").trim() !== ""
              );
              if (!valid.length) return alert("No hay filas con nombre.");

              try {
                setSeedBusy(true);
                const orgId = getOrgId();
                const index = new Map<string, Item>();
                (items as Item[]).forEach((i) =>
                  index.set(fixText(i.name).toLowerCase(), i)
                );
                let created = 0,
                  updated = 0,
                  failed = 0;

                for (const r of valid) {
                  const nm = fixText(String(r.name)).trim();
                  const key = nm.toLowerCase();
                  const catRaw = (r.category || "otros") as string;
                  const category = (CATEGORIES as string[]).includes(catRaw)
                    ? (catRaw as Category)
                    : "otros";

                  const payloadBase = {
                    name: nm,
                    unit: (r.unit as Unit) || "g",
                    minStock: Math.max(0, Number(r.minStock) || 0),
                    targetStock:
                      r.targetStock == null || Number(r.targetStock) <= 0
                        ? null
                        : Math.max(0, Number(r.targetStock)),
                    costPerUnit: Math.max(0, Number(r.costPerUnit) || 0),
                    supplier: String(r.supplier ?? ""),
                    provider: String(r.supplier ?? ""),
                    category,
                    packSize:
                      r.packSize == null ? null : Number(r.packSize),
                    packLabel: (r.packLabel?.trim?.() || "") || null,
                    frequency: "daily" as Frequency,
                    periodicity: "daily" as const,
                    kind: "consumable" as Kind,
                    updatedAt: serverTimestamp(),
                  };

                  const match = index.get(key);
                  try {
                    if (match) {
                      await updateDoc(
                        doc(db, "inventoryItems", match.id),
                        scrub(payloadBase) as any
                      );
                      updated++;
                    } else {
                      await addDoc(
                        collection(db, "inventoryItems"),
                        scrub({
                          ...payloadBase,
                          orgId,
                          stock: 0,
                          createdAt: serverTimestamp(),
                        }) as any
                      );
                      created++;
                    }
                  } catch {
                    failed++;
                  }
                }

                alert(`Semilla lista ✅
Creados: ${created}
Actualizados: ${updated}
Fallidos: ${failed}`);
                onClose();
              } finally {
                setSeedBusy(false);
              }
            }}
          >
            Guardar todo
          </button>
        </div>

        <div className="overflow-auto rounded-xl border">
          <table className={`${tableDenseClass} min-w-[1100px]`}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Mín</th>
                <th>Par</th>
                <th>Costo/u</th>
                <th>Proveedor</th>
                <th>Categoría</th>
                <th>Empaque (tamaño)</th>
                <th>Etiqueta empaque</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {seedRows.map((r: SeedRow, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input
                      className="input w-64"
                      value={r.name}
                      onChange={(e) =>
                        setSeedRows(editSeed(seedRows, i, { name: e.target.value }))
                      }
                      placeholder="Ej: Harina de trigo"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={r.unit as string}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            unit: e.target.value as Unit,
                          })
                        )
                      }
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="u">u</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      value={String(r.minStock ?? 0)}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            minStock: Number(e.target.value || 0),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      value={r.targetStock == null ? "" : String(r.targetStock)}
                      placeholder="vacío = min*2"
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            targetStock:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value || 0),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-28"
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(r.costPerUnit ?? 0)}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            costPerUnit: Number(e.target.value || 0),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-44"
                      value={r.supplier || ""}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, { supplier: e.target.value })
                        )
                      }
                      placeholder="Proveedor opcional"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={(r.category as Category) || "otros"}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            category: e.target.value as Category,
                          })
                        )
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-28"
                      type="number"
                      min={0}
                      value={r.packSize == null ? "" : String(r.packSize)}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            packSize:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value || 0),
                          })
                        )
                      }
                      placeholder="p.ej 1000"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-44"
                      value={r.packLabel || ""}
                      onChange={(e) =>
                        setSeedRows(
                          editSeed(seedRows, i, {
                            packLabel: e.target.value || null,
                          })
                        )
                      }
                      placeholder="p.ej botella 1L"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setSeedRows(seedRows.filter((_: any, k: number) => k !== i))
                      }
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-slate-500">
          Columnas esperadas al pegar: <code>name</code>, <code>unit</code>,{" "}
          <code>min</code>, <code>par</code>, <code>cost</code>,{" "}
          <code>supplier</code>, <code>category</code>, <code>packSize</code>,{" "}
          <code>packLabel</code>. Separador tab, coma o punto y coma.
        </div>
      </div>
    </div>
  );
}

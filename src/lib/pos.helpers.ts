// src/lib/pos.helpers.ts
import type { Firestore } from "firebase/firestore";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { gaLog, getOrgId, toDateKey } from "@/services/firebase";
import { awardStampsOnDeliveredOrder } from "@/lib/customers";

/** ===== Config colecciones (multi-tenant toggle) =====
 *  Si usas subcolecciones por organización, pon USE_ORG_SUBCOLS=true.
 *  Así quedará en orgs/{orgId}/{colName}
 */
const USE_ORG_SUBCOLS = false;
const col = (db: Firestore, orgId: string, name: string) =>
  USE_ORG_SUBCOLS ? collection(db as any, "orgs", orgId, name) : collection(db as any, name);
const docIn = (db: Firestore, orgId: string, name: string, id?: string) =>
  id
    ? (USE_ORG_SUBCOLS ? doc(db as any, "orgs", orgId, name, id) : doc(db as any, name, id))
    : doc(col(db, orgId, name));

/** ===== Tipos ===== */
export type PayMethod = "cash" | "qr" | "card" | "other";

export type CartItem = {
  id: string;
  name: string;
  sizeId?: string;
  sizeName?: string;
  price: number;
  qty: number;
  recipe?: Record<string, number>; // ingredienteId -> cantidad (unidad base)
  isBeverage?: boolean;
  category?: string;
};

type InventoryRow = {
  id: string;
  have: number;
  req: number;
  name: string;
  unit?: string;
  cpu: number; // costo por unidad
};

/** ===== Config impuestos / redondeo ===== */
const IVA_RATE = 0; // 0.19 si manejas IVA incluido
const ROUND_TO = 50; // múltiplo $50 (0 = sin redondeo)

/** ---------- Utils ---------- */
function aggregateNeed(items: CartItem[]): Record<string, number> {
  const need: Record<string, number> = {};
  for (const it of items) {
    const r = it.recipe || {};
    const units = Number(it.qty) || 0;
    for (const [ing, perUnit] of Object.entries(r)) {
      const total = (Number(perUnit) || 0) * units;
      if (total > 0) need[ing] = (need[ing] || 0) + total;
    }
  }
  return need;
}

function computeNeedFromItemsList(items: any[] | undefined): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items || []) {
    const r = it?.recipe || {};
    const qty = Number(it?.qty || 0);
    for (const [ing, grams] of Object.entries(r)) {
      const total = (Number(grams) || 0) * qty;
      if (total > 0) acc[ing] = (acc[ing] || 0) + total;
    }
  }
  return acc;
}

function toAnalyticsItems(items: CartItem[]) {
  return items
    .filter((i) => (Number(i.price) || 0) >= 0)
    .map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.qty) || 0,
    }));
}

/** ===== Totales con descuento/IVA/redondeo ===== */
const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : n);

// Migrated to src/services/order.ts
// leaving visual helpers only

/** =========================================================
 * FRAPPE HELPERS (exportados para Canvas / Studio / etc.)
 * ========================================================= */

// Unidades usadas en recetas / visualización
export type Unit = "g" | "ml" | "u";

// Item para visualización de vaso/capas
export type VizItem = { name: string; unit: Unit | string; amount: number };

// Normalización de texto tolerante a encoding chueco
export function fixText(s?: string): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch: string) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

// normaliza + quita tildes (con fallback si \p{Diacritic} no está disponible)
export const normalize = (s: string) => {
  const base = fixText(s).toLowerCase().normalize("NFD");
  try {
    // @ts-ignore - algunos runtimes no soportan \p{Diacritic}
    return base.replace(/\p{Diacritic}/gu, "");
  } catch {
    return base.replace(/[\u0300-\u036f]/g, "");
  }
};

type Role = "liquid" | "sparkling" | "ice" | "syrup" | "topping" | "whipped" | "base" | "ignore";

// Clasifica ingrediente (rol + color)
export function classify(name: string): { role: Role; color: string } {
  const n = normalize(name);
  if (/(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[ée]rmica|pitillos|vaso(?!.*(cart[oó]n|pl[aá]stico|8 oz|12 oz)))/.test(n)) return { role: "ignore", color: "#fff" };
  if (/(detergente|desinfectante|jab[oó]n)/.test(n)) return { role: "ignore", color: "#fff" };
  if (/(hielo|ice)/.test(n)) return { role: "ice", color: "#e7f5ff" };
  if (/(t[oó]nica|tonica|soda|sparkling)/.test(n)) return { role: "sparkling", color: "#cfe9ff" };
  if (/(espresso|caf[eé]|cold ?brew|concentrado cold brew)/.test(n)) return { role: "liquid", color: "#4a2c21" };
  if (/(leche|avena)/.test(n)) return { role: "liquid", color: "#f3e6d4" };
  if (/(milo|cacao|chocolate(?!.*blanco)|negro|oscuro)/.test(n)) return { role: "liquid", color: "#6b3e2e" };
  if (/(chocolate.*blanco|blanco)/.test(n)) return { role: "liquid", color: "#fff3e0" };
  if (/(fresa|strawberry|naranja|arándano|arandano)/.test(n)) return { role: "liquid", color: "#ffb3c1" };
  if (/(vainilla)/.test(n)) return { role: "liquid", color: "#f7e7b6" };
  if (/(caramelo|syrup|sirope|jarabe|arequipe|dulce de leche|az[uú]car)/.test(n)) return { role: "syrup", color: "#cc8a2e" };
  if (/(oreo|galleta|cookies?)/.test(n)) return { role: "topping", color: "#2f2f2f" };
  if (/(crema batida|chantilly|whipped)/.test(n)) return { role: "whipped", color: "#ffffff" };
  if (/(base frapp[eé]|base frappe|base)/.test(n)) return { role: "base", color: "#dfe7ff" };
  if (/(agua)/.test(n)) return { role: "liquid", color: "#cfe9ff" };
  return { role: "liquid", color: "#d9c7a2" };
}

// Calcula capas y extras para el vaso
export function asLayers(items: VizItem[]) {
  const enriched = items
    .map((it) => ({ ...it, ...classify(it.name) }))
    .filter((it) => it.role !== "ignore");

  const liquids = enriched.filter(
    (it) => (it.unit === "ml" || it.unit === "g") && (it.role === "liquid" || it.role === "sparkling")
  );

  const total = liquids.reduce((a, b) => a + Math.max(0, b.amount || 0), 0) || 1;
  const layers = liquids.map((it) => ({
    height: Math.max(0, it.amount || 0) / total,
    color: classify(it.name).color,
    label: it.name,
    sparkling: classify(it.name).role === "sparkling",
  }));

  const ice = enriched.filter((it) => it.role === "ice");
  const syrups = enriched.filter((it) => it.role === "syrup");
  const toppings = enriched.filter((it) => it.role === "topping");
  const whipped = enriched.filter((it) => it.role === "whipped");
  const base = enriched.filter((it) => it.role === "base");
  const sparklingStrength = liquids
    .filter((l) => classify(l.name).role === "sparkling")
    .reduce((a, b) => a + (b.amount || 0), 0);

  return {
    layers,
    iceCount: ice.length ? Math.max(2, Math.round((ice[0].amount || 0) / 50)) : 0,
    syrups,
    toppings,
    whipped,
    basePresent: base.length > 0,
    sparklingStrength,
  };
}

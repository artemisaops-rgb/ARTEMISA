// src/services/order.ts
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  Firestore
} from "firebase/firestore";
import type { OrderItem } from "./types.ar.rb";
import { applyStockForOrder } from "./bodega";
import { db as defaultDb } from "./firebase";

/* --------------------------------
   Helpers básicos
----------------------------------*/
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toDateKey = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

type CleanComponent = { itemId: string; qty: number; unit: string };
type CleanItem = {
  custom?: boolean;
  sizeId?: string;
  price: number;
  components: CleanComponent[];
  meta?: Record<string, any>;
};

function cleanItem(raw: any): CleanItem {
  const components: CleanComponent[] = (Array.isArray(raw?.components) ? raw.components : [])
    .map((c: any) => ({
      itemId: String(c?.itemId ?? c?.inventoryItemId ?? ""),
      qty: Math.max(0, num(c?.qty)),
      unit: String(c?.unit ?? "pc"),
    }))
    .filter((c) => c.itemId && c.qty > 0);

  const metaIn = raw?.meta ?? {};
  const meta: Record<string, any> = {};
  for (const k of ["basePublic", "baseCost", "topsServings", "topsChargeable", "topsUnit", "topsPublic"]) {
    const v = (metaIn as any)[k];
    if (v !== undefined && v !== null) meta[k] = num(v, v);
  }

  const out: CleanItem = {
    custom: !!raw?.custom,
    sizeId: raw?.sizeId ? String(raw.sizeId) : undefined,
    price: Math.max(0, num(raw?.price)),
    components,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
  return out;
}

/* --------------------------------
   Tipos para WorkQueue
----------------------------------*/
export type WorkQueueDoc = {
  orgId: string;
  orderId: string;            // <- requerido por reglas (string)
  status: "queued" | "working" | "done" | "canceled";
  route: string;              // p.ej. "kitchen"
  kind: string;               // p.ej. "builder-ticket"
  sizeId?: string;
  total?: number;
  source?: "client-app" | "kiosk";
  createdAt: any;
  createdBy?: string;
};

/* --------------------------------
   API 1: crear orden (como ya usas)
   - NO encola (el cliente puede encolar aparte)
----------------------------------*/
export async function createOrderFromBuilder(params: {
  orgId: string;
  userId: string;
  source: "client-app" | "kiosk";
  items: OrderItem[];
  db?: Firestore; // opcional: inyectar un db (tests)
}) {
  const db = params.db ?? defaultDb;

  const orderRef = doc(collection(db, "orders"));
  const orderId = orderRef.id;

  // limpia items -> sin undefined/NaN
  const safeItems = (Array.isArray(params.items) ? params.items : []).map(cleanItem);
  if (!safeItems.length) throw new Error("La orden no tiene ítems válidos.");

  const total = safeItems.reduce((s, it) => s + num(it.price), 0);

  const orderPayload = {
    id: orderId,
    orgId: String(params.orgId),
    userId: String(params.userId),
    source: params.source,
    status: "pending" as const,
    items: safeItems,
    total,
    createdAt: serverTimestamp(),
    dateKey: toDateKey(),
  };

  const batch = writeBatch(db);
  batch.set(orderRef, orderPayload);
  await batch.commit();

  // descuenta stock por TODOS los componentes
  const allComponents: CleanComponent[] = safeItems.flatMap((i) => i.components);
  if (allComponents.length) {
    await applyStockForOrder(params.orgId, orderId, allComponents);
  }

  return orderId;
}

/* --------------------------------
   API 2: SOLO encolar una orden existente
   - Usa el MISMO orderId como id del doc en la cola (evita duplicados)
----------------------------------*/
export async function enqueueWorkQueue(params: {
  orgId: string;
  orderId: string;
  status?: WorkQueueDoc["status"];  // default: "queued"
  route?: string;                   // default: "kitchen"
  kind?: string;                    // default: "builder-ticket"
  sizeId?: string;
  total?: number;
  source?: "client-app" | "kiosk";
  createdBy?: string;
  db?: Firestore;
}) {
  const db = params.db ?? defaultDb;
  const {
    orgId, orderId, sizeId, total, createdBy, source,
    status = "queued", route = "kitchen", kind = "builder-ticket",
  } = params;

  const qRef = doc(collection(db, `orgs/${orgId}/workQueue`), orderId);
  const payload: WorkQueueDoc = {
    orgId,
    orderId: String(orderId),
    status,
    route,
    kind,
    sizeId,
    total,
    source,
    createdAt: serverTimestamp(),
    ...(createdBy ? { createdBy } : {}),
  };
  const batch = writeBatch(db);
  batch.set(qRef, payload);
  await batch.commit();
  return orderId;
}

/* --------------------------------
   API 3: Atómico (recomendado)
   - Crea la orden y la encola en UN SOLO batch
   - Aplica stock después (fuera del batch)
----------------------------------*/
export async function createOrderAndEnqueue(params: {
  orgId: string;
  userId: string;
  source: "client-app" | "kiosk";
  items: OrderItem[];
  queue?: {
    route?: string;
    kind?: string;
    sizeId?: string;
    total?: number; // si no lo pasas, se usa la suma de price
    createdBy?: string;
  };
  db?: Firestore;
}) {
  const db = params.db ?? defaultDb;

  const orderRef = doc(collection(db, "orders"));
  const orderId = orderRef.id;

  const safeItems = (Array.isArray(params.items) ? params.items : []).map(cleanItem);
  if (!safeItems.length) throw new Error("La orden no tiene ítems válidos.");

  const computedTotal = safeItems.reduce((s, it) => s + num(it.price), 0);
  const total = num(params.queue?.total, computedTotal);

  const orderPayload = {
    id: orderId,
    orgId: String(params.orgId),
    userId: String(params.userId),
    source: params.source,
    status: "pending" as const,
    items: safeItems,
    total,
    createdAt: serverTimestamp(),
    dateKey: toDateKey(),
  };

  const qRef = doc(collection(db, `orgs/${params.orgId}/workQueue`), orderId);
  const queuePayload: WorkQueueDoc = {
    orgId: params.orgId,
    orderId: String(orderId),
    status: "queued",
    route: params.queue?.route ?? "kitchen",
    kind: params.queue?.kind ?? "builder-ticket",
    sizeId: params.queue?.sizeId,
    total,
    source: params.source,
    createdAt: serverTimestamp(),
    ...(params.queue?.createdBy ? { createdBy: params.queue.createdBy } : {})
  };

  // Batch atómico: order + queue
  const batch = writeBatch(db);
  batch.set(orderRef, orderPayload);
  batch.set(qRef, queuePayload);
  await batch.commit();

  // Descontar stock (post-commit)
  const allComponents: CleanComponent[] = safeItems.flatMap((i) => i.components);
  if (allComponents.length) {
    await applyStockForOrder(params.orgId, orderId, allComponents);
  }

  return orderId;
}

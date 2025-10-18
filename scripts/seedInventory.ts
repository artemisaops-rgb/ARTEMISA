// public/scripts/seedInventory.ts
/* eslint-disable no-console */
// Seed de inventario (idempotente). Usa Admin SDK modular.
// - Crea si no existe (match por name+orgId)
// - Si ya existe, actualiza metadata sin tocar el 'stock' a menos que OVERRIDE_STOCK=1 o --override-stock 1

import { existsSync } from "node:fs";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/** ====== CLI flags / env ====== */
function flag(name: string, short?: string) {
  const idx = process.argv.findIndex(
    (a) => a === `--${name}` || (short ? a === `-${short}` : false)
  );
  return idx >= 0 ? String(process.argv[idx + 1] || "") : "";
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccount.json";
const ORG_ID = process.env.ORG_ID?.trim() || flag("org", "o") || "artemisa";
const OVERRIDE_STOCK =
  process.env.OVERRIDE_STOCK === "1" ||
  flag("override-stock") === "1" ||
  false;

/** ====== Admin init ====== */
if (getApps().length === 0) {
  if (!existsSync(credPath)) {
    console.error(
      "Falta serviceAccount.json o GOOGLE_APPLICATION_CREDENTIALS.\n" +
        "→ Exporta GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json"
    );
    process.exit(1);
  }
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

/** ====== Tipos ====== */
type Unit = "g" | "ml" | "u";
type Kind = "consumable" | "equipment";
type Category =
  | "comida"
  | "bebidas"
  | "aseo"
  | "maquinaria"
  | "desechables"
  | "otros"
  | "operación";

type SeedItem = {
  name: string;
  unit: Unit;
  stock: number;          // stock inicial sugerido
  minStock: number;
  targetStock: number | null;
  costPerUnit: number;
  supplier?: string;
  kind?: Kind;
  category?: Category;
  packSize?: number | null;
  packLabel?: string | null;
};

/** ====== Datos base ====== */
const items: SeedItem[] = [
  { name: "Café en grano arábica", unit: "g", stock: 0, minStock: 2000, targetStock: 6000, costPerUnit: 0.045, supplier: "Tostadora XYZ", kind: "consumable", category: "bebidas", packSize: 1000, packLabel: "bolsa 1kg" },
  { name: "Agua filtrada", unit: "ml", stock: 0, minStock: 5000, targetStock: 15000, costPerUnit: 0, supplier: "—", kind: "consumable", category: "bebidas" },
  { name: "Milo en polvo", unit: "g", stock: 0, minStock: 1000, targetStock: 3000, costPerUnit: 0.02, supplier: "Nestlé", kind: "consumable", category: "bebidas", packSize: 400, packLabel: "lata 400g" },
  { name: "Leche entera UHT", unit: "ml", stock: 0, minStock: 4000, targetStock: 12000, costPerUnit: 0.003, supplier: "Lácteos La Vaquita", kind: "consumable", category: "bebidas", packSize: 1000, packLabel: "brick 1L" },
  { name: "Hielo en cubos", unit: "g", stock: 0, minStock: 15000, targetStock: 45000, costPerUnit: 0.0005, supplier: "Hielo Polar", kind: "consumable", category: "operación", packSize: 5000, packLabel: "bolsa 5kg" },
  { name: "Azúcar blanca", unit: "g", stock: 0, minStock: 3000, targetStock: 7000, costPerUnit: 0.007, supplier: "Dulces S.A.", kind: "consumable", category: "comida" },
  { name: "Crema batida aerosol", unit: "ml", stock: 0, minStock: 1000, targetStock: 2000, costPerUnit: 0.02, supplier: "Lácteos La Vaquita", kind: "consumable", category: "comida", packSize: 500, packLabel: "lata 500ml" },
  { name: "Jarabe de chocolate", unit: "ml", stock: 0, minStock: 1500, targetStock: 3000, costPerUnit: 0.01, supplier: "Salsas & Co", kind: "consumable", category: "comida", packSize: 1000, packLabel: "botella 1L" },
  { name: "Bolsas de inmersión Cold Brew", unit: "u", stock: 0, minStock: 30, targetStock: 100, costPerUnit: 0.3, supplier: "BrewKit", kind: "consumable", category: "otros", packSize: 50, packLabel: "paquete x50" },
  { name: "Botellas PET 1L (cold brew)", unit: "u", stock: 0, minStock: 20, targetStock: 60, costPerUnit: 0.4, supplier: "Empaques XYZ", kind: "consumable", category: "desechables", packSize: 24, packLabel: "caja x24" },
  { name: "Vasos 12oz", unit: "u", stock: 0, minStock: 100, targetStock: 300, costPerUnit: 0.25, supplier: "Empaques XYZ", kind: "consumable", category: "desechables", packSize: 50, packLabel: "sleever x50" },
  { name: "Vasos 16oz", unit: "u", stock: 0, minStock: 100, targetStock: 300, costPerUnit: 0.30, supplier: "Empaques XYZ", kind: "consumable", category: "desechables", packSize: 50, packLabel: "sleever x50" },
  { name: "Tapas 12/16oz", unit: "u", stock: 0, minStock: 100, targetStock: 300, costPerUnit: 0.12, supplier: "Empaques XYZ", kind: "consumable", category: "desechables", packSize: 50, packLabel: "sleever x50" },
  { name: "Pitillos", unit: "u", stock: 0, minStock: 200, targetStock: 600, costPerUnit: 0.05, supplier: "Empaques XYZ", kind: "consumable", category: "desechables", packSize: 100, packLabel: "bolsa x100" },
  { name: "Filtros de papel #2", unit: "u", stock: 0, minStock: 100, targetStock: 300, costPerUnit: 0.05, supplier: "Bunn", kind: "consumable", category: "otros", packSize: 100, packLabel: "caja x100" },
  { name: "Detergente lavavajillas", unit: "ml", stock: 0, minStock: 500, targetStock: 1500, costPerUnit: 0.005, supplier: "AseoPlus", kind: "consumable", category: "aseo", packSize: 1000, packLabel: "botella 1L" },
  { name: "Desinfectante superficies", unit: "ml", stock: 0, minStock: 500, targetStock: 1500, costPerUnit: 0.006, supplier: "AseoPlus", kind: "consumable", category: "aseo", packSize: 1000, packLabel: "botella 1L" },
];

/** ====== Sanitizadores ====== */
const clampNum = (v: any, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : min;
};
const validUnit = (u: any): Unit => (["g", "ml", "u"].includes(u) ? (u as Unit) : "u");

/** ====== Upsert por (orgId + name) ====== */
async function upsertByName() {
  const col = db.collection("inventoryItems");
  for (const raw of items) {
    const it: SeedItem = {
      ...raw,
      unit: validUnit(raw.unit),
      stock: clampNum(raw.stock),
      minStock: clampNum(raw.minStock),
      targetStock:
        raw.targetStock == null ? null : clampNum(raw.targetStock),
      costPerUnit: clampNum(raw.costPerUnit),
      packSize: raw.packSize == null ? null : clampNum(raw.packSize),
      packLabel: raw.packLabel ?? null,
    };

    const snap = await col
      .where("orgId", "==", ORG_ID)
      .where("name", "==", it.name)
      .limit(1)
      .get();

    if (snap.empty) {
      await col.add({
        orgId: ORG_ID,
        name: it.name,
        unit: it.unit,
        stock: it.stock,
        minStock: it.minStock,
        targetStock: it.targetStock,
        costPerUnit: it.costPerUnit,
        supplier: it.supplier ?? null,
        kind: it.kind ?? "consumable",
        category: it.category ?? "otros",
        packSize: it.packSize ?? null,
        packLabel: it.packLabel ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log("CREATED:", it.name);
    } else {
      const ref = snap.docs[0].ref;

      // Por defecto conservamos el stock actual (más seguro en producción).
      // Para forzar usar el stock del seed: OVERRIDE_STOCK=1
      const patch: Record<string, any> = {
        orgId: ORG_ID,
        name: it.name,
        unit: it.unit,
        minStock: it.minStock,
        targetStock: it.targetStock,
        costPerUnit: it.costPerUnit,
        supplier: it.supplier ?? null,
        kind: it.kind ?? "consumable",
        category: it.category ?? "otros",
        packSize: it.packSize ?? null,
        packLabel: it.packLabel ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (OVERRIDE_STOCK) patch.stock = it.stock;

      await ref.set(patch, { merge: true });
      console.log("UPDATED:", it.name, OVERRIDE_STOCK ? "(stock override)" : "");
    }
  }
}

/** ====== Run ====== */
upsertByName()
  .then(() => {
    console.log("✔ Seed completado para org:", ORG_ID);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Seed falló:", e);
    process.exit(1);
  });

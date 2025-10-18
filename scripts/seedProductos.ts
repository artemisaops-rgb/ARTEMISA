// public/scripts/seedProductos.ts
/* eslint-disable no-console */
/**
 * Seed/normaliza un producto con BOM (receta) usando Admin SDK.
 * - Idempotente por (orgId + productId)
 * - Busca los insumos por NOMBRE en inventoryItems y almacena la receta como [{ingredientId, qty}]
 * - Requiere GOOGLE_APPLICATION_CREDENTIALS o serviceAccount.json
 *
 * Ejemplos:
 *  ORG_ID=artemisa npx ts-node public/scripts/seedProductos.ts
 *  ORG_ID=artemisa PRODUCT_ID=demo-frappe-milo PRICE=14000 npx ts-node public/scripts/seedProductos.ts
 */

import { existsSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/** ===== Flags/env ===== */
function flag(name: string, short?: string) {
  const i = process.argv.findIndex((a) => a === `--${name}` || (short ? a === `-${short}` : false));
  return i >= 0 ? String(process.argv[i + 1] || "") : "";
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccount.json";
const ORG_ID = process.env.ORG_ID?.trim() || flag("org", "o") || "artemisa";

const PRODUCT_ID = (process.env.PRODUCT_ID || flag("id")).trim() || "demo-frappe-milo";
const PRODUCT_NAME = (process.env.PRODUCT_NAME || flag("name")).trim() || "Frappe de Milo";
const CATEGORY = (process.env.CATEGORY || flag("category")).trim() || "bebidas";

const PRICE = Number(process.env.PRICE ?? flag("price")) || 12000; // COP
const ACTIVE =
  (process.env.ACTIVE ?? flag("active") ?? "1").toString() === "0" ? false : true;

/** ===== Admin init ===== */
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

/** ===== Receta base (por NOMBRE) =====
 * Debe matchear los nombres que sembraste en seedInventory.ts
 * Las cantidades están en la UNIDAD del inventoryItem (g/ml/u)
 */
const BASE_BOM_BY_NAME: Array<{ name: string; qty: number }> = [
  { name: "Milo en polvo", qty: 40 },          // g
  { name: "Leche entera UHT", qty: 180 },      // ml
  { name: "Hielo en cubos", qty: 200 },        // g
  { name: "Jarabe de chocolate", qty: 10 },    // ml
  { name: "Vasos 16oz", qty: 1 },              // u
  { name: "Tapas 12/16oz", qty: 1 },           // u
  { name: "Pitillos", qty: 1 },                // u
];

/** Normaliza número seguro */
const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Busca un insumo por (orgId + name). Devuelve id o null si no existe. */
async function findIngredientIdByName(name: string): Promise<string | null> {
  const snap = await db
    .collection("inventoryItems")
    .where("orgId", "==", ORG_ID)
    .where("name", "==", name)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

/** Resuelve la BOM: nombres → { ingredientId, qty } */
async function resolveBOM() {
  const bom: Array<{ ingredientId: string; qty: number }> = [];
  const missing: string[] = [];
  for (const line of BASE_BOM_BY_NAME) {
    const id = await findIngredientIdByName(line.name);
    if (!id) {
      missing.push(line.name);
      continue;
    }
    const qty = Math.max(0, num(line.qty));
    if (qty > 0) bom.push({ ingredientId: id, qty });
  }
  return { bom, missing };
}

/** Upsert del producto (orgId + PRODUCT_ID) */
async function upsertProduct() {
  const { bom, missing } = await resolveBOM();

  if (missing.length) {
    console.warn(
      "⚠ Algunos insumos de la receta no existen en inventoryItems y serán omitidos:",
      missing
    );
  }

  const pref = db.collection("products").doc(PRODUCT_ID);
  const snap = await pref.get();

  const basePayload = {
    id: PRODUCT_ID,
    orgId: ORG_ID,
    name: PRODUCT_NAME,
    price: Math.max(0, num(PRICE)),
    active: !!ACTIVE,
    category: CATEGORY || null,
    // BOM/receta: cada item es { ingredientId, qty } (unidad tomada del inventoryItem)
    bom,
    updatedAt: FieldValue.serverTimestamp(),
  } as const;

  if (!snap.exists) {
    await pref.set(
      {
        ...basePayload,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log("✔ PRODUCTO CREADO:", PRODUCT_ID, "→", PRODUCT_NAME);
  } else {
    await pref.set(basePayload, { merge: true });
    console.log("✔ PRODUCTO ACTUALIZADO:", PRODUCT_ID, "→", PRODUCT_NAME);
  }

  if (bom.length === 0) {
    console.warn("⚠ La BOM quedó vacía. Verifica los nombres de insumos o corre seedInventory primero.");
  }
}

/** Run */
upsertProduct()
  .then(() => {
    console.log("✓ Seed productos listo para org:", ORG_ID);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Seed productos falló:", e);
    process.exit(1);
  });

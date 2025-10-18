import admin from "firebase-admin";
import { readFileSync } from "fs";

const ORGID = process.env.ORGID || "artemisa";
const SA_PATH = process.env.SA_PATH;

if (!SA_PATH) throw new Error("Set SA_PATH env var (ruta al serviceAccount.json)");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SA_PATH, "utf8"))),
});

const db = admin.firestore();

await db.collection("inventoryItems").add({
  orgId: ORGID,
  name: "Azúcar",
  unit: "g",
  stock: 7000,
  costPerUnit: 200,
  supplier: "Distribuidor XYZ",
  frequency: "daily",
  kind: "consumable",
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

await db.collection("products").add({
  orgId: ORGID,
  name: "milo",
  category: "frappes",
  active: true,
  sizes: [{ id: "1", name: "M", price: 6000, recipe: {} }],
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

console.log("Seed OK");
process.exit(0);

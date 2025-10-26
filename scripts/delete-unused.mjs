import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = path.join(process.cwd(), "out");

const sa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "serviceAccount.json"), "utf8"));
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const file = path.join(OUT, "unused_inventory.csv");
  if (!fs.existsSync(file)) throw new Error("Falta out/unused_inventory.csv (corre audit-inventory primero).");
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1);
  const ids = lines.map(l => {
    // primera columna puede venir entre comillas
    const m = /^"?(.*?)"?,/.exec(l);
    return m ? m[1] : l.split(",")[0];
  }).filter(Boolean);
  const apply = process.argv.includes("--apply");
  console.log(`${apply ? "BORRANDO" : "Dry-run"} ${ids.length} insumos...`);
  for (const id of ids) {
    if (apply) await db.collection("inventoryItems").doc(id).delete();
    console.log(" -", id);
  }
  console.log("Listo.");
})();

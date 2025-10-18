import admin from "firebase-admin";
import fs from "node:fs";

if (process.argv.length < 3) {
  console.error("Uso: node tools/fixAccents.mjs <ruta-serviceAccount.json> [--orgId=<org>]");
  process.exit(1);
}
const saPath = process.argv[2];
const orgArg = (process.argv.find(x => x.startsWith("--orgId=")) || "--orgId=").split("=")[1] || null;

if (!fs.existsSync(saPath)) {
  console.error("No encuentro el serviceAccount.json en:", saPath);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();

const maybeFix = (s) => {
  if (typeof s !== "string") return s;
  // Intento de reparar cuando hay 'Ã', 'Â' u otras secuencias típicas de mal encoding
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    // Evitar ciclos: si sigue conteniendo basura, no forzar
    if (/[ÃÂ]/.test(fixed)) return s;
    return fixed;
  } catch { return s; }
};

async function fixCollection(colName, fields) {
  let q = db.collection(colName);
  if (orgArg) q = q.where("orgId", "==", orgArg);
  const snap = await q.get();
  let changed = 0;
  for (const doc of snap.docs) {
    const v = doc.data() || {};
    const upd = {};
    for (const f of fields) {
      if (typeof v[f] === "string") {
        const fx = maybeFix(v[f]);
        if (fx !== v[f]) upd[f] = fx;
      }
    }
    if (Object.keys(upd).length) {
      await doc.ref.set(upd, { merge: true });
      changed++;
      console.log(`[${colName}] ${doc.id} ->`, upd);
    }
  }
  console.log(`>> ${colName}: ${changed} documento(s) corregido(s).`);
}

(async () => {
  // Ajusta campos típicos que muestran acentos/ñ rotos
  await fixCollection("products",       ["name","desc","description","category","subtitle","label"]);
  await fixCollection("inventoryItems", ["name","desc","unit","provider","category"]);
  // Agrega más colecciones si lo ves en tus datos (orders, etc.)
  console.log("OK: limpieza terminada.");
  process.exit(0);
})();

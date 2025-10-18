/* scripts/fix-accents.js
 * Uso:
 *   node scripts/fix-accents.js --orgId artemisa --backup ./backups/backup-YYYY-MM-DD.json
 *
 * Requisitos:
 *   - serviceAccount.json en la raíz del proyecto.
 *   - npm i firebase-admin
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const args = require("node:process").argv.slice(2);
function getArg(name, fallback = null) {
  const ix = args.findIndex(a => a === `--${name}`);
  if (ix >= 0 && args[ix + 1]) return args[ix + 1];
  return fallback;
}

const ORG_ID = getArg("orgId");
const BACKUP = getArg("backup", `./backups/backup-${new Date().toISOString().slice(0,10)}.json`);

if (!ORG_ID) {
  console.error("Falta --orgId. Ej: --orgId artemisa");
  process.exit(1);
}

const saPath = path.resolve(process.cwd(), "serviceAccount.json");
if (!fs.existsSync(saPath)) {
  console.error("No encuentro serviceAccount.json en la raíz del proyecto.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(saPath)),
});
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function looksMojibake(s) {
  return /[ÃÂ�]/.test(s); // patrones comunes de utf8->latin1 roto
}

function tryFixMojibake(s) {
  try {
    // Intenta reinterpretar como latin1 y decodificar en utf8
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    // Si quedó mejor (menos artefactos), usamos ese
    const scoreBefore = (s.match(/[ÃÂ�]/g) || []).length;
    const scoreAfter  = (fixed.match(/[ÃÂ�]/g) || []).length;
    return scoreAfter <= scoreBefore ? fixed : s;
  } catch {
    return s;
  }
}

function normalizeText(s) {
  if (typeof s !== "string" || !s) return s;
  let out = s;
  if (looksMojibake(out)) out = tryFixMojibake(out);
  out = out.normalize("NFC").trim().replace(/\s+/g, " ");
  return out;
}

async function fetchAll(collectionName, orgId, pageSize = 500) {
  const out = [];
  let last = null;
  while (true) {
    let q = db.collection(collectionName)
      .where("orgId", "==", orgId)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach(doc => out.push({ id: doc.id, ...doc.data() }));
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < pageSize) break;
  }
  return out;
}

async function run() {
  console.log(`[FixAccents] orgId=${ORG_ID}`);
  const collections = ["products", "inventoryItems"];

  // BACKUP
  console.log("[Backup] Exportando datos…");
  const backup = {};
  for (const col of collections) {
    backup[col] = await fetchAll(col, ORG_ID);
    console.log(`  - ${col}: ${backup[col].length} docs`);
  }
  const backupPath = path.resolve(process.cwd(), BACKUP);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`[Backup] Guardado en ${backupPath}`);

  // UPDATE
  console.log("[Update] Normalizando name/desc…");
  for (const col of collections) {
    const docs = backup[col];
    let batch = db.batch();
    let ops = 0;
    for (const d of docs) {
      const beforeName = d.name;
      const beforeDesc = d.desc;

      const name = normalizeText(beforeName);
      const desc = normalizeText(beforeDesc);

      // Solo escribir si cambia algo
      if (name !== beforeName || desc !== beforeDesc) {
        const ref = db.collection(col).doc(d.id);
        batch.update(ref, { name, desc });
        ops++;
      }

      // Commit por lotes ~400 para evitar límites
      if (ops && ops % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (ops % 400 !== 0) {
      await batch.commit();
    }
    console.log(`  - ${col}: ${ops} docs actualizados`);
  }

  console.log("[Done] Limpieza completada.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

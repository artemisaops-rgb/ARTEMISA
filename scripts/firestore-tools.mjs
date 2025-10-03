import fs from "node:fs";
import admin from "firebase-admin";

const saPath = process.env.SA || "./serviceAccount.json";
if (!fs.existsSync(saPath)) {
  console.error(`No se encontró ${saPath}. Descarga la clave de servicio y guárdala ahí.`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const F  = admin.firestore.FieldValue;

async function addOwner(uid, org="default") {
  if (!uid) throw new Error("Falta UID");
  await db.doc(`orgs/${org}/members/${uid}`).set({
    role: "owner",
    active: true,
    orgId: org,
    createdAt: F.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ owner creado: uid=${uid}, org=${org}`);
}

async function setSettings(org="default", emails=[], domain="") {
  const payload = { workerAllowlist: emails };
  if (domain) payload.workerDomain = domain;
  await db.doc(`orgs/${org}/settings`).set(payload, { merge: true });
  console.log(`✓ settings actualizados: allowlist=${emails.length}, domain=${domain || "(sin dominio)"}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "owner") {
      const uid = args[0]; const org = args[1] || "default";
      await addOwner(uid, org);
    } else if (cmd === "settings") {
      const org = args[0] || "default";
      const idx = args.indexOf("--domain");
      let emails = [];
      let domain = "";
      if (idx >= 0) {
        domain = args[idx+1] || "";
        emails = args.slice(1, idx);
      } else {
        emails = args.slice(1);
      }
      await setSettings(org, emails, domain);
    } else {
      console.log(`USO:
  node scripts/firestore-tools.mjs owner <UID> [org]
  node scripts/firestore-tools.mjs settings [org] [email1 email2 ...] [--domain <dominio>]

Variables:
  SA   ruta al serviceAccount.json (default ./serviceAccount.json)
`);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();

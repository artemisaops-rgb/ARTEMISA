const admin = require("firebase-admin");
const sa = require("../serviceAccount.json");            // <- existe en la raíz
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const F = admin.firestore.FieldValue;

async function addOwner(uid, org="default") {
  if (!uid) throw new Error("Falta UID");
  await db.doc(`orgs/${org}/members/${uid}`).set({
    role: "owner", active: true, orgId: org, createdAt: F.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ owner creado: uid=${uid}, org=${org}`);
}

async function setSettings(org="default", allow=[], domain="") {
  const payload = { workerAllowlist: allow };
  if (domain) payload.workerDomain = domain;
  await db.doc(`orgs/${org}/settings`).set(payload, { merge: true });
  console.log(`✓ settings actualizados: org=${org}`);
}

async function backfill(org="default") {
  for (const col of ["products","inventoryItems"]) {
    const snap = await db.collection(col).get();
    let n = 0, batch = db.batch();
    for (const d of snap.docs) {
      const data = d.data() || {};
      if (!Object.prototype.hasOwnProperty.call(data, "orgId")) {
        batch.update(d.ref, { orgId: org }); n++;
        if (n % 450 === 0) { await batch.commit(); batch = db.batch(); }
      }
    }
    if (n % 450 !== 0 && n > 0) await batch.commit();
    console.log(`✓ ${col}: ${n} documento(s) parchados con orgId=${org}`);
  }
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "owner")     return addOwner(args[0], args[1] || "default");
    if (cmd === "settings")  return setSettings(args[0] || "default", args.slice(1), "");
    if (cmd === "backfill")  return backfill(args[0] || "default");
    console.log(`USO:
  node scripts/firestore-tools.js owner <UID> [org]
  node scripts/firestore-tools.js settings [org] [email1 email2 ...]
  node scripts/firestore-tools.js backfill [org]`);
  } catch (e) { console.error(e); process.exit(1); }
})();

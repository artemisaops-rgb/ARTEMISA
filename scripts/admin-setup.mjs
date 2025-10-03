import fs from "fs";
import admin from "firebase-admin";

const ORG_ID    = process.env.ORG_ID || "default";
const ALLOW     = (process.env.ALLOW_EMAILS || "").split(",").map(s=>s.trim()).filter(Boolean);
const OWNER_UID = process.env.OWNER_UID || "";

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccount.json";
if (!fs.existsSync(saPath)) throw new Error("serviceAccount.json no existe: " + saPath);

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath,"utf8")))
});
const db = admin.firestore();

async function main(){
  // orgs/{ORG_ID}/settings/main
  await db.doc(`orgs/${ORG_ID}/settings/main`).set({
    workerAllowlist: admin.firestore.FieldValue.arrayUnion(...ALLOW),
    workerDomain: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  if (OWNER_UID) {
    await db.doc(`orgs/${ORG_ID}/members/${OWNER_UID}`).set({
      role: "owner", active: true, orgId: ORG_ID, updatedAt: Date.now()
    }, { merge: true });

    // perfil cliente (por si miras "Mi perfil" desde esa cuenta)
    await db.doc(`customers/${OWNER_UID}`).set({
      orgId: ORG_ID, displayName: null, email: null, photoURL: null,
      points: 0, stampsProgress: 0, totalStamps: 0, freeCredits: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  console.log(`✓ Settings / members sembrados en org '${ORG_ID}'.`);
}
main().catch(e => { console.error(e); process.exit(1); });

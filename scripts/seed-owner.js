const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const EMAIL = process.env.EMAIL;
const ORGID = process.env.ORGID || "artemisa";
const SA_PATH = process.env.SA_PATH || path.join(process.cwd(), "serviceAccount.json");

if (!EMAIL) { console.error("Falta EMAIL"); process.exit(1); }
if (!fs.existsSync(SA_PATH)) { console.error("No existe serviceAccount.json en: "+SA_PATH); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

(async () => {
  // 1) Buscar UID por email en Auth
  const user = await admin.auth().getUserByEmail(EMAIL);
  const uid = user.uid;

  // 2) Miembro owner
  const memberRef = db.doc(`orgs/${ORGID}/members/${uid}`);
  await memberRef.set({
    email: EMAIL,
    role: "owner",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 3) Customer base (para sellos/canje)
  const customerRef = db.doc(`customers/${uid}`);
  await customerRef.set({
    orgId: ORGID,
    email: EMAIL,
    displayName: user.displayName || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`OK ✔ Owner + Customer creados/actualizados para ${EMAIL} (uid: ${uid})`);
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });

import admin from "firebase-admin";
import { readFileSync } from "fs";

const EMAIL = process.env.EMAIL;                  // dueño a convertir en owner
const ORGID = process.env.ORGID || "artemisa";   // tu org
const SA_PATH = process.env.SA_PATH;             // ruta ABSOLUTA al serviceAccount.json

if (!EMAIL) throw new Error("Set EMAIL env var (correo del owner)");
if (!SA_PATH) throw new Error("Set SA_PATH env var (ruta al serviceAccount.json)");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SA_PATH, "utf8"))),
});

const auth = admin.auth();
const db = admin.firestore();

const user = await auth.getUserByEmail(EMAIL);

// Claims + membresía
await auth.setCustomUserClaims(user.uid, { orgId: ORGID, role: "owner" });
await auth.revokeRefreshTokens(user.uid); // para que se apliquen al re-login

await db.doc(`orgs/${ORGID}/members/${user.uid}`).set(
  {
    role: "owner",
    at: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

// settings/{ORGID} (algunas pantallas lo leen al entrar)
await db.doc(`settings/${ORGID}`).set(
  {
    orgId: ORGID,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

// (opcional) doc del owner en customers
await db.doc(`customers/${user.uid}`).set(
  {
    orgId: ORGID,
    email: user.email || null,
    displayName: user.displayName || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

console.log(`OK: ${EMAIL} => role=owner, org=${ORGID}. Cierra sesión y vuelve a entrar.`);
process.exit(0);

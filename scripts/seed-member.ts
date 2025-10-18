// public/scripts/seed-member.ts
/* eslint-disable no-console */
import { existsSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/** ======= CLI flags / env helpers ======= */
function flag(name: string, short?: string) {
  const idx = process.argv.findIndex(
    (a) => a === `--${name}` || (short ? a === `-${short}` : false)
  );
  return idx >= 0 ? String(process.argv[idx + 1] || "") : "";
}

const ORG_ID =
  process.env.ORG_ID?.trim() ||
  flag("org", "o") ||
  "artemisa"; // default

const EMAIL = (process.env.EMAIL || flag("email", "e") || "").trim();
const UID_ENV = (process.env.UID || flag("uid", "u") || "").trim();

const ROLE_RAW = (process.env.ROLE || flag("role", "r") || "owner")
  .toLowerCase()
  .trim();
const ROLE = (["owner", "worker", "client"].includes(ROLE_RAW)
  ? ROLE_RAW
  : "owner") as "owner" | "worker" | "client";

/** ======= Firebase Admin boot ======= */
if (getApps().length === 0) {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccount.json";
  if (!existsSync(credPath)) {
    console.error(
      "Falta serviceAccount.json o GOOGLE_APPLICATION_CREDENTIALS.\n" +
        "→ Descarga el JSON de servicio desde Firebase Console y apunta la variable:\n" +
        "   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json"
    );
    process.exit(1);
  }
  initializeApp({ credential: applicationDefault() });
}

const db = getFirestore();
const auth = getAuth();

/** ======= Helpers ======= */
function usageAndExit() {
  console.error(
    [
      "Uso:",
      "  EMAIL o UID son obligatorios (al menos uno).",
      "",
      "  Por variables de entorno:",
      "    ORG_ID=artemisa ROLE=worker EMAIL=\"demo@correo.com\" ts-node public/scripts/seed-member.ts",
      "    ORG_ID=artemisa ROLE=owner  UID=\"<uid>\"            ts-node public/scripts/seed-member.ts",
      "",
      "  O por flags:",
      "    ts-node public/scripts/seed-member.ts --org artemisa --role worker --email demo@correo.com",
      "    ts-node public/scripts/seed-member.ts --org artemisa --role owner  --uid <uid>",
      "",
      "Roles válidos: owner | worker | client",
    ].join("\n")
  );
  process.exit(1);
}

if (!EMAIL && !UID_ENV) usageAndExit();

async function resolveUser() {
  // 1) Con UID (preferente)
  if (UID_ENV) {
    try {
      const u = await auth.getUser(UID_ENV);
      return {
        uid: u.uid,
        email: u.email || EMAIL || null,
        displayName: u.displayName || null,
      };
    } catch {
      console.warn(
        `UID provisto (${UID_ENV}) no existe en Auth. Continuo con UID sin perfil.`
      );
      return { uid: UID_ENV, email: EMAIL || null, displayName: null };
    }
  }

  // 2) Sin UID → por EMAIL
  try {
    const u = await auth.getUserByEmail(EMAIL);
    return {
      uid: u.uid,
      email: u.email || EMAIL,
      displayName: u.displayName || null,
    };
  } catch {
    console.error(
      `No existe un usuario con EMAIL=${EMAIL} en Firebase Auth.\n` +
        `→ Inicia sesión una vez en la app con ese correo o créalo desde Firebase Auth.`
    );
    process.exit(1);
  }
}

/** ======= Main ======= */
async function run() {
  const user = await resolveUser();
  const { uid, email, displayName } = user;

  const payload = {
    orgId: ORG_ID,
    uid,
    role: ROLE,
    email: email || null,
    displayName: displayName || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Subcolección canónica usada por las rules/UI
  await db.doc(`orgs/${ORG_ID}/members/${uid}`).set(payload, { merge: true });

  // Colección plana (compat con código legado)
  await db.doc(`memberships/${uid}`).set(payload, { merge: true });

  console.log("✔ Miembro sembrado/actualizado:", {
    orgId: ORG_ID,
    uid,
    role: ROLE,
    email,
  });
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

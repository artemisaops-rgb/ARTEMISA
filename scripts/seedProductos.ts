/**
 * Node script para sembrar/normalizar un producto de prueba.
 * Ejecuta:  node scripts/seedProductos.ts
 */
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Toma config de import.meta.env si lo corres con ts-node, o pon valores aquí para Node:
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig as any);
const db = getFirestore(app);

async function main() {
  await setDoc(doc(db, "products", "demo-frappe-milo"), {
    nombre: "frappe de milo",
    price: 12000, // COP
    active: true,
    updatedAt: Date.now()
  }, { merge: true });

  console.log("✓ Seed listo");
}

main().catch(e => { console.error(e); process.exit(1); });

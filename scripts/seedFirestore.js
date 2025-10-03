// scripts/seedFirestore.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// ⚠️ Usa tu config real de Firebase (la misma que tienes en firebase.ts)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "artemisa-f65f0.firebaseapp.com",
  projectId: "artemisa-f65f0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  try {
    // INVENTARIO
    await setDoc(doc(db, "inventoryItems", "demo-1"), {
      stock: 50,
      name: "Pizza Margarita",
      price: 12000,
    });
    await setDoc(doc(db, "inventoryItems", "demo-2"), {
      stock: 30,
      name: "Hamburguesa Clásica",
      price: 18000,
    });
    await setDoc(doc(db, "inventoryItems", "demo-3"), {
      stock: 20,
      name: "Gaseosa 500ml",
      price: 5000,
    });

    // MENÚ
    await setDoc(doc(db, "menuItems", "demo-1"), {
      name: "Pizza Margarita",
      section: 1,
      price: 12000,
      taxRate: 0.19,
      isActive: true,
    });
    await setDoc(doc(db, "menuItems", "demo-2"), {
      name: "Hamburguesa Clásica",
      section: 1,
      price: 18000,
      taxRate: 0.19,
      isActive: true,
    });
    await setDoc(doc(db, "menuItems", "demo-3"), {
      name: "Gaseosa 500ml",
      section: 2,
      price: 5000,
      taxRate: 0.19,
      isActive: true,
    });

    console.log("✅ Datos insertados en Firestore");
  } catch (err) {
    console.error("❌ Error insertando datos:", err);
  }
}

seed();

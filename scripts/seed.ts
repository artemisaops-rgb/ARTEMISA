import { initializeApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = "artemisa-f65f0";
initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS as string) as any,
  projectId
});
const db = getFirestore();

async function main() {
  // --- inventoryItems (insumos) ---
  const items = [
    { id:"milo",    name:"Milo",   unit:"g",  stock:5000, min:500,  cost: 80,  category:"insumo" },
    { id:"leche",   name:"Leche",  unit:"ml", stock:10000,min:2000, cost: 0.2, category:"insumo" },
    { id:"hielo",   name:"Hielo",  unit:"g",  stock:20000,min:5000, cost: 0.01, category:"insumo" },
    { id:"cafe",    name:"Café",   unit:"g",  stock:3000, min:300,  cost: 0.3, category:"insumo" }
  ];
  for (const it of items) {
    await db.collection("inventoryItems").doc(it.id).set(it, { merge:true });
  }

  // --- products (producto sencillo con sección y tamaños opcionales) ---
  const productId = "frappe-cafe";
  await db.collection("products").doc(productId).set({
    name: "frappe de cafe",
    category: "frappes",
    active: true,
    sizes: [
      { id:"peque", label:"pequeño", price: 60000, iva:true },
      { id:"med",   label:"mediano", price: 70000, iva:true },
      { id:"gran",  label:"grande",  price: 80000, iva:true },
    ]
  }, { merge:true });

  // --- recipes (receta por producto) ---
  await db.collection("recipes").doc(productId).set({
    productId,
    components: [
      { itemId:"milo",  qty:40 },   // 40 g de milo
      { itemId:"leche", qty:180 },  // 180 ml de leche
      { itemId:"hielo", qty:200 }   // 200 g de hielo
    ]
  }, { merge:true });

  // --- sales ejemplo (1 venta de 3 frappes medianos) ---
  await db.collection("sales").add({
    total: 210000,
    method: "efectivo",
    status: "confirmed",
    createdAt: FieldValue.serverTimestamp(),
    lines: [
      { productId, productName:"frappe de cafe", sizeLabel:"mediano", qty:3, price:70000 }
    ]
  });

  console.log("Seed OK ✅");
}

main().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });

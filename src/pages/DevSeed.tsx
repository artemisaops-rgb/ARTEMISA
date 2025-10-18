// src/pages/DevSeed.tsx
import { useState } from "react";
import { db, getOrgId } from "@/services/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function DevSeed() {
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    setMsg("Sembrando...");

    const orgId = getOrgId();

    // Inventario base (colección correcta: inventoryItems)
    const lecheRef = await addDoc(collection(db, "inventoryItems"), {
      orgId,
      name: "Leche entera",
      unit: "ml",
      stock: 20000,
      minStock: 5000,
      targetStock: 15000,
      costPerUnit: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const miloRef = await addDoc(collection(db, "inventoryItems"), {
      orgId,
      name: "Milo",
      unit: "g",
      stock: 5000,
      minStock: 1000,
      targetStock: 3000,
      costPerUnit: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Producto con tamaños y receta por tamaño (propiedades correctas: name/price/recipe)
    await addDoc(collection(db, "products"), {
      orgId,
      name: "Frappe de café",
      category: "frappes",
      active: true,
      sizes: [
        { name: "Pequeño",  price: 6000,  recipe: { [miloRef.id]: 30, [lecheRef.id]: 150 } },
        { name: "Mediano",  price: 12000, recipe: { [miloRef.id]: 40, [lecheRef.id]: 200 } },
        { name: "Celestial",price: 15000, recipe: { [miloRef.id]: 60, [lecheRef.id]: 300 } },
      ],
      updatedAt: serverTimestamp(),
    });

    setMsg(
`Listo ✅

• Se crearon 2 insumos en inventoryItems (Leche, Milo).
• Se creó 1 producto en products con 3 tamaños y recetas.

Ahora:
1) Ve a "Menú" y agrega por tamaño.
2) Al pagar desde "Carrito", se descuentan insumos por receta.`
    );
  };

  return (
    <main className="p-4">
      <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4 max-w-xl">
        <h1 className="text-xl font-semibold">Sembrador (DevSeed)</h1>
        <p className="text-sm text-zinc-600">Crea inventario y un producto con receta por tamaño para pruebas.</p>
        <button onClick={run} className="px-4 py-2 rounded-xl bg-orange-600 text-white">
          Sembrar ejemplo
        </button>
        {msg && <pre className="text-xs whitespace-pre-wrap bg-zinc-50 border rounded p-3">{msg}</pre>}
      </div>
    </main>
  );
}

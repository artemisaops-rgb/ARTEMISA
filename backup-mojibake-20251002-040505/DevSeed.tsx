import { useState } from "react";
import { db } from "@/services/firebase";
import { addDoc, collection } from "firebase/firestore";

export default function DevSeed() {
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    setMsg("Sembrando...");

    // 1) Inventario base
    const miloRef = await addDoc(collection(db, "inventory"), {
      name: "milo",
      unit: "g",
      stock: 5000,
      min: 1000,
      category: "polvos",
      costPerUnit: 1,
    });
    const lecheRef = await addDoc(collection(db, "inventory"), {
      name: "leche",
      unit: "ml",
      stock: 20000,
      min: 5000,
      category: "líquidos",
      costPerUnit: 1,
    });

    // 2) Producto con tamaños y receta por tamaño
    await addDoc(collection(db, "products"), {
      name: "frappe de cafe",
      category: "frappes",
      active: true,
      sizes: [
        { label: "pequeño", price: 6000, recipe: { [miloRef.id]: 30, [lecheRef.id]: 150 } },
        { label: "Mediano", price: 12000, recipe: { [miloRef.id]: 40, [lecheRef.id]: 200 } },
        { label: "celestial", price: 15000, recipe: { [miloRef.id]: 60, [lecheRef.id]: 300 } },
      ],
      recipe: {}, // base vacía, se usan tamaños
    });

    setMsg(`Listo �o.

Inventario y producto de prueba creados.
Ve a Menú y añade por tamaño; al pagar, debe descontar stock por receta.`);
  };

  return (
    <main className="p-4">
      <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4 max-w-xl">
        <h1 className="text-xl font-semibold">Sembrador (DevSeed)</h1>
        <p className="text-sm text-zinc-600">Crea inventario, producto y receta por tamaño para pruebas.</p>
        <button onClick={run} className="px-4 py-2 rounded-xl bg-orange-600 text-white">
          Sembrar ejemplo
        </button>
        {msg && <pre className="text-xs whitespace-pre-wrap bg-zinc-50 border rounded p-3">{msg}</pre>}
      </div>
    </main>
  );
}

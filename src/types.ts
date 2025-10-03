// src/types.ts
export type Recipe = { [ingredientId: string]: number }; // gramos/ml/u por 1 unidad

export type ProductSize = {
  label: string;           // ej: "Pequeo", "Mediano", "Grande"
  price: number;           // precio de ese tamao
  recipe?: Recipe;         // receta especfica para ese tamao
};

export type Product = {
  id: string;
  name: string;
  price: number;           // precio base (si no hay tamaos)
  active: boolean;
  photoUrl?: string;
  category?: string;       // "frappes" | "coldbrew" | "bebidas calientes" | "comida"
  recipe?: Recipe;         // receta base (sin tamaos)
  sizes?: ProductSize[];   // variantes por tamao
};

export type CartItem = {
  id: string;              // si viene de size: productId:sizeLabel
  name: string;            // "Frappe de caf (Grande)"
  price: number;
  qty: number;
  recipe?: Recipe;         // receta efectiva del tem
};

export type Sale = {
  id?: string;
  createdAt: number;
  items: CartItem[];
  subtotal: number;
  payment: { method: "cash" | "card" | "other"; amount: number };
};


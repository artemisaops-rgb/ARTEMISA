export type Size = { id: string; label: string; price: number; iva: number; };
export type RecipeItem = { ingredientId: string; qty: number }; // u/g/ml segn bodega

export type Product = {
  id: string;
  name: string;
  category: string;            // "frappes" | "bebidas" | etc.
  sizes: Size[];
  recipeBySize?: Record<string, RecipeItem[]>; // key = size.id
  active?: boolean;
};

export type Ingredient = { id:string; name:string; unit:"u"|"g"|"ml"; min:number; stock:number };

export type CartLine = {
  productId:string;
  name:string;
  sizeId:string;
  sizeLabel:string;
  unitPrice:number;
  qty:number;
};






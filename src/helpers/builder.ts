export type Unit = "g" | "ml" | "u";
export type InventorySection = "Comida" | "Bebidas" | "Aseo" | "Maquinaria" | "Desechables" | "Otros";
export type InventoryItem = { id: string; name: string; unit?: Unit; costPerUnit?: number; section?: InventorySection; active?: boolean; };
export type Recipe = Record<string, number>;
export type SizeDef = { id: string; name: string; volumeMl: number; basePrice?: number; baseRecipe: Recipe; baseRecipeOrder?: string[]; };
export type BuilderLimits = { maxSyrups: number; maxToppings: number; stepMl: number; stepG: number; allowWhipped?: boolean; maxIceMl?: number; };
export type PriceRules =
  | { mode: "base_plus_addons"; basePriceBySize: Record<string, number>; addon: { syrupPer10ml: number; liquidPer50ml: number; toppingPerUnit: number; icePer50ml?: number; whippedPerUnit?: number; }; }
  | { mode: "cost_plus"; marginPct: number; minimumBySize: Record<string, number>; };
export type BuilderConfig = { orgId: string; sizes: SizeDef[]; limits: BuilderLimits; priceRules: PriceRules; kioskPin?: string; updatedAt?: any; };
export type Role = "liquid" | "sparkling" | "ice" | "syrup" | "topping" | "whipped" | "base" | "ignore";
const ROLE_RE = {
  ignore: /(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[ée]rmica|pitillos?|detergente|desinfectante|jab[oó]n)/i,
  ice: /(hielo|ice)/i, sparkling: /(t[oó]nica|tonica|soda|sparkling)/i,
  liquid: /(espresso|caf[eé]|cold ?brew|concentrado cold brew|leche(?! en polvo)|avena|milo|cacao|chocolate|vainilla|agua)/i,
  syrup: /(caramelo|syrup|sirope|jarabe|arequipe|dulce de leche|az[uú]car)/i,
  topping: /(oreo|galleta|cookies?)/i, whipped: /(crema batida|chantilly|whipped)/i, base: /(base frapp[eé]|base frappe|base)/i,
};
export function roleOf(name: string): Role {
  const n = (name || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (ROLE_RE.ignore.test(n)) return "ignore"; if (ROLE_RE.ice.test(n)) return "ice"; if (ROLE_RE.sparkling.test(n)) return "sparkling";
  if (ROLE_RE.syrup.test(n)) return "syrup"; if (ROLE_RE.topping.test(n)) return "topping"; if (ROLE_RE.whipped.test(n)) return "whipped"; if (ROLE_RE.base.test(n)) return "base"; return "liquid";
}
export function computeCost(recipe: Recipe, invMap: Record<string, InventoryItem>) {
  return Object.entries(recipe).reduce((sum, [ing, q]) => sum + Number(invMap[ing]?.costPerUnit || 0) * Number(q || 0), 0);
}
export function mergeRecipes(base: Recipe, extra: Recipe) {
  const out: Recipe = { ...base };
  for (const [k, v] of Object.entries(extra)) { const cur = Number(out[k] || 0); out[k] = Math.max(0, cur + Number(v || 0)); }
  return out;
}

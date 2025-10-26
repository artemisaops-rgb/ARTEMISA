// src/helpers/frappe.ts
export type VizKind = "liquid" | "ice" | "syrup" | "foam" | "topping" | "sparkling";
export type Unit = "g" | "ml" | "u";

export type VizItem = {
  id?: string;
  type: VizKind;
  name: string;
  amount: number;
  unit?: Unit;
  color?: string;
  opacity?: number;
  density?: number; // g→ml (opcional)
};

export type LayerInfo = {
  id: string;
  color: string;
  opacity: number;
  height: number; // 0..1
};

/* ---------------- utils ---------------- */
const normalize = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function fixText(s: string): string {
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

const DEFAULT_LIQUID = "#e6d7bf"; // latte beige, agradable por defecto

// utilería a ignorar en la vista
const IGNORE_RE =
  /(agitadores|bolsas|filtros?|servilletas|tapas?|toallas|manga t[ée]rmica|pitillos|popotes|sorbetes|vaso( de| de)?|cups?|straws?|desechables?)/;

// reglas de color (orden importa)
const COLOR_RULES: Array<[RegExp, string]> = [
  [/(espresso|caf(e|é)|cold ?brew)/, "#4B2E1E"],
  [/leche condensada/, "#f1e3c9"],
  [/(leche(?! en polvo)|avena|almendra|soya|soja|vegetal)/, "#F7F3E8"],
  [/(chocolate blanco)/, "#fff1e2"],
  [/(milo|cacao|chocolate(?!.*blanco)|oscuro|negro)/, "#5b3a2f"],
  [/(caramelo|arequipe|dulce de leche)/, "#C17A39"],
  [/vainilla/, "#E8D7B5"],
  [/(fresa|strawberry|frutilla)/, "#F36B82"],
  [/(menta|mint)/, "#97E2C8"],
  [/matcha/, "#7BB661"],
  [/(t[oó]nica|tonica|soda|agua mineral|agua con gas|sparkling)/, "#9ad5ff"],
  [/\bagua\b/, "#9ad5ff"],
];

const OPACITY_HINTS: Array<[RegExp, number]> = [
  [/(t[oó]nica|soda|sparkling|agua)/, 0.85],
  [/(leche|avena|almendra|condensada|vainilla|matcha)/, 0.98],
  [/(espresso|caf(e|é)|chocolate)/, 0.95],
];

// color helpers para *blend* suave al compactar capas
const hexToRgb = (h: string) => {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbToHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");
const blend = (c1: string, c2: string, w1: number, w2: number) => {
  const a = hexToRgb(c1),
    b = hexToRgb(c2);
  const t = Math.max(1e-6, w1 + w2);
  return rgbToHex((a.r * w1 + b.r * w2) / t, (a.g * w1 + b.g * w2) / t, (a.b * w1 + b.b * w2) / t);
};

/* --------------- clasificación --------------- */
export function classify(src: string | VizItem): { kind: VizKind; color: string; opacity?: number } {
  const name = typeof src === "string" ? src : src.name || "";
  const n = normalize(name);
  const explicitKind: VizKind | undefined = typeof src === "string" ? undefined : src.type;
  const explicitColor: string | undefined = typeof src === "string" ? undefined : src.color;
  const explicitOpacity: number | undefined = typeof src === "string" ? undefined : src.opacity;

  let kind: VizKind =
    explicitKind ||
    (n.includes("hielo")
      ? "ice"
      : /(jarabe|syrup|endulzante|caramelo|arequipe|dulce|sirope)/.test(n)
      ? "syrup"
      : /(t[oó]nica|tonica|soda|agua mineral|agua con gas|sparkling|\bagua\b)/.test(n)
      ? "sparkling"
      : /(crema batida|chantilly|whipped|espuma)/.test(n)
      ? "foam"
      : /(oreo|galleta|cookies?)/.test(n)
      ? "topping"
      : /(base frapp|leche en polvo|base en polvo)/.test(n)
      ? "foam" // “base/polvo” no debe pintar capa
      : "liquid");

  // color por reglas
  let color = explicitColor || DEFAULT_LIQUID;
  for (const [re, c] of COLOR_RULES) {
    if (re.test(n)) {
      color = c;
      break;
    }
  }

  // opacidad por hints
  let opacity = explicitOpacity;
  if (opacity == null) {
    for (const [re, o] of OPACITY_HINTS) {
      if (re.test(n)) {
        opacity = o;
        break;
      }
    }
  }

  return { kind, color, opacity };
}

/* --------------- capas --------------- */
export function asLayers(items: VizItem[]) {
  // enrich + filtrar utilería
  const enriched = (items || [])
    .map((i) => {
      const { kind, color, opacity } = classify(i);
      return { ...i, kind, color, opacity, _n: normalize(i.name) };
    })
    .filter((i) => !IGNORE_RE.test(i._n));

  // volumen efectivo (solo líquidos / sparkling). Polvos/base no pintan.
  const volumeOf = (i: any): number => {
    if (!(i.kind === "liquid" || i.kind === "sparkling")) return 0;
    const amt = Math.max(0, Number(i.amount || 0));
    if (i.unit === "ml") return amt;
    if (i.unit === "g") {
      if (/(polvo|powder|base)/.test(i._n)) return 0;
      return amt * (typeof i.density === "number" ? i.density || 0 : 1);
    }
    if (i.unit === "u" && /(espresso|shot)/.test(i._n)) return 30 * amt;
    return 0;
  };

  // líquidos en orden + coalesce de contiguos con misma “clave”
  type Seg = { id: string; nameKey: string; color: string; opacity: number; vol: number; kind: VizKind };
  const segments: Seg[] = [];
  for (const i of enriched) {
    if (i.kind !== "liquid" && i.kind !== "sparkling") continue;
    const vol = volumeOf(i);
    if (vol <= 0) continue;
    const key = i._n.replace(/\s+/g, "");
    const prev = segments[segments.length - 1];
    if (prev && prev.nameKey === key && prev.kind === i.kind) {
      // —— unir con el anterior (evita franjas finas duplicadas)
      const blended = blend(prev.color, i.color, prev.vol, vol);

      // TS-safe (sin isFinite sobre undefined)
      const opPrev = typeof prev.opacity === "number" ? prev.opacity : 1;
      const opCurr = typeof i.opacity === "number" ? i.opacity : i.kind === "sparkling" ? 0.9 : 1;
      const opMix = (opPrev * prev.vol + opCurr * vol) / (prev.vol + vol);

      prev.vol += vol;
      prev.color = blended;
      prev.opacity = opMix;
    } else {
      segments.push({
        id: i.id || cryptoId(),
        nameKey: key,
        color: i.color || DEFAULT_LIQUID,
        opacity: typeof i.opacity === "number" ? i.opacity : i.kind === "sparkling" ? 0.9 : 1,
        vol,
        kind: i.kind,
      });
    }
  }

  const total = segments.reduce((s, x) => s + x.vol, 0) || 1;

  // capas base
  let layers: LayerInfo[] = segments.map((s) => ({
    id: s.id,
    color: s.color,
    opacity: s.opacity,
    height: Math.max(0, s.vol / total),
  }));

  // compactar capas muy delgadas para un look más limpio
  layers = compactLayers(layers, 0.04); // <4% se fusiona

  // hielo: aproximación/clamp
  const iceItems = enriched.filter((i) => i.kind === "ice");
  const rawIce =
    iceItems.length === 0
      ? 0
      : iceItems.reduce((acc, i) => {
          const amt = Math.max(0, Number(i.amount || 0));
          if (i.unit === "u") return acc + amt;
          if (i.unit === "ml" || i.unit === "g") return acc + amt / 50;
          return acc + 1;
        }, 0);
  const iceCount = Math.max(0, Math.min(22, Math.round(rawIce)));

  // drizzles para animación
  const syrups = enriched.filter((i) => i.kind === "syrup");

  // fuerza de burbujas = vol sparkling / total
  const sparkVol = enriched.filter((i) => i.kind === "sparkling").reduce((s, i) => s + volumeOf(i), 0);
  const sparklingStrength = Math.max(0, Math.min(1, sparkVol / (total || 1)));

  return { layers, iceCount, syrups, sparklingStrength };
}

/* -------- helpers internos -------- */
const cryptoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `L${Math.random().toString(36).slice(2)}`;

function compactLayers(src: LayerInfo[], min = 0.05): LayerInfo[] {
  if (src.length <= 1) return src;
  let arr = [...src];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].height >= min || arr.length <= 2) continue;
      const target = i > 0 ? i - 1 : i + 1;
      const mix = blend(arr[target].color, arr[i].color, arr[target].height, arr[i].height);
      arr[target] = {
        ...arr[target],
        color: mix,
        height: arr[target].height + arr[i].height,
        opacity:
          (arr[target].opacity * arr[target].height + arr[i].opacity * arr[i].height) /
          (arr[target].height + arr[i].height),
      };
      arr.splice(i, 1);
      changed = true;
      break;
    }
  }
  return arr;
}

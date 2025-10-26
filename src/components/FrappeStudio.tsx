// src/components/FrappeStudio.tsx
import React from "react";
import type { VizItem, VizKind } from "@/helpers/frappe";
import { fixText } from "@/helpers/frappe";
import { motion, AnimatePresence } from "framer-motion";

/** --- utilidades de color por VizKind --- */
const colorFor = (t?: VizKind) => {
  switch (t) {
    case "sparkling": return "#cfe9ff";
    case "ice":       return "#e7f5ff";
    case "syrup":     return "#cc8a2e";
    case "topping":   return "#2f2f2f";
    case "liquid":
    default:          return "#d9c7a2";
  }
};

export default function FrappeStudio({
  open,
  onClose,
  items,
  sizeName,
  productName,
  onFinish,
  celebrate,
}: {
  open: boolean;
  onClose: () => void;
  items: VizItem[];
  sizeName: string;
  productName: string;
  onFinish: () => void;
  celebrate: boolean;
}) {
  const [step, setStep] = React.useState<number>(-1);
  const timerRef = React.useRef<number | null>(null);

  // Solo ingredientes con amount > 0
  const script = React.useMemo(() => (items || []).filter((it) => (it.amount ?? 0) > 0), [items]);

  const durationFor = (t?: VizKind) =>
    t === "syrup" ? 620 : t === "ice" || t === "topping" ? 540 : 820;

  const playFrom = React.useCallback(
    (startIndex: number) => {
      if (script.length === 0) return;
      const run = (idx: number) => {
        if (idx >= script.length) {
          setStep(script.length - 1);
          return;
        }
        setStep(idx);
        timerRef.current = window.setTimeout(
          () => run(idx + 1),
          durationFor(script[idx]?.type)
        ) as unknown as number;
      };
      if (timerRef.current) window.clearTimeout(timerRef.current);
      run(startIndex);
    },
    [script]
  );

  React.useEffect(() => {
    if (!open) return;
    setStep(-1);
    playFrom(0);
  }, [open, items, playFrom]);

  React.useEffect(() => {
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);

  if (!open) return null;

  // Elementos mostrados hasta el paso actual
  const shown = script.slice(0, Math.max(0, step + 1));

  return (
    <div
      className="fixed inset-0 z-[95]"
      role="dialog"
      aria-label="Frappe Studio"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Fondo estilo Freezeria (minimal) */}
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#5a3be9 0%,#6042ef 35%,#3ca9ff 100%)" }} />
        <div className="absolute inset-0 opacity-20" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 6px, transparent 6px 12px)" }} />
        <div className="absolute left-0 right-0 top-[46%] h-3 bg-gradient-to-b from-slate-400 to-slate-700 shadow-lg" />
      </div>

      {/* Cuerda superior y mini tickets ficticios */}
      <div className="absolute left-4 right-4 top-4 h-3 bg-slate-900/70 rounded-full" />
      <div className="absolute left-1/2 -translate-x-1/2 top-8 w-44 h-9 rounded bg-white/70 backdrop-blur-sm shadow" />

      {/* Contenido central */}
      <div className="absolute inset-x-0 top-[15%] bottom-[22%] flex items-center justify-center">
        <div className="relative w-[900px] max-w-[94vw] h-[470px]">
          {/* Copa minimalista al centro */}
          <div className="absolute left-1/2 -translate-x-1/2 top-2">
            <Cup items={shown} />
          </div>

          {/* Ticket a la derecha */}
          <div className="absolute right-2 top-2 w-[270px]">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-900/60"
              style={{ filter: "drop-shadow(0 6px 24px rgba(0,0,0,.35))" }}
            >
              <div className="bg-pink-200 py-2 px-3 border-b-4 border-slate-900/40">
                <div className="flex items-center justify-between">
                  <div className="font-black text-slate-900/90 text-xl tracking-tight">O2</div>
                  <div className="text-slate-700 font-medium">{sizeName?.[0] ?? "M"}</div>
                </div>
                <div className="h-1 bg-gradient-to-r from-white/70 to-pink-300/70 rounded" />
              </div>

              <div className="bg-white/95 max-h-[260px] overflow-auto">
                <ul className="divide-y">
                  <AnimatePresence initial={false}>
                    {shown.map((it, i) => {
                      const color = colorFor(it.type as VizKind | undefined);
                      return (
                        <motion.li
                          key={`${it.name}-${i}`}
                          className="px-3 py-2 flex items-center gap-2 text-sm"
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                        >
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
                          <span className="flex-1 truncate">{fixText(it.name)}</span>
                          <span className="tabular-nums text-slate-600">
                            {it.amount}{it.unit}
                          </span>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>

              <div className="bg-white px-3 py-2 border-t-4 border-slate-900/40 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Producto</span>
                  <span className="font-semibold truncate">{fixText(productName)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tamaño</span>
                  <span className="font-semibold">{sizeName}</span>
                </div>
              </div>
            </div>
          </div>

          {celebrate && <Confetti />}
        </div>
      </div>

      {/* Barra inferior tipo arcade */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 w-[980px] max-w-[96vw]">
        <div className="rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-4 border-black/30">
          <div className="flex items-center justify-between bg-slate-900/90 px-4 py-3">
            <div className="text-white font-black tracking-wider text-sm opacity-80">PREVIEW</div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-6 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-900 font-extrabold tracking-wide shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]"
                onClick={onFinish}
              >
                FINISH ✓
              </button>
              <button
                className="px-4 py-3 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold"
                onClick={onClose}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ================== Copa minimalista (sin canvas) ================== */
function Cup({ items }: { items: VizItem[] }) {
  // Solo “capas” (liquid/sparkling) determinan altura; el resto se pinta overlay.
  const liquids = items.filter((x) => x.type === "liquid" || x.type === "sparkling");
  const overlays = items.filter((x) => x.type !== "liquid" && x.type !== "sparkling");

  // Volumen aproximado para altura (ml y g ~ equivalentes; u -> 10)
  const vol = (it: VizItem) => {
    const a = Number(it.amount || 0);
    if (it.unit === "u") return a * 10;
    return a;
  };
  const totalVol = Math.max(1, liquids.reduce((s, it) => s + vol(it), 0));

  // Dimensiones base
  const WIDTH = 220;
  const HEIGHT = 260;
  let acc = 0;

  return (
    <div className="relative" style={{ width: WIDTH, height: HEIGHT + 36 }}>
      {/* Vaso (rectángulo redondeado con leve trazo) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-9 rounded-[28px] border-4 bg-white/40 backdrop-blur-sm"
        style={{ width: WIDTH, height: HEIGHT, borderColor: "rgba(0,0,0,.2)" }}
      />

      {/* Capas de líquido */}
      {liquids.map((it, i) => {
        const h = Math.max(2, Math.round((vol(it) / totalVol) * (HEIGHT - 16)));
        const y = acc;
        acc += h;
        const btm = 9 + y;
        return (
          <div
            key={`layer-${i}`}
            className="absolute left-1/2 -translate-x-1/2 rounded-t-[22px]"
            style={{
              width: WIDTH - 8,
              height: h,
              bottom: btm,
              background: colorFor(it.type as VizKind | undefined),
              transition: "height 300ms ease, bottom 300ms ease",
              boxShadow: "inset 0 8px 14px rgba(255,255,255,.25), inset 0 -8px 14px rgba(0,0,0,.08)",
            }}
          />
        );
      })}

      {/* Overlays: jarabes en drizzles */}
      {overlays.filter(o => o.type === "syrup").map((it, i) => (
        <div
          key={`syrup-${i}`}
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: WIDTH - 28,
            height: 28,
            bottom: Math.min(HEIGHT - 8, 9 + acc - 6 - i * 6),
            background:
              `repeating-linear-gradient(90deg, ${colorFor("syrup")} 0 6px, transparent 6px 12px)`,
            opacity: .85,
            borderRadius: 10,
            filter: "drop-shadow(0 2px 0 rgba(0,0,0,.08))",
          }}
        />
      ))}

      {/* Overlays: hielo (cubitos) */}
      {overlays.filter(o => o.type === "ice").map((it, i) => {
        const count = Math.min(7, Math.max(2, Math.round(Number(it.amount || 0) / (it.unit === "u" ? 1 : 20))));
        return (
          <div key={`ice-${i}`} className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 9 + acc - 8 }}>
            {Array.from({ length: count }).map((_, k) => (
              <span
                key={k}
                className="inline-block w-6 h-6 m-0.5 rounded-md"
                style={{
                  background: "linear-gradient(180deg,#eef7ff,#cfe9ff)",
                  border: "2px solid #9ec7ff",
                  transform: `rotate(${(k % 2 ? -10 : 8)}deg)`,
                  display: "inline-block",
                }}
              />
            ))}
          </div>
        );
      })}

      {/* Overlays: whipped (tapita blanca) */}
      {overlays.some(o => o.type === "whipped") && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: 9 + acc + 6,
            width: WIDTH - 32,
            height: 30,
            background: "linear-gradient(180deg,#ffffff,#f6f6f6)",
            borderRadius: 9999,
            boxShadow: "0 4px 0 rgba(0,0,0,.08) inset",
          }}
        />
      )}

      {/* Overlays: topping (gránulos) */}
      {overlays.filter(o => o.type === "topping").map((it, i) => (
        <div key={`top-${i}`} className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 9 + acc + 14 }}>
          {Array.from({ length: Math.min(16, Math.max(6, Math.round(Number(it.amount || 0)))) }).map((_, k) => (
            <span
              key={k}
              className="inline-block w-1.5 h-1.5 rounded-full mx-1 my-0.5"
              style={{ background: colorFor("topping") }}
            />
          ))}
        </div>
      ))}

      {/* Base del vaso */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[150px] h-3 bg-black/20 rounded-full blur-[2px]" />
    </div>
  );
}

/* ========= confetti ========= */
function Confetti() {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 120 }).map((_, i) => {
        const left = 10 + Math.random() * 80;
        const size = 6 + Math.random() * 6;
        const dur = 700 + Math.random() * 700;
        const rot = Math.random() * 360;
        const colors = ["#34d399", "#60a5fa", "#f472b6", "#facc15", "#f97316", "#a78bfa"];
        const color = colors[i % colors.length];
        return { left, size, dur, rot, color, delay: Math.random() * 200 };
      }),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "22%",
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            borderRadius: 2,
            animation: `fall ${p.dur}ms ease-in forwards`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(340px) rotate(180deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

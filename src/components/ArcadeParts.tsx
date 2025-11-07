import React from "react";

/** Botella tipo dispensador con franjas (líquidos/sirops/gas) */
export function DispenserBottle({
  label,
  variant = "red",
  onPour,
}: {
  label: string;
  variant?: "red" | "blue" | "brown" | "orange" | "pink";
  onPour?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const stripe =
    variant === "red"    ? "linear-gradient(#fff 0 40%, #ef4444 40% 60%, #fff 60% 100%)"
  : variant === "blue"   ? "linear-gradient(#fff 0 40%, #3b82f6 40% 60%, #fff 60% 100%)"
  : variant === "brown"  ? "linear-gradient(#fff 0 40%, #8b5e34 40% 60%, #fff 60% 100%)"
  : variant === "orange" ? "linear-gradient(#fff 0 40%, #f59e0b 40% 60%, #fff 60% 100%)"
                         : "linear-gradient(#fff 0 40%, #ec4899 40% 60%, #fff 60% 100%)";

  return (
    <button className="fz-disp" onClick={onPour} title={label}>
      <span className="lid" />
      <span className="tube" />
      <span className="can" style={{ backgroundImage: stripe }} />
      <span className="lbl">{label}</span>
      <style>{`
        .fz-disp{position:relative; width:72px; height:128px; border:none; background:transparent; cursor:pointer}
        .fz-disp .lid{position:absolute; top:0; left:10px; right:10px; height:22px; border-radius:8px 8px 2px 2px;
          background:linear-gradient(#bcd3e3,#9fb8cb); box-shadow:inset 0 -2px 0 rgba(0,0,0,.15)}
        .fz-disp .tube{position:absolute; top:18px; left:34px; width:4px; height:34px; background:#8aa7c4}
        .fz-disp .can{position:absolute; top:46px; left:12px; right:12px; bottom:26px; border-radius:10px;
          background-size:100% 100%; border:1px solid #d7e4ee}
        .fz-disp .lbl{position:absolute; bottom:0; left:0; right:0; text-align:center; font-size:10px; font-weight:800; color:#083344}
      `}</style>
    </button>
  );
}

/** Arco de vertido con SVG (curvado) */
export function PourArc({
  from,
  to,
  color = "#8b5cf6",
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
}) {
  const cpx = (from.x + to.x) / 2;
  const cpy = Math.min(from.y, to.y) - 120;
  const d = `M ${from.x},${from.y} Q ${cpx},${cpy} ${to.x},${to.y}`;
  return (
    <svg className="fz-pour-arc" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}>
      <path d={d} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" className="flow" />
      <style>{`
        .fz-pour-arc{position:fixed; inset:0; pointer-events:none; z-index:6}
        .fz-pour-arc .flow{ stroke-dasharray:1400; stroke-dashoffset:1400; animation:pourflow .9s ease forwards; }
        @keyframes pourflow{ to{ stroke-dashoffset:0; opacity:0 } }
      `}</style>
    </svg>
  );
}

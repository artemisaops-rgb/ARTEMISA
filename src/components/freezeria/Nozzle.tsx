import React from "react";

export function Nozzle({ label, color="#0ea5e9", onPour }: {
  label: string; color?: string; onPour?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="fz-nozzle" onClick={onPour} draggable onDragStart={(e)=>e.dataTransfer.setData("text/label",label)}>
      <span className="spout" />
      <span className="stem" />
      <span className="tag">{label}</span>
      <style>{`
        .fz-nozzle{position:relative;min-width:100px;height:88px;border:1px solid #e2ebf2;background:#fff;
          border-radius:12px;display:grid;place-items:center;padding-top:8px;cursor:pointer}
        .fz-nozzle:active{transform:translateY(1px)}
        .fz-nozzle .spout{width:24px;height:12px;background:${color};border-radius:3px 3px 6px 6px}
        .fz-nozzle .stem{width:4px;height:24px;background:#9fb8cb;border-radius:2px}
        .fz-nozzle .tag{font-size:12px;font-weight:800;color:#0a2740}
      `}</style>
    </button>
  );
}

/* Chorro animado: usa CSS global .pour (en freezeria.theme.css) */
export function PourFx({ fromX, toX, color }: { fromX:number; toX:number; color:string; }){
  return (
    <div className="pour" style={
      { ["--from-x" as any]: `${fromX}px`, ["--to-x" as any]: `${toX}px`, ["--pour-color" as any]: color }
    }/>
  );
}

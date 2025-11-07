import React from "react";

export function Ticket({
  size,
  items,
  total,
  blendPct,
}: {
  size: string | null;
  items: { name: string; qty: number; unit?: string }[];
  total: string;
  blendPct: number;
}) {
  return (
    <div className="ticket">
      <div className="ticket-head">
        <div className="dot" />
        <div className="title">Orden</div>
        <div className="size">{size || "—"}</div>
      </div>

      <div className="meter-mini">
        <span>Chunky</span>
        <div className="bar"><span style={{ width: `${blendPct}%` }} /></div>
        <span>Smooth</span>
      </div>

      {items.length === 0 ? (
        <div className="muted">Aún no agregas ingredientes.</div>
      ) : (
        <ul className="ticket-list">
          {items.map((it, i) => (
            <li key={i}><span className="nm">{it.name}</span><span className="qt">{it.qty} {it.unit || "u"}</span></li>
          ))}
        </ul>
      )}

      <div className="price-row"><span>Total</span><b>{total}</b></div>

      <style>{`
        .ticket{
          background:#fff; border:1px solid #e6eef5; border-radius:20px; padding:12px;
          box-shadow:0 20px 40px rgba(10,39,64,.08); height:fit-content
        }
        .ticket-head{ display:grid; grid-template-columns:16px 1fr auto; gap:8px; align-items:center; margin-bottom:8px; }
        .dot{ width:12px; height:12px; border-radius:999px; background:#0a2740; }
        .title{ font-weight:900; }
        .size{ font-weight:900; color:#24c7b7; }
        .ticket-list{ list-style:none; padding:0; margin:8px 0; display:grid; gap:6px; }
        .ticket-list li{ display:flex; justify-content:space-between; border-bottom:1px dashed #e6eef5; padding-bottom:6px; }
        .ticket-list .nm{ font-weight:700; }
        .ticket-list .qt{ color:#6b8594; }
        .price-row{ display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:14px; }
        .meter-mini{ display:grid; grid-template-columns:auto 1fr auto; gap:6px; align-items:center; margin:8px 0; }
        .meter-mini .bar{ height:6px; border-radius:999px; background:#e2ebf2; overflow:hidden; }
        .meter-mini .bar span{ display:block; height:100%; background:linear-gradient(90deg,#f59e0b,#34d399); }
        .muted{ color:#6b8594; font-size:12px; }
      `}</style>
    </div>
  );
}

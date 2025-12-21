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
    <div className="ticket-hanger">
      <div className="clip" />
      <div className="ticket-paper">
        <div className="ticket-header">
          <span className="ticket-id">#001</span>
          <span className="ticket-role">CLIENTE</span>
        </div>

        <div className="ticket-body">
          <div className="ticket-row size-row">
            <span>TAMAÑO</span>
            <strong>{size || "—"}</strong>
          </div>

          <div className="ticket-divider" />

          <div className="ticket-items">
            {items.length === 0 ? (
              <div className="empty-msg">Vacío</div>
            ) : (
              items.map((it, i) => (
                <div key={i} className="item-row">
                  <span className="item-name">{it.name}</span>
                  <span className="item-qty">x{it.qty}</span>
                </div>
              ))
            )}
          </div>

          <div className="ticket-divider" />

          {blendPct > 0 && (
            <div className="ticket-row">
              <span>MEZCLA</span>
              <div className="mini-meter">
                <div className="fill" style={{ width: `${blendPct}%` }} />
              </div>
            </div>
          )}

          <div className="ticket-total">
            <span>TOTAL</span>
            <span className="price">{total}</span>
          </div>
        </div>
      </div>

      <style>{`
        .ticket-hanger {
          position: relative;
          margin-top: -10px; /* Pull up into the rail */
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));
          transform-origin: top center;
          animation: swing 2s ease-in-out infinite alternate;
          z-index: 100;
        }
        @keyframes swing { from { transform: rotate(-1deg); } to { transform: rotate(1deg); } }

        .clip {
          width: 40px; height: 12px;
          background: #94a3b8;
          margin: 0 auto;
          border-radius: 4px;
          border: 2px solid #475569;
          position: relative;
          z-index: 2;
        }

        .ticket-paper {
          background: #fffbeb; /* Cream paper */
          width: 160px;
          min-height: 200px;
          padding: 12px;
          border-radius: 2px;
          font-family: "Courier New", monospace;
          position: relative;
          top: -6px;
          clip-path: polygon(0 0, 100% 0, 100% 100%, 95% 98%, 90% 100%, 85% 98%, 80% 100%, 75% 98%, 70% 100%, 65% 98%, 60% 100%, 55% 98%, 50% 100%, 45% 98%, 40% 100%, 35% 98%, 30% 100%, 25% 98%, 20% 100%, 15% 98%, 10% 100%, 5% 98%, 0 100%);
        }

        .ticket-header {
          border-bottom: 2px dashed #cbd5e1;
          padding-bottom: 8px;
          margin-bottom: 8px;
          text-align: center;
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          color: #64748b;
          font-size: 12px;
        }

        .ticket-role { color: #000; }

        .ticket-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
          font-size: 13px;
        }

        .size-row { font-size: 14px; color: #4c2fb3; }

        .ticket-divider {
          height: 1px;
          background: repeating-linear-gradient(90deg, #cbd5e1 0 4px, transparent 4px 8px);
          margin: 8px 0;
        }

        .item-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        
        .empty-msg { text-align: center; color: #cbd5e1; font-style: italic; }

        .mini-meter {
          width: 60px; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;
        }
        .mini-meter .fill { height: 100%; background: #22c55e; }

        .ticket-total {
          margin-top: 12px;
          background: #fef3c7;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          font-weight: 900;
          border: 1px solid #fcd34d;
        }
        .price { color: #d97706; }
      `}</style>
    </div>
  );
}

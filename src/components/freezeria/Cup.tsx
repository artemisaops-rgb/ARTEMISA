import React, { useMemo } from "react";

type Props = {
  /** 0..100 porcentaje de llenado dentro del vaso */
  fillPct: number;
  /** muestra una espuma/blanco en la parte superior de la bebida */
  foam?: boolean;
  /** ancho base del svg (escala del vaso) */
  width?: number;
  /** activa animación de espiral/burbujas al licuar */
  mixing?: boolean;
};

export function Cup({ fillPct, foam = false, width = 220, mixing = false }: Props) {
  // ----- medidas base del “vaso”
  const w = width;                    // ancho total svg
  const h = Math.round(width * 1.18); // alto proporcional
  const cx = w / 2;                   // centro X
  const topY = Math.round(h * 0.19);  // y del aro superior
  const botY = Math.round(h * 0.92);  // y del fondo
  const rimRx = Math.round(w * 0.33); // radio X del aro
  const rimRy = Math.round(h * 0.065);// radio Y del aro

  // interiores (paredes internas del vaso, donde “vive” la bebida)
  const innerTopY = topY + 5;
  const innerBotY = botY - 8;
  const innerLeftTopX  = cx - rimRx + 6;
  const innerRightTopX = cx + rimRx - 6;
  const innerLeftBotX  = Math.round(cx - rimRx * 0.58);
  const innerRightBotX = Math.round(cx + rimRx * 0.58);

  // path que define el “recorte” del vaso (clip para la bebida)
  const cupClipPathD = `
    M ${innerLeftTopX},${innerTopY}
    L ${innerRightTopX},${innerTopY}
    L ${innerRightBotX},${innerBotY}
    Q ${cx},${innerBotY + 10} ${innerLeftBotX},${innerBotY}
    Z
  `;

  // nivel de bebida dentro del vaso
  const lvl = Math.max(0, Math.min(1, fillPct / 100));
  const drinkTop = Math.round(innerBotY - (innerBotY - innerTopY) * lvl);

  // ids únicos (evita colisiones si se renderiza varias veces)
  const ids = useMemo(() => {
    const base = Math.random().toString(36).slice(2);
    return {
      glass: `g-glass-${base}`,
      drink: `g-drink-${base}`,
      drinkHi: `g-drink-hi-${base}`,
      foam: `g-foam-${base}`,
      ice: `g-ice-${base}`,
      clip: `clip-${base}`,
      rim: `g-rim-${base}`,
      shine: `g-shine-${base}`,
      shadow: `g-shadow-${base}`,
    };
  }, []);

  // helper para cubitos tipo cristal
  function IceShard({ x, y, s = 1, r = 0 }: { x: number; y: number; s?: number; r?: number }) {
    const w = 9 * s, h = 7 * s;
    const p = `
      M ${x} ${y}
      l ${w*0.5} ${-h*0.4}
      l ${w*0.5} ${h*0.4}
      l ${-w*0.5} ${h*0.6}
      l ${-w*0.5} ${-h*0.6}
      Z
    `;
    return (
      <path
        d={p}
        transform={`rotate(${r}, ${x}, ${y})`}
        fill={`url(#${ids.ice})`}
        stroke="rgba(255,255,255,.65)"
        strokeWidth={0.6}
        opacity={0.9}
        className={mixing ? "ice jiggle" : "ice"}
      />
    );
  }

  // ---- cálculos seguros para evitar alturas negativas en <rect>
  const hiHeight = Math.max(0, innerBotY - drinkTop - 12);
  const hiY = hiHeight > 0 ? drinkTop + 8 : innerBotY; // si no hay altura, “baja” el y

  return (
    <div className="fz-cup-wrap" style={{ width: w, height: h + 12 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* ======= Definiciones ======= */}
        <defs>
          {/* vidrio lateral */}
          <linearGradient id={ids.glass} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#e6f0f7" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#d2e1ec" stopOpacity="0.55" />
          </linearGradient>
          {/* brillo vertical lateral */}
          <linearGradient id={ids.shine} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="50%"  stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* aro superior */}
          <linearGradient id={ids.rim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" />
            <stop offset="100%" stopColor="#b8c9d8" />
          </linearGradient>
          {/* sombra inferior */}
          <linearGradient id={ids.shadow} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8c9d8" stopOpacity="0" />
            <stop offset="100%" stopColor="#98aab9" stopOpacity="0.55" />
          </linearGradient>
          {/* bebida */}
          <linearGradient id={ids.drink} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ffd7e9" />
            <stop offset="40%"  stopColor="#ffc1df" />
            <stop offset="100%" stopColor="#e39ac5" />
          </linearGradient>
          {/* brillo suave de la bebida */}
          <linearGradient id={ids.drinkHi} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="40%"  stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* espuma superior */}
          <linearGradient id={ids.foam} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f4f7fb" />
          </linearGradient>
          {/* hielo cristal */}
          <linearGradient id={ids.ice} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#f7fbff" />
            <stop offset="50%"  stopColor="#e8f6ff" />
            <stop offset="100%" stopColor="#d7edf9" />
          </linearGradient>
          {/* recorte con la forma interna del vaso */}
          <clipPath id={ids.clip}>
            <path d={cupClipPathD} />
          </clipPath>
        </defs>

        {/* ======= BEBIDA ======= */}
        <g clipPath={`url(#${ids.clip})`}>
          {/* relleno de bebida */}
          <rect
            x={innerLeftTopX - 2}
            y={drinkTop}
            width={innerRightTopX - innerLeftTopX + 4}
            height={Math.max(0, innerBotY - drinkTop + 8)}
            fill={`url(#${ids.drink})`}
          />
          {/* brillo lateral – CLAMPED */}
          <rect
            x={innerLeftTopX + 4}
            y={hiY}
            width={Math.max(8, Math.round(w * 0.06))}
            height={hiHeight}
            fill={`url(#${ids.drinkHi})`}
            opacity={0.4}
          />

          {/* cubitos de hielo */}
          {Array.from({ length: Math.round(12 + 10 * lvl) }).map((_, i) => {
            const spanX = innerRightTopX - innerLeftTopX - 22;
            const rx = innerLeftTopX + 12 + ((i * 27 + 7) % Math.max(1, spanX));
            const spanY = Math.max(20, innerBotY - drinkTop - 24);
            const ry = drinkTop + 10 + ((i * 19 + 13) % spanY);
            const rot = (i * 31) % 360;
            const s = 0.85 + ((i % 5) * 0.05);
            return <IceShard key={i} x={rx} y={ry} s={s} r={rot} />;
          })}

          {/* espuma */}
          {foam && fillPct > 0 && (
            <>
              <ellipse
                cx={cx}
                cy={drinkTop + 4}
                rx={Math.round((innerRightTopX - innerLeftTopX) / 2.2)}
                ry={Math.max(6, Math.round(rimRy * 0.6))}
                fill={`url(#${ids.foam})`}
                opacity={0.95}
              />
              <path
                d={`M ${innerLeftTopX + 12},${drinkTop + 3}
                   C ${cx - 18},${drinkTop - 4} ${cx + 18},${drinkTop + 10} ${innerRightTopX - 12},${drinkTop + 2}`}
                stroke="#ffffff"
                strokeWidth={2}
                fill="none"
                opacity={0.8}
              />
            </>
          )}

          {/* espiral de licuado */}
          <g
            className={`swirl ${mixing ? "on" : ""}`}
            style={{ transformOrigin: `${cx}px ${(innerTopY + innerBotY) / 2}px` }}
            opacity={mixing ? 0.55 : 0}
          >
            {[0, 1, 2].map((k) => (
              <path
                key={k}
                d={`M ${innerLeftTopX + 6},${drinkTop + 12 + k * 10}
                   C ${cx - 10},${drinkTop + 34 + k * 12} ${cx + 12},${innerBotY - 26 - k * 12} ${innerRightTopX - 8},${innerBotY - 10 - k * 8}`}
                stroke="rgba(255,255,255,.45)"
                strokeWidth={6 - k}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </g>

          {/* burbujas */}
          {mixing &&
            Array.from({ length: 10 }).map((_, i) => {
              const spanW = Math.max(1, innerRightTopX - innerLeftTopX - 32);
              const x = innerLeftTopX + 16 + ((i * 29) % spanW);
              const y = innerBotY - 6 - (i * 8) % Math.max(20, innerBotY - drinkTop - 24);
              const r = 2 + (i % 3);
              return <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity={0.35} className="bubble" />;
            })}
        </g>

        {/* ======= VIDRIO ======= */}
        <path
          d={`
            M ${innerLeftTopX - 10},${innerTopY - 6}
            L ${innerRightTopX + 10},${innerTopY - 6}
            L ${innerRightBotX + 12},${innerBotY + 6}
            Q ${cx},${innerBotY + 18} ${innerLeftBotX - 12},${innerBotY + 6}
            Z
          `}
          fill={`url(#${ids.glass})`}
          stroke="#b9cde0"
          strokeWidth={1.2}
          opacity={0.95}
        />
        <path
          d={`
            M ${innerLeftTopX - 5},${innerTopY}
            L ${innerLeftTopX + 4},${innerTopY}
            L ${innerLeftBotX + 2},${innerBotY}
            Q ${cx - 5},${innerBotY + 6} ${innerLeftTopX - 5},${innerBotY}
            Z
          `}
          fill={`url(#${ids.shine})`}
          opacity={0.7}
        />
        <ellipse cx={cx} cy={topY} rx={rimRx} ry={rimRy} fill={`url(#${ids.rim})`} stroke="#a9bbc9" strokeWidth={1} />
        <ellipse cx={cx} cy={topY + 2} rx={rimRx - 6} ry={rimRy - 4} fill="#e9f1f7" stroke="#cad9e5" strokeWidth={1} />
        <ellipse cx={cx} cy={botY} rx={rimRx * 0.45} ry={rimRy * 0.65} fill={`url(#${ids.shadow})`} />
      </svg>

      <style>{`
        .fz-cup-wrap{ position:relative; filter: drop-shadow(0 12px 24px rgba(10,39,64,.18)); }
        .swirl.on{ animation: cupSpin 3.6s linear infinite; }
        @keyframes cupSpin{ to { transform: rotate(360deg); } }
        .bubble{ animation: rise 2.2s linear infinite; }
        @keyframes rise{ 0%{ transform: translateY(0); opacity:.25 } 100%{ transform: translateY(-30px); opacity:0 } }
        .ice.jiggle{ animation: jig .8s ease-in-out infinite; }
        @keyframes jig{ 0%,100%{ transform: translate(0,0) } 50%{ transform: translate(.6px,-.6px) } }
      `}</style>
    </div>
  );
}

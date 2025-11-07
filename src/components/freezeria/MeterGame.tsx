import React, { useEffect, useRef, useState } from "react";

export type MeterOutcome = "perfect" | "ok" | "fail";

export function MeterGame({
  title = "Acierta en verde y presiona",
  speed = 0.9,               // velocidad (px/ms)
  onResolve,
}: {
  title?: string;
  speed?: number;
  onResolve?: (outcome: MeterOutcome) => void;
}) {
  const [pos, setPos] = useState(0);  // 0..100
  const [dir, setDir] = useState<1 | -1>(1);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    const step = (t: number) => {
      if (!last.current) last.current = t;
      const dt = t - last.current;
      last.current = t;
      setPos(p => {
        let nx = p + dir * (dt * speed) / 10;
        if (nx >= 100) { nx = 100; setDir(-1); }
        if (nx <= 0)   { nx = 0;   setDir(1);  }
        return nx;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [dir, speed]);

  function resolve() {
    // Zonas: verde 45..55 (perfect), amarillo 38..62 (ok), resto fail
    const x = pos;
    const outcome: MeterOutcome =
      x >= 45 && x <= 55 ? "perfect" :
      x >= 38 && x <= 62 ? "ok"      : "fail";
    onResolve?.(outcome);
  }

  return (
    <div className="meter-wrap" role="group" aria-label="Juego del medidor">
      <div className="title">{title}</div>
      <div className="meter">
        <div className="track">
          <div className="zone red left" />
          <div className="zone yellow" />
          <div className="zone green" />
          <div className="zone yellow" />
          <div className="zone red right" />
          <div className="cursor" style={{ left: `calc(${pos}% - 8px)` }} />
        </div>
      </div>
      <button className="btn-go" onClick={resolve}>Añadir hielo</button>

      <style>{`
        .meter-wrap{ color:#fff; font-weight:800; user-select:none; }
        .title{ margin-bottom:8px; text-shadow:0 1px 1px rgba(0,0,0,.5) }
        .meter{ width:100%; }
        .track{ position:relative; height:20px; border-radius:10px; overflow:hidden;
          background:linear-gradient(90deg,#ef4444 0 20%, #f59e0b 20% 40%, #22c55e 40% 60%,
                                     #f59e0b 60% 80%, #ef4444 80% 100%);
          box-shadow:inset 0 1px 0 rgba(0,0,0,.3);
        }
        .cursor{ position:absolute; top:-6px; width:16px; height:32px; border-radius:999px;
          background:#fff; box-shadow:0 2px 7px rgba(0,0,0,.3); }
        .btn-go{ margin-top:10px; background:#22c55e; color:#fff; border:none; border-radius:10px; padding:10px 14px; box-shadow:0 3px 0 #148f44; }
      `}</style>
    </div>
  );
}

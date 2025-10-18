// src/components/AtlBackground.tsx
import React, { useEffect } from "react";

export default function AtlBackground() {
  // Evita doble montaje (StrictMode / cambios de ruta)
  if (typeof document !== "undefined" && document.getElementById("atl-bg-root")) {
    return null;
  }

  useEffect(() => {
    const el = document.getElementById("atl-bg-root");
    if (!el) return;

    const setDocHeight = () => {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight
      );
      el.style.setProperty("--atl-doc-h", `${h}px`);
    };

    setDocHeight();

    const ro = new ResizeObserver(setDocHeight);
    ro.observe(document.documentElement);
    ro.observe(document.body);
    window.addEventListener("resize", setDocHeight, { passive: true });
    window.addEventListener("scroll", setDocHeight, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setDocHeight);
      window.removeEventListener("scroll", setDocHeight);
    };
  }, []);

  return (
    <div id="atl-bg-root" aria-hidden>
      <div className="atl-bg base" />
      <div className="atl-bg wave-one" />
      <div className="atl-bg wave-two" />
      <div className="quartz q1" />
      <div className="quartz q2" />
      <div className="quartz q3" />

      <style>{`
        :root{
          --atl-navy:#0f2a47; --atl-ice:rgba(15,42,71,.18);
          --atl-azure:#7fe7ff; --atl-quartz:#c3fff1;
          --gold:#d4af37; --gold-2:#e3c455;
          --atl-doc-h: 100vh; /* se actualiza en runtime */
        }

        /* Asegura anclaje al árbol de la app */
        #root{ position: relative; }

        /* Contenedor del fondo: ANCLADO AL DOCUMENTO (no al viewport) */
        #atl-bg-root{
          position: absolute;
          inset: 0;
          height: var(--atl-doc-h);
          z-index: -10;
          pointer-events: none;
          transform: translateZ(0);
        }

        /* BASE: 2 radiales + 1 linear de relleno continuo
           - Sin 'transparent': usamos el MISMO color con alfa 0
           - El linear al final garantiza continuidad en TODA la altura
        */
        .atl-bg.base{
          position:absolute; inset:0; z-index:-3; pointer-events:none;
          background:
            radial-gradient(
              120% 85% at 50% -20%,
              rgba(127,231,255,.55) 0%,
              rgba(127,231,255,.30) 40%,
              rgba(127,231,255,.12) 70%,
              rgba(127,231,255,0) 100%
            ),
            radial-gradient(
              120% 90% at 50% 120%,
              rgba(195,255,241,.28) 0%,
              rgba(195,255,241,.16) 45%,
              rgba(195,255,241,.08) 70%,
              rgba(195,255,241,0) 100%
            ),
            /* RELLENO de fondo: azul muy suave continuo */
            linear-gradient(180deg, #eafaff 0%, #f6fbff 45%, #ffffff 100%);
          background-repeat: no-repeat, no-repeat, no-repeat;
          background-size: 160% 80%, 160% 80%, 100% 100%;
          background-position: center top, center bottom, center top;
        }

        /* Olas superiores (misma estética) */
        .atl-bg.wave-one, .atl-bg.wave-two{
          position:absolute; left:50%; transform:translateX(-50%); z-index:-2; pointer-events:none;
          width:1200px; height:260px; border-radius:120px; filter: blur(40px);
          background:linear-gradient(90deg, var(--atl-azure), var(--atl-quartz));
          will-change: transform;
        }
        .atl-bg.wave-one{ top:-120px; opacity:.5; }
        .atl-bg.wave-two{ top:-50px;  opacity:.35; }

        /* Cuarzos (misma estética) */
        @keyframes float { 0%{ transform:translateY(0)} 50%{ transform:translateY(-10px)} 100%{ transform:translateY(0)} }
        .quartz{
          position:absolute; z-index:-1; width:120px; height:120px; pointer-events:none;
          background:linear-gradient(135deg, var(--gold), var(--gold-2));
          clip-path: polygon(50% 0%, 80% 20%, 100% 60%, 60% 100%, 20% 80%, 0% 40%);
          filter: drop-shadow(0 30px 60px rgba(212,175,55,.25)); opacity:.35;
          animation: float 7s ease-in-out infinite;
        }
        .q1{ left:4%;  bottom:10%; transform:rotate(-12deg); }
        .q2{ right:8%; bottom:16%; transform:rotate(10deg); animation-duration:8s; }
        .q3{ left:12%; top:12%; width:90px; height:90px; transform:rotate(4deg); animation-duration:9s; }
      `}</style>
    </div>
  );
}

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
          --atl-navy: var(--bg-deep); 
          --atl-ice: rgba(0, 243, 255, 0.05);
          --atl-azure: var(--neon-cyan); 
          --atl-quartz: var(--neon-blue);
          --gold: var(--neon-gold); 
          --gold-2: #d4af37;
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
          background: var(--bg-deep);
        }

        /* BASE: Grid + Glows (Google Dark - Very Subtle) */
        .atl-bg.base{
          position:absolute; inset:0; z-index:-3; pointer-events:none;
          background:
            /* Grid - Barely visible */
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
          background-position: center top;
          opacity: 0.3;
        }

        /* Olas superiores (Neon Glows) - Subtle in Dark */
        .atl-bg.wave-one, .atl-bg.wave-two{
          position:absolute; left:50%; transform:translateX(-50%); z-index:-2; pointer-events:none;
          width:1200px; height:260px; border-radius:120px; filter: blur(80px);
          background:linear-gradient(90deg, var(--atl-azure), var(--atl-quartz));
          will-change: transform;
        }
        .atl-bg.wave-one{ top:-120px; opacity:0.04; }
        .atl-bg.wave-two{ top:-50px;  opacity:0.02; }

        /* Cuarzos (Floating Neon Shapes) */
        @keyframes float { 0%{ transform:translateY(0)} 50%{ transform:translateY(-10px)} 100%{ transform:translateY(0)} }
        .quartz{
          position:absolute; z-index:-1; width:120px; height:120px; pointer-events:none;
          background:linear-gradient(135deg, var(--gold), var(--gold-2));
          opacity:0.03; border-radius:30px; filter:blur(40px);
          animation: float 6s ease-in-out infinite;
        }
        .q1{ top:10%; left:10%; animation-delay:0s; }
        .q2{ top:40%; right:5%; width:80px; height:80px; background:var(--atl-azure); animation-delay:2s; }
        .q3{ bottom:15%; left:20%; width:150px; height:150px; background:var(--neon-pink); animation-delay:4s; }

        /* LIGHT MODE OVERRIDES - Restore visibility */
        html.light .atl-bg.base {
          background:
            radial-gradient(circle at 50% 0%, rgba(0, 102, 255, 0.05), transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(255, 0, 255, 0.02), transparent 50%);
          opacity: 1;
        }
        html.light .atl-bg.wave-one { opacity: 0.15; }
        html.light .atl-bg.wave-two { opacity: 0.10; }
        html.light .quartz { opacity: 0.15; filter: blur(50px); }
      `}</style>
    </div>
  );
}

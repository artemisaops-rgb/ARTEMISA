// src/pages/ClientStart.tsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/Auth";

export default function ClientStart() {
  const nav = useNavigate();
  const { logout, switchGoogleAccount } = useAuth();

  // Atajos de teclado: Enter -> builder, P -> perfil
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") nav("/builder");
      if (e.key.toLowerCase() === "p") nav("/cliente");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  return (
    <div
      className="min-h-[100dvh] relative overflow-hidden text-[var(--ink,#111827)]"
      style={{
        ["--paper" as any]: "#0b1020",
        ["--brand" as any]: "#24c7b7",
        ["--ink" as any]: "#e5e7eb",
      }}
    >
      {/* Fondo animado tipo juego */}
      <BackgroundFX />

      <div className="relative z-10 grid place-items-center min-h-[100dvh] px-6">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", damping: 22, stiffness: 220 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl shadow-2xl p-7 text-center space-y-6">
            {/* Logo / símbolo Artemisa */}
            <motion.div
              initial={{ rotate: -6, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="mx-auto w-24 h-24 rounded-2xl grid place-items-center text-3xl font-black"
              style={{ background: "var(--brand)", color: "white", boxShadow: "0 10px 30px rgba(36,199,183,.35)" }}
            >
              A
            </motion.div>

            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight">¡Bienvenido a Artemisa!</h1>
              <p className="text-sm text-slate-300">Elige tu aventura</p>
            </div>

            <div className="grid gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-primary h-12 text-base font-semibold animate-pulse-slow"
                onClick={() => nav("/builder")}
              >
                ▶ Armar mi bebida
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-ghost h-12 text-base font-semibold"
                onClick={() => nav("/cliente")}
                title="Progreso de fidelización"
              >
                ☻ Mi perfil
              </motion.button>
            </div>

            <p className="text-[12px] text-slate-300/80">
              Junta 10 compras y recibe una bebida pequeña <b>gratis</b>.
            </p>

            {/* Cuenta: cambiar / salir */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                className="btn btn-ghost h-9 text-sm"
                title="Forzar selector de Google"
                onClick={() => switchGoogleAccount("artemisa.ops@gmail.com")}
              >
                Cambiar de cuenta
              </button>
              <button
                className="btn btn-danger h-9 text-sm"
                onClick={logout}
              >
                Cerrar sesión
              </button>
            </div>

            <div className="text-[11px] text-slate-400/80">[Enter] Jugar · [P] Perfil</div>
          </div>
        </motion.div>
      </div>

      {/* Estilos mínimos */}
      <style>{`
        .btn { border-radius: 14px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); }
        .btn-primary { background: var(--brand); color: white; }
        .btn-ghost { background: rgba(255,255,255,.08); color: var(--ink); }
        .btn-danger { background: #ef4444; color: #fff; }
        .animate-pulse-slow { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.02); } }
      `}</style>
    </div>
  );
}

function BackgroundFX() {
  return (
    <>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1000px 500px at 20% 10%, rgba(36,199,183,.25), transparent), radial-gradient(900px 500px at 80% 90%, rgba(255,122,182,.18), transparent), linear-gradient(180deg, #0b1220 0%, #0b1020 100%)",
        }}
      />
      <AnimatePresence>
        {[...Array(14)].map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 0.25, y: [0, -12, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 4 + (i % 5), repeat: Infinity, delay: i * 0.2 }}
            className="absolute rounded-full"
            style={{
              width: 8 + (i % 5) * 6,
              height: 8 + (i % 5) * 6,
              left: `${(i * 7) % 100}%`,
              top: `${(i * 13) % 100}%`,
              background: i % 2 ? "rgba(36,199,183,.5)" : "rgba(255,255,255,.15)",
              filter: "blur(1px)",
            }}
          />
        ))}
      </AnimatePresence>
    </>
  );
}

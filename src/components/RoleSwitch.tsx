// src/components/RoleSwitch.tsx
import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import type { Role } from "@/types";

const Chip = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={[
      "px-2.5 h-7 rounded-full text-[12px] font-semibold transition border",
      active
        ? "bg-gradient-to-b from-[var(--neon-gold)] to-[#b8860b] text-black border-transparent shadow-[var(--glow-sm)]"
        : "bg-[var(--bg-card)] border-[var(--border-dim)] text-[var(--text-muted)] hover:bg-[var(--bg-deep)] hover:text-[var(--text-main)]",
    ].join(" ")}
  >
    {children}
  </button>
);

export default function RoleSwitch() {
  // ⚠️ TODOS los hooks van SIEMPRE arriba (sin returns antes)
  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { uiRole, setUiRole } = usePreviewRole();
  const loc = useLocation();
  const nav = useNavigate();

  // Sincroniza ?as= con el estado del conmutador (solo si eres owner real)
  useEffect(() => {
    if (realRole !== "owner") return;
    const sp = new URLSearchParams(loc.search);
    const qAs = sp.get("as") as Role | null;
    const normalized: Role = qAs === "client" || qAs === "worker" ? qAs : "owner";
    const current = uiRole ?? "owner";
    if (current !== normalized) setUiRole(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search, realRole]);

  const [devMode, setDevMode] = React.useState(false);

  // A partir de aquí ya puedes cortar la UI sin romper hooks
  if (realRole !== "owner") return null;

  const handleSet = (r: Role) => {
    setUiRole(r);

    const sp = new URLSearchParams(loc.search);
    if (r === "owner") sp.delete("as");
    else sp.set("as", r);
    const search = `?${sp.toString()}`;

    if (r === "client") {
      window.location.href = "/start" + search;
    } else if (r === "worker") {
      window.location.href = "/menu" + search;
    } else {
      // Owner: stay on current page (RoleGuard will handle restrictions)
      nav({ search }, { replace: true });
    }
  };

  const current = uiRole ?? "owner";
  const isOwnerMonitor = current === "owner";

  if (!devMode) {
    return (
      <button
        onClick={() => setDevMode(true)}
        className="fixed top-3 right-3 z-[60] w-8 h-8 rounded-full bg-[var(--bg-card)] border border-[var(--border-dim)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--neon-gold)] transition-colors shadow-lg"
        title="Activar Modo Programador"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 18l6-6-6-6" />
          <path d="M8 6l-6 6 6 6" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="
        fixed top-3 right-3 z-[60]
        rounded-full backdrop-blur-xl bg-[var(--bg-overlay)]
        border border-[var(--border-glow)] shadow-[var(--glow-xs)]
        pl-3 pr-2 py-1.5 flex items-center gap-2
      "
    >
      <button
        onClick={() => setDevMode(false)}
        className="text-[10px] font-bold text-[var(--neon-gold)] uppercase tracking-wider mr-1 hover:text-white"
        title="Salir de Modo Programador"
      >
        DEV MODE
      </button>
      <div className="w-[1px] h-4 bg-[var(--border-dim)] mx-1" />
      <Chip active={current === "client"} onClick={() => handleSet("client")}>Cliente</Chip>
      <Chip active={current === "worker"} onClick={() => handleSet("worker")}>Worker</Chip>
      <Chip active={isOwnerMonitor} onClick={() => handleSet("owner")}>Owner</Chip>
    </div>
  );
}

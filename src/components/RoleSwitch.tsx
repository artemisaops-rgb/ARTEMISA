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
      "px-2.5 h-7 rounded-full text-[12px] font-semibold transition",
      active
        ? "bg-gradient-to-b from-[var(--atl-azure)] to-[var(--atl-quartz)] text-[var(--atl-navy)] shadow-[0_8px_18px_rgba(0,200,255,.22)]"
        : "bg-white/90 border border-[var(--atl-ice)] text-slate-700 hover:bg-white",
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

  // A partir de aquí ya puedes cortar la UI sin romper hooks
  if (realRole !== "owner") return null;

  const setAsParam = (r: Role) => {
    const sp = new URLSearchParams(loc.search);
    if (r === "owner") sp.delete("as");
    else sp.set("as", r);
    nav({ search: `?${sp.toString()}` }, { replace: true });
  };

  const handleSet = (r: Role) => {
    setUiRole(r);
    setAsParam(r);
  };

  const current = uiRole ?? "owner";
  const isOwnerMonitor = current === "owner";

  return (
    <div
      className="
        fixed top-3 right-3 z-[60]
        rounded-full backdrop-blur-xl bg-[rgba(255,255,255,.85)]
        border border-[var(--atl-ice)] shadow-[0_14px_30px_rgba(10,39,64,.12)]
        pl-2 pr-2 py-1.5 flex items-center gap-2
      "
      title="Cambiar vista (solo UI, no afecta permisos)"
    >
      <span className="text-[11px] font-semibold text-slate-600">Vista</span>
      <Chip active={current === "client"} onClick={() => handleSet("client")}>Cliente</Chip>
      <Chip active={current === "worker"} onClick={() => handleSet("worker")}>Worker</Chip>
      <Chip active={isOwnerMonitor} onClick={() => handleSet("owner")}>Owner</Chip>
    </div>
  );
}

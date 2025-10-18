import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import { usePreviewRole } from "@/contexts/PreviewRole";

const Chip = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={[
      "px-2.5 h-7 rounded-full text-[12px] font-semibold transition",
      active
        ? "bg-gradient-to-b from-[var(--gold)] to-[var(--gold-2)] text-[var(--atl-navy)] shadow-[0_8px_18px_rgba(212,175,55,.28)]"
        : "bg-white/90 border border-[var(--atl-ice)] text-slate-700 hover:bg-white",
    ].join(" ")}
  >
    {children}
  </button>
);

export default function ModeSwitch() {
  const { user } = useAuth();
  const { realRole } = useRole(user?.uid);
  const { uiRole } = usePreviewRole(); // <- vista actual (client/worker/owner)
  const { mode, setMode } = useOwnerMode();

  const loc = useLocation();
  const nav = useNavigate();

  // Mostrar solo si eres Owner REAL y estás viendo la UI como Owner (monitor)
  // uiRole === null o "owner" => estás en Owner (monitor). Si es "worker" o "client", ocultar.
  const canShow = realRole === "owner" && (uiRole == null || uiRole === "owner");

  const setAsParam = (m: "control" | "monitor") => {
    const sp = new URLSearchParams(loc.search);
    sp.set("mode", m);
    nav({ search: `?${sp.toString()}` });
  };

  // Si cambias a vista Worker/Client, resetea el modo a monitor
  useEffect(() => {
    if (!canShow && mode !== "monitor") setMode("monitor");
  }, [canShow, mode, setMode]);

  if (!canShow) return null;

  return (
    <div
      className="
        fixed right-3 top-[56px] z-[59]
        rounded-full backdrop-blur-xl bg-[rgba(255,255,255,.94)]
        border border-[var(--atl-ice)] shadow-[0_12px_28px_rgba(10,39,64,.10)]
        pl-2 pr-2 py-1.5 flex items-center gap-2
      "
      title="Modo del Owner (afecta acciones en la UI)"
    >
      <span className="text-[11px] font-semibold text-slate-600">Modo</span>
      <Chip
        active={mode === "monitor"}
        onClick={() => { setMode("monitor"); setAsParam("monitor"); }}
      >
        Monitor
      </Chip>
      <Chip
        active={mode === "control"}
        onClick={() => { setMode("control"); setAsParam("control"); }}
      >
        Control total
      </Chip>
    </div>
  );
}

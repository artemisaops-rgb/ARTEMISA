import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { useRole } from "@/hooks/useRole";
import type { Role } from "@/types";

function getAsParam(search: string): Role | null {
  const sp = new URLSearchParams(search);
  const as = sp.get("as");
  if (as === "owner" || as === "worker" || as === "client") return as;
  return null;
}

/** Modo Supervisión para OWNER: si hay ?as=worker|client muestra banner y permite salir. */
export default function SupervisionBanner() {
  const loc = useLocation();
  const nav = useNavigate();
  const { uiRole, setUiRole } = usePreviewRole();
  const { role: realRole } = useRole(); // rol REAL (no visual)

  // Sin owner real, no hay supervisión UI
  const isOwner = realRole === "owner";
  const asParam = getAsParam(loc.search);

  // Sincroniza el parámetro ?as= con el uiRole (solo owner)
  useEffect(() => {
    if (!isOwner) return;
    if (asParam) setUiRole(asParam);
    else setUiRole(null); // vuelve a rol real
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asParam, isOwner]);

  if (!isOwner || !asParam) return null;

  const setAs = (r: Role | null) => {
    const sp = new URLSearchParams(loc.search);
    if (r) sp.set("as", r);
    else sp.delete("as");
    nav({ search: `?${sp.toString()}` });
  };

  return (
    <div
      className="
        fixed top-0 inset-x-0 z-[60]
        bg-amber-50/90 border-b border-amber-200 backdrop-blur
        px-3 py-2 flex items-center justify-between text-amber-900
      "
      role="region"
      aria-label="Supervisión"
    >
      <div className="text-sm">
        <span className="font-medium">Supervisión</span>{" "}
        · viendo como <span className="font-semibold">{uiRole ?? asParam}</span>
      </div>
      <div className="flex gap-2">
        <button
          className="px-3 py-1 rounded-xl border text-xs bg-white hover:bg-amber-50"
          onClick={() => setAs("worker")}
        >
          Worker
        </button>
        <button
          className="px-3 py-1 rounded-xl border text-xs bg-white hover:bg-amber-50"
          onClick={() => setAs("client")}
        >
          Client
        </button>
        <button
          className="px-3 py-1 rounded-xl text-white text-xs bg-amber-600 hover:bg-amber-700 rounded-xl"
          onClick={() => setAs(null)}
        >
          Salir
        </button>
      </div>
    </div>
  );
}

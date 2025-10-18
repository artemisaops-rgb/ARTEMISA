// src/contexts/OwnerMode.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type OwnerMode = "monitor" | "control"; // solo lectura vs control total

type Ctx = {
  mode: OwnerMode;
  setMode: (m: OwnerMode) => void;
  toggle: () => void;
  isMonitor: boolean;
  isControl: boolean;
};

const C = createContext<Ctx | null>(null);

const LS_KEY = "atl-owner-mode";

function readInitial(): OwnerMode {
  // 1) ?mode=control|monitor (útil para compartir URL)
  try {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const q = (sp.get("mode") || "").toLowerCase();
      if (q === "control" || q === "monitor") return q;
    }
  } catch {
    /* no-op */
  }

  // 2) localStorage (protegido para SSR)
  try {
    if (typeof window !== "undefined" && "localStorage" in window) {
      const saved = (localStorage.getItem(LS_KEY) || "").toLowerCase();
      return saved === "control" ? "control" : "monitor";
    }
  } catch {
    /* no-op */
  }

  return "monitor";
}

export function OwnerModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<OwnerMode>(readInitial);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {}
    document.documentElement.setAttribute("data-owner-mode", mode);
    return () => document.documentElement.removeAttribute("data-owner-mode");
  }, [mode]);

  const value = useMemo<Ctx>(
    () => ({
      mode,
      setMode,
      toggle: () => setMode((m) => (m === "monitor" ? "control" : "monitor")),
      isMonitor: mode === "monitor",
      isControl: mode === "control",
    }),
    [mode]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useOwnerMode() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useOwnerMode debe usarse dentro de <OwnerModeProvider>");
  return ctx;
}

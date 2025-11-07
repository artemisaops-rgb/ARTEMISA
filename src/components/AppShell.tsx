// src/components/AppShell.tsx
import React from "react";

export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-veil">
      {/* Topbar */}
      <header className="w-full border-b" style={{ background: "var(--panel)" }}>
        <div className="container-app px-6 h-[56px] flex items-center justify-between">
          <div className="font-semibold tracking-tight">
            <span style={{ color: "var(--atl-navy)" }}>Artemisa</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Slot opcional para iconitos globales */}
          </div>
        </div>
      </header>

      {/* Header sticky de página */}
      <div className="app-sticky">
        <div className="container-app px-6 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      </div>

      {/* Contenido */}
      <main className="container-app px-6 py-6">{children}</main>
    </div>
  );
}

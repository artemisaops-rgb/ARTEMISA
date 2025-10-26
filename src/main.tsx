// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";  // Tailwind (base, components, utilities)
import "./theme.css";  // Paleta Atlantis (variables CSS)

// Providers
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/Auth";
import { PreviewRoleProvider } from "@/contexts/PreviewRole";
import { OwnerModeProvider } from "@/contexts/OwnerMode";

// 🔒 Sync de claims (orgId/role) — ARRANCA ANTES DE RENDERIZAR
import { startAuthClaimsSync } from "@/services/firebase";

// Evita FOUC de tema por rol: aplica data-role desde LS inmediatamente
try {
  const role = localStorage.getItem("myRole");
  if (role) document.documentElement.setAttribute("data-role", role);
} catch { /* no-op */ }

// Inicia el sincronizador de custom claims (orgId / role)
startAuthClaimsSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PreviewRoleProvider>   {/* vista (Cliente/Worker/Owner) */}
          <OwnerModeProvider>   {/* modo (monitor/control) del Owner */}
            <CartProvider>
              <App />
            </CartProvider>
          </OwnerModeProvider>
        </PreviewRoleProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// 🧩 PWA: registra el SW solo en producción y fuera de localhost
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  !/^(localhost|127\.0\.0\.1|::1)$/.test(location.hostname)
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

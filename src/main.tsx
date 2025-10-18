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

// PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

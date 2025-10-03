import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

// Providers
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/Auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

/** Registro del Service Worker (PWA) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});

    const hadController = !!navigator.serviceWorker.controller;
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed || !hadController) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

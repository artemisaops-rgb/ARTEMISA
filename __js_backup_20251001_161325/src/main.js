import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
// Providers
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/Auth";
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(BrowserRouter, { children: _jsx(AuthProvider, { children: _jsx(CartProvider, { children: _jsx(App, {}) }) }) }) }));
/** Registro del Service Worker (PWA) */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((reg) => {
            // Si hay un SW viejo esperando, pedir activación inmediata
            if (reg.waiting)
                reg.waiting.postMessage({ type: "SKIP_WAITING" });
            // Detecta nueva versión descargándose
            reg.addEventListener("updatefound", () => {
                const nw = reg.installing;
                if (!nw)
                    return;
                nw.addEventListener("statechange", () => {
                    if (nw.state === "installed" && navigator.serviceWorker.controller) {
                        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
                    }
                });
            });
        })
            .catch(() => { }); // silencioso: no romper la app en HTTP local
        // Recarga SOLO si ya había un SW controlando (evita loop en 1ª instalación)
        const hadController = !!navigator.serviceWorker.controller;
        let refreshed = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshed || !hadController)
                return;
            refreshed = true;
            window.location.reload();
        });
    });
}

"use strict";
// Registro del Service Worker para Artemisa
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/sw.js")
            .then((reg) => {
            // Si hay un SW en espera, pídele que active ya
            if (reg.waiting)
                reg.waiting.postMessage({ type: "SKIP_WAITING" });
            // Cuando haya una actualización descargándose
            reg.addEventListener("updatefound", () => {
                const newWorker = reg.installing;
                if (!newWorker)
                    return;
                newWorker.addEventListener("statechange", () => {
                    if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                        // hay nueva versión lista; al tomar control recargaremos
                        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
                    }
                });
            });
        })
            .catch((err) => console.error("SW register failed", err));
        // Al cambiar el controlador (nuevo SW activo), recarga 1 vez
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing)
                return;
            refreshing = true;
            window.location.reload();
        });
    });
}

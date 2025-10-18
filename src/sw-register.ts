// src/sw-register.ts
/**
 * Registro del Service Worker (SPA / Vite compatible)
 * - Activa la nueva versión inmediatamente (SKIP_WAITING)
 * - Recarga una sola vez cuando el nuevo SW toma control
 */
const SUPPORTS_SW = "serviceWorker" in navigator;

if (SUPPORTS_SW) {
  const swUrl = (() => {
    // Respeta BASE_URL si la app vive en subcarpetas (Vite)
    const base = (import.meta as any)?.env?.BASE_URL || "/";
    return `${String(base).replace(/\/$/, "")}/sw.js`;
  })();

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Si ya hay un SW "waiting", pídelo que active ya
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

        // Cuando haya una actualización descargándose
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // Si se instaló y ya hay un controlador, es una actualización
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.error("Service Worker registration failed:", err));

    // Al cambiar el controlador (nuevo SW activo), recarga 1 vez
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

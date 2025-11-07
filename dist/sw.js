/* Artemisa PWA Service Worker */
const SW_VERSION = "2025-09-26-01"; // súbela
const CACHE = `artemisa-${SW_VERSION}`;

/** Mantén esta versión sincronizada con el query de tus íconos/manifest */
const ICONS_VERSION = "20250924-3";

/** App Shell + assets estáticos clave (mismo origen) */
const ASSETS = [
  "/",                       // fallback de navegación
  "/index.html",
  `/manifest.webmanifest?v=${ICONS_VERSION}`,

  // Íconos referenciados por el manifest
  `/icons/brand-192.png?v=${ICONS_VERSION}`,
  `/icons/brand-512.png?v=${ICONS_VERSION}`,
  `/icons/manifest-icon-192.maskable.png?v=${ICONS_VERSION}`,
  `/icons/manifest-icon-512.maskable.png?v=${ICONS_VERSION}`,

  // iOS
  "/icons/apple-icon-180.png",

  // Favicons usados por index.html (versionados)
  `/icons/favicon-196-v2.png?v=${ICONS_VERSION}`,
  `/icons/favicon-64-v2.png?v=${ICONS_VERSION}`
];

/** Mensajes desde la app */
self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data.type === "GET_VERSION") {
    e.ports?.[0]?.postMessage?.({ version: SW_VERSION });
  }
});

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await c.addAll(ASSETS);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      if ("navigationPreload" in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch {}
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

/**
 * Estrategia:
 * - HTML (navegaciones): Network-first ➜ write-through a cache ➜ fallback a /index.html
 * - Otros GET del mismo origen: Network-first ➜ write-through ➜ fallback a cache si offline
 * - Cross-origin: deja pasar (no cachea)
 */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  if (!sameOrigin && !isHTML) return;

  e.respondWith(
    (async () => {
      const preload =
        isHTML && "navigationPreload" in self.registration
          ? await e.preloadResponse
          : undefined;

      try {
        const netRes = preload || (await fetch(req));
        if (sameOrigin) {
          const copy = netRes.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return netRes;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: false });
        if (cached) return cached;

        if (isHTML) {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});

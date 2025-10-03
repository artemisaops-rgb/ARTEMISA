import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
export default function InstallPWA() {
    const [deferred, setDeferred] = useState(null);
    const [installed, setInstalled] = useState(false);
    const [swReady, setSwReady] = useState(() => !!navigator.serviceWorker?.controller);
    const [debug, setDebug] = useState("");
    // Hidrata si el index.html guardó el evento antes del mount
    const hydrateDeferred = () => {
        const d = window.__PWA__?.deferred ?? null;
        if (d && !deferred)
            setDeferred(d);
    };
    useEffect(() => {
        const onBIP = (e) => {
            // MUY IMPORTANTE: prevenir el banner y quedarnos con el evento
            e.preventDefault?.();
            setDeferred(e);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferred(null);
            if (window.__PWA__)
                window.__PWA__.deferred = null;
        };
        const onCtrlChange = () => setSwReady(!!navigator.serviceWorker?.controller);
        const onDeferredReady = () => hydrateDeferred();
        window.addEventListener("beforeinstallprompt", onBIP);
        window.addEventListener("appinstalled", onInstalled);
        window.addEventListener("pwa:deferred-ready", onDeferredReady);
        navigator.serviceWorker?.addEventListener?.("controllerchange", onCtrlChange);
        hydrateDeferred();
        // SW status (el registro lo hace src/main.tsx)
        navigator.serviceWorker?.ready
            ?.then(() => {
            setSwReady(!!navigator.serviceWorker?.controller);
            setDebug("SW listo");
        })
            .catch(() => { });
        return () => {
            window.removeEventListener("beforeinstallprompt", onBIP);
            window.removeEventListener("appinstalled", onInstalled);
            window.removeEventListener("pwa:deferred-ready", onDeferredReady);
            navigator.serviceWorker?.removeEventListener?.("controllerchange", onCtrlChange);
        };
    }, []);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        navigator.standalone === true;
    const canInstall = !!deferred && !installed && !isStandalone && !isIOS;
    const reason = useMemo(() => {
        if (installed)
            return "Ya está instalada.";
        if (isStandalone)
            return "Ya estás usando la app instalada.";
        if (!swReady)
            return "El Service Worker aún no controla esta pestaña.";
        return "Esperando a que el navegador permita la instalación…";
    }, [installed, isStandalone, swReady]);
    const install = async () => {
        const d = deferred || window.__PWA__?.deferred || null;
        if (!d) {
            alert("Si tu navegador lo permite, usa 'Añadir a pantalla de inicio'.");
            return;
        }
        try {
            await d.prompt();
            const { outcome } = await d.userChoice;
            if (outcome === "accepted") {
                // El evento 'appinstalled' terminará de actualizar estados
            }
        }
        catch (e) {
            console.error(e);
            alert("No se pudo iniciar la instalación.");
        }
        finally {
            setDeferred(null);
            if (window.__PWA__)
                window.__PWA__.deferred = null;
        }
    };
    return (_jsxs("div", { className: "rounded-2xl border bg-white p-4 space-y-2", children: [_jsx("div", { className: "font-semibold", children: "Aplicaci\u00F3n" }), isIOS ? (_jsxs("p", { className: "text-sm text-slate-600", children: ["En iPhone, toca ", _jsx("strong", { children: "Compartir" }), " \u2192 ", _jsx("strong", { children: "A\u00F1adir a pantalla de inicio" }), "."] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm text-slate-600", children: canInstall ? "Puedes instalar la app." : reason }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn btn-primary px-3 py-2 rounded-xl", onClick: install, disabled: !canInstall, title: !canInstall ? "El navegador aún no expuso el diálogo" : "Instalar app", children: "Instalar" }), !swReady && (_jsx("span", { className: "text-xs text-slate-500 self-center", children: "Esperando al Service Worker\u2026" }))] }), swReady && !canInstall && !installed && !isStandalone && (_jsxs("div", { className: "text-xs text-slate-500", children: ["Si no aparece el di\u00E1logo, en Chrome abre el men\u00FA ", _jsx("b", { children: "\u22EE" }), " y pulsa ", _jsx("b", { children: "Instalar app" }), "."] })), debug && _jsxs("div", { className: "text-[11px] text-slate-400", children: ["PWA: ", debug] })] }))] }));
}

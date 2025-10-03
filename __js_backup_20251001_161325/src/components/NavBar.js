import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
const Item = ({ to, label, icon, }) => (_jsxs(NavLink, { to: to, className: ({ isActive }) => "flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl " +
        (isActive ? "text-white bg-[var(--brand,#f97316)]" : "text-slate-600"), children: [_jsx("div", { className: "w-5 h-5", children: icon }), _jsx("span", { className: "text-[11px]", children: label })] }));
export default function NavBar() {
    const ref = useRef(null);
    // Medir altura real y exponerla como CSS var (con colchón extra)
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const setSpace = () => {
            const h = el.getBoundingClientRect().height || 88;
            // sumamos 24px de colchón por sombras/márgenes
            const space = Math.round(h + 24);
            document.documentElement.style.setProperty("--bottom-bar-space", `${space}px`);
        };
        setSpace();
        const ro = new ResizeObserver(setSpace);
        ro.observe(el);
        window.addEventListener("orientationchange", setSpace);
        window.addEventListener("resize", setSpace);
        return () => {
            ro.disconnect();
            window.removeEventListener("orientationchange", setSpace);
            window.removeEventListener("resize", setSpace);
        };
    }, []);
    return (_jsx("nav", { ref: ref, "data-bottom-bar": true, className: "fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-xl bg-white border shadow-xl rounded-3xl px-2", style: {
            height: "var(--bottom-bar-h, 88px)",
            paddingBottom: "env(safe-area-inset-bottom)",
        }, children: _jsxs("div", { className: "h-full flex gap-1 items-center", children: [_jsx(Item, { to: "/menu", label: "Men\u00FA", icon: _jsx("svg", { viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M3 6h18M3 12h18M3 18h18", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }) }), _jsx(Item, { to: "/carrito", label: "Carrito", icon: _jsxs("svg", { viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M6 6h14l-2 9H8L6 6Z", stroke: "currentColor", strokeWidth: "2" }), _jsx("circle", { cx: "9", cy: "20", r: "1.5", fill: "currentColor" }), _jsx("circle", { cx: "17", cy: "20", r: "1.5", fill: "currentColor" })] }) }), _jsx(Item, { to: "/bodega", label: "Bodega", icon: _jsxs("svg", { viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M3 10l9-6 9 6v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z", stroke: "currentColor", strokeWidth: "2" }), _jsx("path", { d: "M7 20v-6h10v6", stroke: "currentColor", strokeWidth: "2" })] }) }), _jsx(Item, { to: "/mas", label: "M\u00E1s", icon: _jsx("svg", { viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M12 5v14M5 12h14", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }) })] }) }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function ProductCard({ name, price, photoUrl, badge, onAdd, }) {
    const disabled = badge === "agotado";
    return (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col", children: [photoUrl ? (_jsx("img", { src: photoUrl, alt: name, className: "w-full h-32 object-cover" })) : (_jsx("div", { className: "w-full h-32 bg-slate-100 flex items-center justify-center text-slate-400", children: "Sin foto" })), _jsxs("div", { className: "p-4 flex-1 flex flex-col", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsx("div", { className: "font-semibold", children: name }), badge && (_jsx("span", { className: "text-xs px-2 py-0.5 rounded-full " +
                                    (badge === "activo"
                                        ? "bg-green-50 text-green-700"
                                        : "bg-slate-100 text-slate-600"), children: badge === "activo" ? "Activo" : "Agotado" }))] }), _jsxs("div", { className: "text-slate-600 mt-1", children: ["$", price.toLocaleString()] }), _jsx("button", { onClick: onAdd, disabled: disabled, className: "mt-auto w-full rounded-xl bg-[var(--brand,#f97316)] text-white py-2 hover:opacity-95 active:scale-[.98] disabled:opacity-50", children: "Agregar" })] })] }));
}

import { jsx as _jsx } from "react/jsx-runtime";
export default function SearchBar({ value, onChange }) {
    return (_jsx("input", { value: value, onChange: (e) => onChange(e.target.value), placeholder: "Buscar productos...", className: "w-full border rounded-xl px-4 py-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500" }));
}

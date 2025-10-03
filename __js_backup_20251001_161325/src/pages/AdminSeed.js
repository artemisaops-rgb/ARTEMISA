import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/Auth";
export default function AdminSeed() {
    const { user } = useAuth();
    const [msg, setMsg] = useState("");
    const run = async () => {
        if (!user) {
            setMsg("Inicia sesiÃƒ³n.");
            return;
        }
        // productos demo: 3 categorÃƒ­as, tamaÃƒ±os y precios claros
        const demo = [
            { name: "Hamburguesa ClÃƒ¡sica", category: "Comidas", active: true, sizes: [
                    { id: "S", label: "Sencilla", price: 22000, iva: true },
                    { id: "D", label: "Doble", price: 29000, iva: true },
                ] },
            { name: "Papas Fritas", category: "Comidas", active: true, prices: { "ÃƒÅ¡nica": 9000 } },
            { name: "Cola 400ml", category: "Bebidas", active: true, prices: { "ÃƒÅ¡nica": 6000 } },
            { name: "Agua 500ml", category: "Bebidas", active: true, prices: { "ÃƒÅ¡nica": 5000 } },
            { name: "CafÃƒ© Americano", category: "Bebidas Calientes", active: true, prices: { "ÃƒÅ¡nica": 7000 } },
        ];
        for (const p of demo) {
            await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
        }
        setMsg("Semilla cargada. Ve a /menu.");
    };
    useEffect(() => { setMsg(""); }, []);
    if (!user)
        return _jsx("div", { style: { padding: 16 }, children: "Inicia sesi\u00C3\u0192\u00B3n\u00C3\u00A2\u201A\u00AC\u00A6" });
    return (_jsxs("main", { style: { padding: 16 }, children: [_jsx("h1", { style: { fontWeight: 700, fontSize: 20, marginBottom: 8 }, children: "Semilla de productos" }), _jsx("p", { style: { color: "#555", marginBottom: 12 }, children: "Genera productos de prueba activos para ver el Men\u00C3\u0192\u00BA." }), _jsx("button", { onClick: run, style: { padding: "10px 14px", borderRadius: 10, background: "#ff6a00", color: "#fff", border: "none" }, children: "Cargar semilla" }), !!msg && _jsx("div", { style: { marginTop: 12 }, children: msg })] }));
}

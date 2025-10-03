import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
export default function Login() {
    const { user, loginGoogle, loginEmail, logout } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const from = loc.state?.from?.pathname || "/menu";
    const [email, setEmail] = useState("");
    const [pass, setPass] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    if (user) {
        return (_jsxs("div", { className: "container-app pt-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "text-sm text-gray-600", children: ["Hola, ", _jsx("span", { className: "font-semibold", children: user.email })] }), _jsx("button", { className: "btn btn-ghost", onClick: () => logout(), children: "Salir" })] }), _jsx("div", { className: "mt-6", children: _jsx("button", { className: "btn btn-primary", onClick: () => nav(from, { replace: true }), children: "Entrar" }) })] }));
    }
    const submitEmail = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await loginEmail(email, pass);
            nav(from, { replace: true });
        }
        catch (err) {
            setError(err?.message || "No pudimos iniciar sesión.");
        }
        finally {
            setLoading(false);
        }
    };
    const submitGoogle = async () => {
        setError(null);
        setLoading(true);
        try {
            await loginGoogle();
            nav(from, { replace: true });
        }
        catch (err) {
            setError(err?.message || "No pudimos iniciar con Google.");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("main", { className: "min-h-full flex items-center justify-center p-6", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsxs("div", { className: "mb-6 text-center", children: [_jsx("div", { className: "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-white font-extrabold text-xl", children: "A" }), _jsx("h1", { className: "mt-3 text-2xl font-extrabold tracking-tight", children: "Bienvenido a Artemisa" }), _jsx("p", { className: "text-sm text-gray-600 mt-1", children: "Gestiona pedidos y bodega como un pro \uD83D\uDE80" })] }), _jsxs("div", { className: "card p-5", children: [error && _jsx("div", { className: "mb-3 text-sm text-red-600", children: error }), _jsx("button", { onClick: submitGoogle, disabled: loading, className: "btn btn-primary w-full h-11", children: loading ? "Conectando..." : "Entrar con Google" }), _jsx("div", { className: "my-4 text-center text-xs text-gray-400", children: "o con tu correo" }), _jsxs("form", { onSubmit: submitEmail, className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "label", children: "Email" }), _jsx("input", { className: "input", type: "email", placeholder: "tucorreo@dominio.com", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "label", children: "Contrase\u00F1a" }), _jsx("input", { className: "input", type: "password", placeholder: "********", value: pass, onChange: (e) => setPass(e.target.value), required: true })] }), _jsx("button", { className: "btn btn-ghost w-full h-11", disabled: loading, children: "Entrar con Email" })] }), _jsx("p", { className: "mt-4 text-[11px] text-gray-500", children: "Al continuar aceptas nuestros T\u00E9rminos y Pol\u00EDtica de Privacidad." })] })] }) }));
}

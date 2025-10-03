import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { collection, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
const DEFAULT_TASKS = [
    { id: "limpieza", label: "Limpieza del área" },
    { id: "armado", label: "Puesto armado y ordenado" },
    { id: "equipos", label: "Equipos encendidos y probados" },
    { id: "insumos", label: "Insumos verificados (stock mínimo)" },
];
// Límite objetivo (Firestore doc < 1MiB; base64 ocupa ~33% más)
const MAX_ESTIMATED_BYTES = 900 * 1024; // ~900KB
async function fileToDataUrlResized(file, opts = {}) {
    const { maxW = 1280, maxH = 1280, quality = 0.7 } = opts;
    const originalUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = originalUrl;
    });
    const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("No se pudo crear el canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, width: w, height: h, type: "image/jpeg" };
}
function estimateBytesFromDataUrl(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    return Math.floor((base64.length * 3) / 4);
}
export default function Apertura() {
    const { user } = useAuth();
    const [cash, setCash] = useState("");
    const [checks, setChecks] = useState({});
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const allChecked = useMemo(() => DEFAULT_TASKS.every((t) => checks[t.id]), [checks]);
    const pickFile = (e) => {
        const f = e.target.files?.[0] || null;
        if (f && !f.type.startsWith("image/")) {
            setError("El archivo debe ser una imagen.");
            setFile(null);
            setPreview("");
            return;
        }
        setError(null);
        setFile(f);
        setPreview(f ? URL.createObjectURL(f) : "");
    };
    const submit = async () => {
        try {
            setError(null);
            if (!user)
                throw new Error("Debes iniciar sesión.");
            if (!allChecked)
                throw new Error("Completa todas las tareas.");
            if (!file)
                throw new Error("Adjunta la foto del puesto armado.");
            setLoading(true);
            const cashNum = Number(cash) || 0;
            // 1) Comprimir imagen
            const { dataUrl, width, height, type } = await fileToDataUrlResized(file, {
                maxW: 1280, maxH: 1280, quality: 0.7,
            });
            const estimatedBytes = estimateBytesFromDataUrl(dataUrl);
            if (estimatedBytes > MAX_ESTIMATED_BYTES) {
                throw new Error(`La imagen comprimida aún es grande (~${Math.round(estimatedBytes / 1024)}KB). Usa una foto más pequeña.`);
            }
            // 2) Documento de apertura (ID único por día-usuario)
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, "0");
            const d = String(today.getDate()).padStart(2, "0");
            const openId = `${y}-${m}-${d}_${user.uid}`;
            const docRef = doc(collection(db, "openings"), openId);
            await setDoc(docRef, {
                id: openId,
                userId: user.uid,
                userEmail: user.email ?? null,
                initialCash: cashNum,
                tasksDone: DEFAULT_TASKS.filter(t => !!checks[t.id]).map(t => t.id),
                status: "open",
                createdAt: serverTimestamp()
            });
            // 3) Guardar foto en el doc (Spark-friendly)
            await updateDoc(docRef, {
                photoDataUrl: dataUrl,
                photoMeta: { width, height, type, estimatedBytes }
            });
            alert("Apertura registrada ✨");
            setCash("");
            setChecks({});
            setFile(null);
            setPreview("");
        }
        catch (e) {
            setError(e?.message || "No se pudo registrar la apertura.");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "container-app max-w-2xl mx-auto p-6 space-y-5", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Apertura" }), _jsxs("div", { className: "rounded-2xl border bg-white p-5 space-y-5", children: [_jsxs("section", { children: [_jsx("div", { className: "font-medium mb-2", children: "Checklist" }), _jsx("div", { className: "space-y-2", children: DEFAULT_TASKS.map((t) => (_jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: !!checks[t.id], onChange: () => setChecks((x) => ({ ...x, [t.id]: !x[t.id] })) }), t.label] }, t.id))) })] }), _jsxs("section", { className: "grid gap-3", children: [_jsx("label", { className: "text-sm", children: "Efectivo inicial" }), _jsx("input", { className: "input", type: "number", inputMode: "numeric", value: cash, onChange: (e) => setCash(e.target.value), placeholder: "0" })] }), _jsxs("section", { className: "grid gap-3", children: [_jsx("label", { className: "text-sm", children: "Foto del puesto armado" }), _jsx("input", { type: "file", accept: "image/*", capture: "environment", onChange: pickFile }), preview && (_jsx("img", { src: preview, alt: "preview", className: "mt-2 rounded-2xl border max-h-60 object-contain" }))] }), error && _jsx("div", { className: "text-red-600 text-sm", children: error }), _jsx("button", { onClick: submit, disabled: loading || !allChecked || !file, className: "btn btn-primary w-full disabled:opacity-60", children: loading ? "Enviando…" : "Aperturar" })] })] }));
}

import { jsx as _jsx } from "react/jsx-runtime";
// src/contexts/Auth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, } from "firebase/auth";
import { auth, googleProvider } from "@services/firebase";
const Ctx = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        // Persistencia en navegador
        setPersistence(auth, browserLocalPersistence).catch(() => { });
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u ?? null);
            setLoading(false);
        });
        return () => unsub();
    }, []);
    const value = useMemo(() => ({
        user,
        loading,
        async loginGoogle() {
            await signInWithPopup(auth, googleProvider);
        },
        async loginEmail(email, password) {
            await signInWithEmailAndPassword(auth, email, password);
        },
        async logout() {
            await signOut(auth);
        },
    }), [user, loading]);
    return _jsx(Ctx.Provider, { value: value, children: children });
}
export function useAuth() {
    const v = useContext(Ctx);
    if (!v)
        throw new Error("useAuth debe usarse dentro de <AuthProvider>");
    return v;
}

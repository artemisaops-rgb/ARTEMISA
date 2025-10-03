import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useNavigate } from "react-router-dom";

export default function Bootstrap() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Revisando permisos...");

  useEffect(() => {
    (async () => {
      if (!user) {
        setMsg("No hay sesin");
        return;
      }
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { email: user.email || "", role: "admin" });
        setMsg("Usuario creado como admin. Redirigiendo...");
      } else {
        setMsg("Usuario ya existe. Redirigiendo...");
      }
      setTimeout(() => nav("/menu", { replace: true }), 800);
    })();
  }, [user, nav]);

  return (
    <main className="p-6">
      <div className="rounded-xl border bg-white p-4">{msg}</div>
    </main>
  );
}

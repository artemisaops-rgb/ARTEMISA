// src/pages/Bootstrap.tsx
import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useNavigate } from "react-router-dom";

export default function Bootstrap() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Revisando permisos...");

  useEffect(() => {
    (async () => {
      if (!user) {
        setMsg("No hay sesión");
        return;
      }

      const orgId = getOrgId();

      // Opcional: mantener registro básico en users/
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, { email: user.email || "", createdAt: serverTimestamp() }, { merge: true });
      }

      // 🔧 Alineado con tu sistema real de roles: orgs/{orgId}/members/{uid}
      const memberRef = doc(db, "orgs", orgId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) {
        await setDoc(
          memberRef,
          {
            orgId,
            role: "owner",
            email: (user.email || "").toLowerCase(),
            displayName: user.displayName || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setMsg("Membresía creada como OWNER. Redirigiendo…");
      } else {
        setMsg("Membresía existente. Redirigiendo…");
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

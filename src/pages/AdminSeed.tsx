import React, { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  collection,
  query as fsQuery,
  where,
  getDocs,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

/** Roles permitidos en BD */
type DBRole = "owner" | "worker" | "client";

export default function AdminSeed() {
  const { user } = useAuth();
  const orgId = getOrgId();

  // =========================
  //   Costos fijos (igual)
  // =========================
  const [monthly, setMonthly] = useState<number>(0);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        // Mantengo tu doc "fixedCosts" dentro de settings
        const snap = await getDoc(doc(db, "settings", "fixedCosts"));
        const v: any = snap.data() || {};
        const m = Number(v.monthly || 0);
        if (!Number.isNaN(m)) setMonthly(m);
        const ts = v.updatedAt?.toDate?.() ? v.updatedAt.toDate() : null;
        if (ts) setLoadedAt(ts.toLocaleString());
      } catch {}
    })();
  }, []);

  const saveCosts = async () => {
    try {
      setLoadingCosts(true);
      const value = Math.max(0, Math.round(Number(monthly || 0)));
      await setDoc(
        doc(db, "settings", "fixedCosts"),
        {
          orgId,
          monthly: value,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Costos fijos guardados: " + value.toLocaleString());
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo guardar");
    } finally {
      setLoadingCosts(false);
    }
  };

  // =========================================
  //   Hacer OWNER al usuario actual (igual)
  //   + guardo email/displayName en members
  // =========================================
  const [makingOwner, setMakingOwner] = useState(false);
  const makeMeOwner = async () => {
    if (!user?.uid) return alert("Inicia sesión primero.");
    setMakingOwner(true);
    try {
      await setDoc(
        doc(db, "orgs", orgId, "members", user.uid),
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
      alert(`Listo. Eres OWNER en el org "${orgId}". Recarga la app.`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo crear la membresía");
    } finally {
      setMakingOwner(false);
    }
  };

  const setOrgLocal = () => {
    const next = prompt('Org a usar (ej: "artemisa")', orgId) || orgId;
    localStorage.setItem("orgId", next);
    alert(`orgId guardado en localStorage: ${next}. Recarga la app.`);
  };

  // ======================================================
  //   NUEVO: Allowlist de roles por email (settings/{org})
  //   - Guardamos map roleByEmail[email]=role
  //   - Intentamos sincronizar miembros existentes por email
  //   - Si el user aún no inició sesión, se elevará cuando lo haga
  // ======================================================
  const [roleEmail, setRoleEmail] = useState("");
  const [roleValue, setRoleValue] = useState<DBRole>("worker");
  const [savingRole, setSavingRole] = useState(false);
  const [roleByEmail, setRoleByEmail] = useState<Record<string, DBRole>>({});

  async function loadAllowlist() {
    try {
      // Usamos un doc settings/{orgId} separado (no rompemos fixedCosts)
      const st = await getDoc(doc(db, "settings", orgId));
      const data = (st.exists() ? (st.data() as any) : {}) || {};
      setRoleByEmail((data.roleByEmail as Record<string, DBRole>) || {});
    } catch {
      setRoleByEmail({});
    }
  }

  useEffect(() => {
    loadAllowlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  const saveRoleForEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleEmail || !emailRegex.test(roleEmail)) {
      return alert("Email inválido.");
    }
    const clean = roleEmail.trim().toLowerCase();
    setSavingRole(true);
    try {
      // 1) Grabar en settings/{orgId} el map roleByEmail
      const settingsRef = doc(db, "settings", orgId);
      const stSnap = await getDoc(settingsRef);
      const base = stSnap.exists() ? (stSnap.data() as any) : { orgId };
      const nextMap = { ...(base.roleByEmail || {}), [clean]: roleValue };
      await setDoc(
        settingsRef,
        { ...base, orgId, roleByEmail: nextMap, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // 2) Intentar actualizar ya mismo un member existente con ese email
      //    (si aún no se registró, se actualizará cuando inicie sesión)
      const membersCol = collection(db, "orgs", orgId, "members");
      const qy = fsQuery(membersCol, where("email", "==", clean));
      const res = await getDocs(qy);
      for (const d of res.docs) {
        await updateDoc(doc(db, "orgs", orgId, "members", d.id), {
          role: roleValue,
          updatedAt: serverTimestamp(),
        });
      }

      setRoleEmail("");
      setRoleValue("worker");
      await loadAllowlist();

      alert(`Listo. ${clean} ahora tiene rol "${roleValue}".`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo guardar el rol");
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <div className="container-app max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AdminSeed</h1>

      {/* Membresía actual */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Membresía del usuario actual</div>
        <div className="text-sm text-slate-600">
          Sesión: <b>{user?.email || "(sin sesión)"}</b>
          <div className="text-xs text-slate-500">UID: {user?.uid}</div>
          <div className="text-xs text-slate-500">orgId actual: {orgId}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!user || makingOwner} onClick={makeMeOwner}>
            {makingOwner ? "Guardando..." : "Hacerme OWNER en este org"}
          </button>
          <button className="btn" onClick={setOrgLocal}>
            Cambiar orgId (local)
          </button>
        </div>
        <div className="text-xs text-slate-500">
          Requerido por las reglas para leer/escribir productos, bodega, caja, etc.
        </div>
      </section>

      {/* Allowlist de roles por email */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Roles por email (allowlist de la organización)</div>
        <form onSubmit={saveRoleForEmail} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              type="email"
              inputMode="email"
              placeholder="persona@correo.com"
              className="border rounded-xl px-3 py-2 w-full"
              value={roleEmail}
              onChange={(e) => setRoleEmail(e.target.value)}
              required
            />
            <div className="flex gap-2">
              {(["worker", "owner", "client"] as DBRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleValue(r)}
                  className={
                    "px-3 py-2 border rounded-xl " +
                    (roleValue === r ? "bg-[var(--brand,#f97316)] text-white border-[var(--brand,#f97316)]" : "")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary w-full" disabled={savingRole}>
            {savingRole ? "Guardando..." : "Guardar rol por email"}
          </button>
        </form>

        <div className="pt-2">
          <div className="text-sm font-medium">Allowlist actual</div>
          <ul className="text-sm mt-1 space-y-1">
            {Object.keys(roleByEmail).length === 0 && (
              <li className="text-slate-500">Vacío.</li>
            )}
            {Object.entries(roleByEmail).map(([k, v]) => (
              <li key={k}>
                <b>{k}</b> → {v}
              </li>
            ))}
          </ul>
          <div className="text-xs text-slate-500 mt-2">
            • Si el usuario aún no inició sesión, se aplicará el rol al primer login.<br />
            • Si ya existe su membresía con ese email, se actualiza en caliente.
          </div>
        </div>
      </section>

      {/* Costos fijos */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Costos fijos mensuales</div>
        <label className="text-sm">Valor (moneda base)</label>
        <input
          type="number"
          inputMode="numeric"
          className="border rounded-xl px-3 py-2 w-full"
          value={Number.isNaN(monthly) ? 0 : monthly}
          onChange={(e) => setMonthly(Number(e.target.value))}
        />
        {loadedAt && <div className="text-xs text-slate-500">Última carga: {loadedAt}</div>}
        <button
          onClick={saveCosts}
          disabled={loadingCosts}
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {loadingCosts ? "Guardando..." : "Guardar costos fijos"}
        </button>
        <p className="text-xs text-slate-500">
          Este valor alimenta el punto de equilibrio en <b>Estadísticas</b>.
        </p>
      </section>
    </div>
  );
}

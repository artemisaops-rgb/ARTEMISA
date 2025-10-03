import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query as fsQuery,
  where,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { redeemOneFreeBeverage } from "@/lib/customers";

type Customer = {
  id: string;
  orgId: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  stampsProgress?: number; // 0..9
  totalStamps?: number;
  freeCredits?: number;
  createdAt?: any;
  updatedAt?: any;
};

function useIsStaff() {
  const { role } = useRole();
  return role === "owner" || role === "worker";
}

function Avatar({ src, alt }: { src?: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm">
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={alt} className="w-9 h-9 rounded-full object-cover" />;
}

export default function Clientes() {
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const orgId = getOrgId();

  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<Customer | null>(null);

  useEffect(() => {
    if (!user) return;

    if (isStaff) {
      (async () => {
        try {
          const qy = fsQuery(
            collection(db, "customers"),
            where("orgId", "==", orgId),
            orderBy("displayName")
          );
          const snap = await getDocs(qy);
          setList(snap.docs.map((d) => mapDoc(d.id, d.data(), orgId)));
        } catch {
          const qy = fsQuery(collection(db, "customers"), where("orgId", "==", orgId));
          const snap = await getDocs(qy);
          setList(snap.docs.map((d) => mapDoc(d.id, d.data(), orgId)));
        }
      })();
    } else {
      const ref = doc(db, "customers", user.uid);
      const unsub = onSnapshot(ref, (d) => {
        if (!d.exists()) {
          setMe({
            id: user.uid,
            orgId,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            photoURL: user.photoURL ?? null,
            stampsProgress: 0,
            totalStamps: 0,
            freeCredits: 0,
          });
        } else {
          setMe(mapDoc(d.id, d.data(), orgId));
        }
      });
      return () => unsub();
    }
  }, [user?.uid, isStaff, orgId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (c) =>
        (c.displayName || "").toLowerCase().includes(t) ||
        (c.email || "").toLowerCase().includes(t) ||
        c.id.toLowerCase().includes(t)
    );
  }, [list, q]);

  if (!user) return null;

  if (!isStaff) {
    const prog = Number(me?.stampsProgress || 0);
    const credits = Number(me?.freeCredits || 0);
    return (
      <div className="container-app p-6 pb-28 space-y-6">
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <div className="bg-white border rounded-2xl p-4 flex items-center gap-3">
          <Avatar src={me?.photoURL ?? user.photoURL} alt={me?.displayName || user.displayName || "U"} />
          <div>
            <div className="font-semibold">{me?.displayName || user.displayName || "(sin nombre)"}</div>
            <div className="text-slate-600 text-sm">{me?.email || user.email}</div>
            <div className="text-slate-500 text-xs mt-1">ID: {user.uid}</div>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="text-sm text-slate-600">Progreso hacia bebida gratis</div>
          <ProgressDots value={prog} total={10} />
          <div className="text-sm text-slate-600">Créditos disponibles</div>
          <div className="text-3xl font-bold">{credits}</div>
          <div className="text-xs text-slate-500">
            Tus sellos se suman al entregar pedidos con bebidas. Una bebida gratis por cada 10 sellos.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app p-6 pb-28 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <input
          className="input w-64"
          placeholder="Buscar por nombre, email o ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Sellos</th>
              <th className="text-left px-3 py-2">Créditos</th>
              <th className="text-left px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                  Sin resultados.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressDots({ value, total }: { value: number; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border ${
            i < value ? "bg-[var(--brand,#f97316)] border-[var(--brand,#f97316)]" : "bg-white"
          }`}
        />
      ))}
    </div>
  );
}

function Row({ c }: { c: Customer }) {
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    if (busy) return;
    if ((c.freeCredits || 0) <= 0) return alert("Sin créditos disponibles");
    if (!confirm(`Canjear 1 bebida gratis a ${c.displayName || c.email || c.id}?`)) return;
    setBusy(true);
    try {
      await redeemOneFreeBeverage(db, c.id);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar src={c.photoURL} alt={c.displayName || c.email || c.id} />
          <div>
            <div className="font-medium">{c.displayName || "(sin nombre)"}</div>
            <div className="text-xs text-slate-500">ID: {c.id}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">{c.email || "(sin email)"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <ProgressDots value={Number(c.stampsProgress || 0)} total={10} />
          <span className="text-xs text-slate-500">{Number(c.totalStamps || 0)} totales</span>
        </div>
      </td>
      <td className="px-3 py-2 font-semibold">{Number(c.freeCredits || 0).toLocaleString()}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={redeem} disabled={busy || Number(c.freeCredits || 0) <= 0}>
            Canjear 1 bebida
          </button>
        </div>
      </td>
    </tr>
  );
}

function mapDoc(id: string, raw: any, orgId: string): Customer {
  return {
    id,
    orgId: String(raw?.orgId || orgId),
    displayName: raw?.displayName ?? null,
    email: raw?.email ?? null,
    photoURL: raw?.photoURL ?? null,
    stampsProgress: Number(raw?.stampsProgress || 0),
    totalStamps: Number(raw?.totalStamps || 0),
    freeCredits: Number(raw?.freeCredits || 0),
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

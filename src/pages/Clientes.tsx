import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query as fsQuery, where } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";

type Customer = {
  id: string;
  orgId: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  stampsProgress?: number;
  totalStamps?: number;
  freeCredits?: number;
  createdAt?: any;
  updatedAt?: any;
};

function Avatar({ src, alt }: { src?: string | null; alt: string }) {
  // tamaño ligeramente más compacto (36px)
  if (!src) {
    return (
      <div className="w-9 h-9 rounded-full bg-[#e6eef6] flex items-center justify-center text-[var(--navy)] text-sm">
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={alt} className="w-9 h-9 rounded-full object-cover" />;
}

function Cup({ filled }: { filled: boolean }) {
  // dorado cuando está lleno; contorno suave cuando no
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      className={filled ? "fill-[var(--gold)]" : "fill-none stroke-slate-400"}
      strokeWidth="1.6"
    >
      <path d="M4 8h12l-1 8a4 4 0 0 1-4 3.5A4 4 0 0 1 7 16L6 8" />
      <path d="M16 10h2a3 3 0 0 1 0 6h-2" />
      <path d="M8 4c0 1 .8 1.5 1.2 2 .4.5.4 1.1.4 2" />
    </svg>
  );
}

// Curar mojibake visual
function fixText(s?: string | null): string {
  if (!s) return "";
  if (!/[ÃÂâ]/.test(s)) return s.normalize("NFC");
  try {
    const bytes = new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return (/[^\u0000-\u001F]/.test(decoded) ? decoded : s).normalize("NFC");
  } catch {
    return s.normalize("NFC");
  }
}

export default function Clientes() {
  const { user } = useAuth();
  const { isStaff } = useRole(user?.uid);
  const orgId = getOrgId();

  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<Customer | null>(null);

  useEffect(() => {
    if (!user) return;

    if (isStaff) {
      const base = fsQuery(collection(db, "customers"), where("orgId", "==", orgId));
      const ordered = fsQuery(collection(db, "customers"), where("orgId", "==", orgId), orderBy("displayName"));
      let unsub: () => void = () => {};
      const attachFallback = () => {
        unsub = onSnapshot(base, (snap) => {
          const arr = snap.docs.map((d) => mapDoc(d.id, d.data(), orgId));
          arr.sort((a, b) => fixText(a.displayName || "").localeCompare(fixText(b.displayName || "")));
          setList(arr);
        });
      };
      // Si falla el índice de orderBy, caemos al fallback.
      unsub = onSnapshot(ordered, (snap) => setList(snap.docs.map((d) => mapDoc(d.id, d.data(), orgId))), () => attachFallback());
      return () => unsub();
    }

    // Cliente normal: escucha su propio doc
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
  }, [user?.uid, isStaff, orgId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (c) =>
        fixText(c.displayName || "").toLowerCase().includes(t) ||
        fixText(c.email || "").toLowerCase().includes(t) ||
        c.id.toLowerCase().includes(t)
    );
  }, [list, q]);

  if (!user) return null;

  // ---- Vista cliente (mi perfil) ----
  if (!isStaff) {
    const prog = Number(me?.stampsProgress || 0);
    const credits = Number(me?.freeCredits || 0);
    return (
      <div className="container-app p-6 pb-28 space-y-6">
        <h1 className="text-2xl font-bold">Mi perfil</h1>

        <div className="rounded-2xl border bg-white p-4 flex items-center gap-3">
          <Avatar src={me?.photoURL ?? user.photoURL} alt={fixText(me?.displayName) || fixText(user.displayName) || "U"} />
          <div>
            <div className="font-semibold">{fixText(me?.displayName) || fixText(user.displayName) || "(sin nombre)"}</div>
            <div className="text-slate-600 text-sm">{fixText(me?.email) || user.email}</div>
            <div className="text-slate-500 text-xs mt-1">ID: {user.uid}</div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 space-y-4">
          <div className="text-sm text-slate-600">Sellos por compra</div>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 10 }).map((_, i) => (
              <Cup key={i} filled={i < prog} />
            ))}
          </div>
          <div className="text-sm text-slate-600">Créditos disponibles</div>
          <div className="text-3xl font-bold text-[var(--navy)]">{credits}</div>
          <div className="text-xs text-slate-500">
            Sumás 1 sello por cada compra. Al llegar a 10 sellos ganas 1 bebida gratis.
          </div>
        </div>
      </div>
    );
  }

  // ---- Vista staff (lista) ----
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
          <thead className="text-[var(--navy)]" style={{ background: "rgba(11,31,42,0.05)" }}>
            <tr>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Sellos</th>
              <th className="text-left px-3 py-2">Créditos</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  Sin resultados.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar src={c.photoURL} alt={fixText(c.displayName) || c.email || c.id} />
                    <div>
                      <div className="font-medium">{fixText(c.displayName) || "(sin nombre)"}</div>
                      <div className="text-xs text-slate-500">ID: {c.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">{fixText(c.email) || "(sin email)"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Cup key={i} filled={i < Number(c.stampsProgress || 0)} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 font-semibold text-[var(--navy)]">
                  {Number(c.freeCredits || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

import React, { useEffect, useMemo, useRef, useId } from "react";
import { NavLinkPreserveAs as NavLink } from "@/components/LinkPreserveAs";
import { useAuth } from "@/contexts/Auth";
import { useRole } from "@/hooks/useRole";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import { useCart } from "@/contexts/CartContext";

/** ===== Iconos ===== */
const IconMenu = () => {
  const gid = useId();
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ color: "var(--atl-navy)" }}>
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--atl-azure)" />
          <stop offset="1" stopColor="var(--atl-quartz)" />
        </linearGradient>
      </defs>
      <rect x="3" y="5" width="18" height="2.2" rx="1.1" fill="currentColor" opacity=".40" />
      <rect x="3" y="11" width="18" height="2.2" rx="1.1" fill="currentColor" opacity=".70" />
      <rect x="3" y="17" width="18" height="2.2" rx="1.1" fill={`url(#${gid}-g)`} />
    </svg>
  );
};
const IconPanel = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ color: "var(--atl-navy)" }}>
    <path d="M4 19h16M6 17V7m6 10V5m6 12V9" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const IconCart = () => {
  const gid = useId();
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ color: "var(--atl-navy)" }}>
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--gold-2)" />
        </linearGradient>
      </defs>
      <path d="M6 6h14l-2 9H8L6 6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="20" r="1.8" fill={`url(#${gid}-g)`} />
      <circle cx="17" cy="20" r="1.8" fill={`url(#${gid}-g)`} />
    </svg>
  );
};
const IconBodega = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ color: "var(--atl-navy)" }}>
    <path d="M3 10 12 5l9 5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 21v-6h10v6" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ color: "var(--atl-navy)" }}>
    <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path d="M12 6v12M6 12h12" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/** ===== Item ===== */
function Item({
  to, label, icon, badge,
}: { to: string; label: string; icon: React.ReactNode; badge?: number; }) {
  return (
    <NavLink to={to} className={({ isActive }) => `atl-item ${isActive ? "atl-item--active" : ""}`} aria-label={label}>
      <span className="atl-icon">
        {icon}
        {badge != null && badge > 0 && <span className="atl-badge">{badge > 9 ? "9+" : badge}</span>}
      </span>
      <span className="atl-label">{label}</span>
    </NavLink>
  );
}

/** ===== Dock principal ===== */
export default function NavBar() {
  const ref = useRef<HTMLElement | null>(null);
  const { user } = useAuth();
  const { role, realRole } = useRole(user?.uid);
  const { uiRole } = usePreviewRole(); // se usa para label
  const { mode } = useOwnerMode();
  const { items } = useCart();

  // Mostrar dock SOLO a worker u owner (aunque el owner esté en "preview client", se oculta)
  const showDock = realRole === "owner" || role === "worker";

  const isOwner = realRole === "owner";
  const isOwnerTotal = isOwner && mode === "control";
  const ownerMonitor = isOwner && mode === "monitor";
  const isStaff = role === "worker" || isOwnerTotal;

  const menuLabel = (uiRole === "client" || ownerMonitor) ? "Carta" : "Menú";
  const cartCount = useMemo(
    () => (items || []).reduce((n, it: any) => n + Number(it?.qty || 0), 0),
    [items]
  );

  // Mantener HOOKS siempre llamados: este efecto corre aunque showDock sea false.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setSpace = () => {
      const h = el.getBoundingClientRect().height || 80;
      document.documentElement.style.setProperty("--bottom-bar-space", `${Math.round(h + 12)}px`);
    };
    setSpace();
    const ro = new ResizeObserver(setSpace);
    ro.observe(el);
    const onResize = () => setSpace();
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Si no debe mostrarse, devolvemos null (los hooks ya se ejecutaron, no cambia el orden).
  if (!showDock) return null;

  return (
    <>
      <nav ref={ref as any} aria-label="Navegación principal" className="atl-dock">
        <div className="atl-dock__grid">
          {/* Siempre para staff/owner */}
          <Item to="/menu" label={menuLabel} icon={<IconMenu />} />

          {/* Panel (owner) */}
          {isOwner && <Item to="/estadisticas" label="Panel" icon={<IconPanel />} />}

          {/* Operación (staff/owner) */}
          {isStaff && <Item to="/carrito" label="Carrito" icon={<IconCart />} badge={cartCount} />}
          {isStaff && <Item to="/bodega" label="Bodega" icon={<IconBodega />} />}

          {/* Más (staff/owner) */}
          {(isStaff || isOwner) && (
            <NavLink to="/mas" className={({ isActive }) => `atl-fab-wrap ${isActive ? "is-active" : ""}`} aria-label="Más">
              <span className="atl-fab"><IconPlus /></span>
              <span className="atl-label">Más</span>
            </NavLink>
          )}

          {/* Clientes (staff) */}
          {isStaff && <Item to="/clientes" label="Clientes" icon={<IconUser />} />}
        </div>
      </nav>

      <style>{`
        .atl-dock{
          position:fixed; left:50%; transform:translateX(-50%);
          bottom:8px; z-index:50; width:min(94%,560px);
          padding:8px 10px env(safe-area-inset-bottom) 10px;
          border-radius:24px; background:rgba(255,255,255,.92);
          border:1px solid var(--atl-ice); backdrop-filter:saturate(1.15) blur(10px);
          box-shadow:0 12px 32px rgba(10,39,64,.12), inset 0 1px 0 rgba(255,255,255,.7);
        }
        .atl-dock a{ text-decoration:none; color:inherit; }
        .atl-dock__grid{ display:flex; align-items:center; justify-content:space-evenly; gap:4px; flex-wrap:nowrap; }

        .atl-item{
          flex:1 1 0; min-width:68px;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:6px; padding:8px 6px; border-radius:16px; transition:all .18s;
          color:#475467;
        }
        .atl-item:hover{ background:rgba(255,255,255,.7); }
        .atl-item--active{
          background:linear-gradient(180deg,var(--atl-azure),var(--atl-quartz));
          color:var(--atl-navy);
          box-shadow:0 10px 24px rgba(0,200,255,.28);
        }

        .atl-icon{ position:relative; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;
                   filter:drop-shadow(0 3px 8px rgba(10,39,64,.18)); }
        .atl-badge{
          position:absolute; top:-6px; right:-6px; width:16px; height:16px;
          border-radius:999px; display:grid; place-items:center;
          font-size:10px; font-weight:700; line-height:1;
          background:var(--atl-azure); color:var(--atl-navy);
        }
        .atl-label{ font-size:11px; font-weight:600; letter-spacing:.1px; }

        .atl-fab-wrap{ flex:1 1 0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .atl-fab{
          width:56px; height:56px; transform:translateY(-8px);
          border-radius:999px; border:1px solid rgba(255,255,255,.7);
          background:linear-gradient(180deg,var(--gold),var(--gold-2));
          box-shadow:0 22px 36px rgba(212,175,55,.35);
          display:grid; place-items:center;
        }
        .atl-fab-wrap.is-active .atl-label{ color:var(--atl-navy); }
      `}</style>
    </>
  );
}

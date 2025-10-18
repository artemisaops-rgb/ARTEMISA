import React from "react";

type Badge = "activo" | "agotado" | "solo";

export type ProductCardProps = {
  name: string;
  price?: number | null;
  photoUrl?: string;
  badge?: Badge;
  onAdd?: () => void;
  actionLabel?: string;
  currency?: string;
  className?: string;
  density?: "regular" | "compact";
  disabled?: boolean; // <-- NUEVO
};

const fallback =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 240'>\
<rect width='100%' height='100%' fill='%23f1f5f9'/>\
<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' \
font-family='system-ui,Segoe UI,Roboto,Arial' font-size='14' fill='%2394a3b8'>Sin foto</text></svg>";

const money = (n?: number | null, currency = "$") =>
  n == null ? "—" : `${currency}${Number(n || 0).toLocaleString()}`;

const ProductCard: React.FC<ProductCardProps> = ({
  name,
  price,
  photoUrl,
  badge,
  onAdd,
  actionLabel = "Añadir",
  currency = "$",
  className = "",
  density = "compact",
  disabled,
}) => {
  const computedDisabled =
    disabled !== undefined ? disabled : (badge === "agotado" || badge === "solo");
  const compact = density === "compact";

  return (
    <>
      <article className={`atl-card ${compact ? "atl--compact" : ""} ${className}`} aria-label={name}>
        <div className="atl-card__media">
          <img
            src={photoUrl || fallback}
            alt={name}
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.src !== fallback) img.src = fallback;
            }}
          />
          {badge && (
            <span className={`atl-badge atl-badge--${badge}`}>
              {badge === "activo" ? "Activo" : badge === "agotado" ? "Agotado" : "Solo visual"}
            </span>
          )}
        </div>

        <div className="atl-card__body">
          <h3 className="atl-card__title">{name}</h3>
          <div className="atl-card__price">{money(price, currency)}</div>

          <button
            type="button"
            onClick={() => !computedDisabled && onAdd?.()}
            disabled={computedDisabled}
            className="atl-cta"
            title={computedDisabled ? "No disponible para agregar" : actionLabel}
          >
            {actionLabel}
          </button>
        </div>
      </article>

      <style>{`
        .atl-card{
          background:#fff; border:1px solid var(--atl-ice);
          border-radius:18px; overflow:hidden;
          box-shadow:0 10px 24px rgba(10,39,64,.08);
          display:flex; flex-direction:column;
          transition:transform .12s ease, box-shadow .12s ease;
        }
        .atl-card:hover{ transform:translateY(-2px); box-shadow:0 14px 30px rgba(10,39,64,.12); }

        .atl-card__media{ position:relative; aspect-ratio:16/9; background:#f1f5f9; }
        .atl-card__media img{ width:100%; height:100%; object-fit:cover; display:block; }

        .atl--compact .atl-card__media{ aspect-ratio:4/3; max-height:160px; }
        @media (min-width: 640px){ .atl--compact .atl-card__media{ max-height:180px; } }

        .atl-badge{
          position:absolute; top:8px; left:8px; padding:4px 8px; font-size:12px; font-weight:600;
          border-radius:999px; backdrop-filter:saturate(1.1) blur(4px);
          border:1px solid rgba(255,255,255,.6);
        }
        .atl-badge--activo{ background:linear-gradient(180deg,var(--atl-azure),var(--atl-quartz)); color:var(--atl-navy); }
        .atl-badge--agotado{ background:#f1f5f9; color:#475467; }
        .atl-badge--solo{ background:#fff7ed; color:#9a3412; }

        .atl-card__body{ padding:12px; display:flex; flex-direction:column; gap:6px; flex:1; }
        .atl--compact .atl-card__body{ padding:10px; gap:6px; }

        .atl-card__title{ font-weight:700; line-height:1.2; font-size:15px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .atl--compact .atl-card__title{ font-size:14px; }

        .atl-card__price{ color:#475467; font-weight:600; }

        .atl-cta{
          margin-top:auto; height:38px; border-radius:12px; border:none; cursor:pointer;
          background:linear-gradient(90deg,var(--gold),var(--gold-2)); color:var(--atl-navy);
          font-weight:800; letter-spacing:.2px;
          box-shadow:0 10px 22px rgba(227,196,85,.28);
          transition:transform .08s ease, opacity .12s ease;
        }
        .atl--compact .atl-cta{ height:34px; border-radius:10px; font-weight:750; }
        .atl-cta:active{ transform:scale(.98); }
        .atl-cta:disabled{ opacity:.5; cursor:not-allowed; }
      `}</style>
    </>
  );
};

export default ProductCard;

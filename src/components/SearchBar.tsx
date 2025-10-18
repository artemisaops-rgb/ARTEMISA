import React from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export default function SearchBar({ value, onChange, placeholder = "Buscar en la carta...", autoFocus }: Props) {
  return (
    <>
      <div className="atl-search" role="search">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="atl-search__icon">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="atl-search__input"
          autoFocus={autoFocus}
          aria-label="Buscar productos"
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Borrar búsqueda"
            className="atl-search__clear"
            aria-label="Borrar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      <style>{`
        .atl-search{
          width:100%; display:flex; align-items:center; gap:8px;
          background:#fff; border:1px solid var(--atl-ice); border-radius:18px;
          padding:10px 12px; box-shadow:0 8px 18px rgba(10,39,64,.06);
          transition: box-shadow .15s ease, border-color .15s ease;
        }
        .atl-search:focus-within{
          border-color:var(--atl-azure);
          box-shadow:0 10px 24px rgba(0,200,255,.18);
        }
        .atl-search__icon{ color:#94a3b8; }
        .atl-search__input{
          flex:1; border:none; outline:none; background:transparent; font-size:15px;
        }
        .atl-search__clear{
          width:28px; height:28px; border-radius:999px; border:1px solid var(--atl-ice);
          background:#fff; cursor:pointer; line-height:1; font-size:18px; color:#64748b;
        }
        .atl-search__clear:active{ transform:scale(.96); }
      `}</style>
    </>
  );
}

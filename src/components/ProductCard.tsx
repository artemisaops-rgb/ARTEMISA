import React from "react";

type Props = {
  name: string;
  price: number;
  photoUrl?: string;
  badge?: "activo" | "agotado";
  onAdd?: () => void;
};

export default function ProductCard({
  name,
  price,
  photoUrl,
  badge,
  onAdd,
}: Props) {
  const disabled = badge === "agotado";
  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 bg-slate-100 flex items-center justify-center text-slate-400">
          Sin foto
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between">
          <div className="font-semibold">{name}</div>
          {badge && (
            <span
              className={
                "text-xs px-2 py-0.5 rounded-full " +
                (badge === "activo"
                  ? "bg-green-50 text-green-700"
                  : "bg-slate-100 text-slate-600")
              }
            >
              {badge === "activo" ? "Activo" : "Agotado"}
            </span>
          )}
        </div>

        <div className="text-slate-600 mt-1">${price.toLocaleString()}</div>

        <button
          onClick={onAdd}
          disabled={disabled}
          className="mt-auto w-full rounded-xl bg-[var(--brand,#f97316)] text-white py-2 hover:opacity-95 active:scale-[.98] disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

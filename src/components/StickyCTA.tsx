type Props = { label:string; onClick:()=>void; disabled?:boolean };
export default function StickyCTA({label,onClick,disabled}:Props){
  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4">
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full h-12 rounded-2xl shadow-lg bg-[var(--violet-600)] text-white font-semibold disabled:opacity-50"
        aria-disabled={disabled}
      >
        {label}
      </button>
    </div>
  );
}

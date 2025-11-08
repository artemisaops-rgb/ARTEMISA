import { NavLink } from "react-router-dom";

export default function BottomNav(){
  const items = [
    {to:"/order", label:"Orden"},
    {to:"/machine", label:"Máquina"},
    {to:"/blend", label:"Licuado"},
    {to:"/toppings", label:"Toppings"},
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[var(--panel)]/90 backdrop-blur rounded-t-2xl shadow-md">
      <ul className="grid grid-cols-4">
        {items.map(it=>(
          <li key={it.to}>
            <NavLink
              to={it.to}
              className={({isActive}) =>
                `flex flex-col items-center py-3 text-xs ${isActive?"text-[var(--violet-600)] font-semibold":"text-[var(--ink-2)]"}`
              }>
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

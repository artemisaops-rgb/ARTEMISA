import React from "react";
import { Link, NavLink, type LinkProps, type NavLinkProps, useLocation } from "react-router-dom";

/** Anexa ?as=... del URL actual al destino. */
function withAsParam(to: LinkProps["to"], searchNow: string): LinkProps["to"] {
  const spNow = new URLSearchParams(searchNow);
  const as = spNow.get("as");
  if (!as) return to;

  if (typeof to === "string") {
    const hasQ = to.includes("?");
    return `${to}${hasQ ? "&" : "?"}as=${encodeURIComponent(as)}`;
  }

  const next = { ...(to as any) };
  const sp = new URLSearchParams(next.search || "");
  sp.set("as", as);
  next.search = `?${sp.toString()}`;
  return next;
}

/** Link que preserva ?as= del URL actual. */
export default function LinkPreserveAs(props: LinkProps) {
  const { search } = useLocation();
  const toWith = withAsParam(props.to, search);
  return <Link {...props} to={toWith} />;
}

/** NavLink que preserva ?as= del URL actual (si necesitas estado activo). */
export function NavLinkPreserveAs(props: NavLinkProps) {
  const { search } = useLocation();
  const toWith = withAsParam(props.to, search) as any;
  return <NavLink {...props} to={toWith} />;
}

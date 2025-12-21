// src/hooks/useRole.ts
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Role } from "@/types";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import { listenMyMembership } from "@/lib/memberships";

export function useRole(uid?: string | null) {
  const [realRole, setRealRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const { uiRole } = usePreviewRole();
  const { mode } = useOwnerMode();
  const loc = useLocation();

  useEffect(() => {
    if (!uid) {
      setRealRole(null);
      setLoading(false);
      return;
    }

    // MOCK ROLE FOR TESTING
    if (uid === "mock-owner-uid") {
      setRealRole("owner");
      setLoading(false);
      return;
    }

    setLoading(true);
    const stop = listenMyMembership(uid, (m) => {
      setRealRole((m?.role as Role) ?? "client");
      setLoading(false);
    });
    return () => stop();
  }, [uid]);

  // Prioritize URL param 'as' for immediate feedback during navigation
  const sp = new URLSearchParams(loc.search);
  const asParam = sp.get("as") as Role | null;
  const effectiveUiRole = (realRole === "owner" && (asParam === "client" || asParam === "worker"))
    ? asParam
    : uiRole;

  const role: Role =
    (realRole === "owner" ? (effectiveUiRole ?? realRole) : (realRole ?? "client")) as Role;

  useEffect(() => {
    document.documentElement.setAttribute("data-role", role ?? "unknown");
    return () => document.documentElement.removeAttribute("data-role");
  }, [role]);

  const ownerMonitor = realRole === "owner" && mode === "monitor";
  const ownerTotal = realRole === "owner" && mode === "control";
  const isStaff = realRole === "worker" || ownerTotal;

  return { role, isStaff, loading, realRole, ownerMonitor, ownerTotal };
}

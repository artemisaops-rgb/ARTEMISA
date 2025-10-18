// src/hooks/useRole.ts
import { useEffect, useState } from "react";
import type { Role } from "@/types";
import { usePreviewRole } from "@/contexts/PreviewRole";
import { useOwnerMode } from "@/contexts/OwnerMode";
import { listenMyMembership } from "@/lib/memberships";

export function useRole(uid?: string | null) {
  const [realRole, setRealRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const { uiRole } = usePreviewRole();
  const { mode } = useOwnerMode();

  useEffect(() => {
    if (!uid) {
      setRealRole(null);
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

  const role: Role =
    (realRole === "owner" ? (uiRole ?? realRole) : (realRole ?? "client")) as Role;

  useEffect(() => {
    document.documentElement.setAttribute("data-role", role ?? "unknown");
    return () => document.documentElement.removeAttribute("data-role");
  }, [role]);

  const ownerMonitor = realRole === "owner" && mode === "monitor";
  const ownerTotal = realRole === "owner" && mode === "control";
  const isStaff = realRole === "worker" || ownerTotal;

  return { role, isStaff, loading, realRole, ownerMonitor, ownerTotal };
}

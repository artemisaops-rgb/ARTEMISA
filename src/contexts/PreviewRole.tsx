import React, { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "@/types";

type UIRole = Role | null;
type Ctx = { uiRole: UIRole; setUiRole: (r: UIRole) => void };

const C = createContext<Ctx>({ uiRole: null, setUiRole: () => {} });

export function PreviewRoleProvider({ children }: { children: React.ReactNode }) {
  const [uiRole, setUiRole] = useState<UIRole>(() => {
    const saved = localStorage.getItem("atl-uiRole");
    return (saved as Role) || null;
  });

  useEffect(() => {
    if (uiRole) localStorage.setItem("atl-uiRole", uiRole);
    else localStorage.removeItem("atl-uiRole");
  }, [uiRole]);

  // opcional: atributo para inspección/temas
  useEffect(() => {
    if (uiRole) document.documentElement.setAttribute("data-ui-role", uiRole);
    else document.documentElement.removeAttribute("data-ui-role");
  }, [uiRole]);

  return <C.Provider value={{ uiRole, setUiRole }}>{children}</C.Provider>;
}

export const usePreviewRole = () => useContext(C);

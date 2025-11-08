import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type UIState = {
  mute: boolean; setMute: (v:boolean)=>void;
  hideRightPanel: boolean; setHideRightPanel: (v:boolean)=>void;
};

const Ctx = createContext<UIState | null>(null);

export function UIProvider({ children }:{children:React.ReactNode}) {
  const [mute, setMute] = useState(()=> localStorage.getItem("mute")==="1");
  const [hideRightPanel, setHideRightPanel] = useState(()=> localStorage.getItem("hideRightPanel")==="1");

  useEffect(()=> localStorage.setItem("mute", mute ? "1":"0"), [mute]);
  useEffect(()=> localStorage.setItem("hideRightPanel", hideRightPanel ? "1":"0"), [hideRightPanel]);

  const value = useMemo(()=>({ mute, setMute, hideRightPanel, setHideRightPanel }), [mute, hideRightPanel]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUI = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUI must be used within UIProvider");
  return v;
}

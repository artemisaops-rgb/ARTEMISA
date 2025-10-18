// src/pages/Cierre.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Cierre() {
  const nav = useNavigate();
  useEffect(() => { nav("/caja", { replace: true }); }, [nav]);
  return null;
}

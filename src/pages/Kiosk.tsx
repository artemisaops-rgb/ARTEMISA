import BuilderClient from "./BuilderClient";
import { useEffect, useState } from "react";
import { db, getOrgId } from "@/services/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Kiosk() {
  const [pinOk, setPinOk] = useState(false);
  const [pin, setPin] = useState("");
  const [cfgPin, setCfgPin] = useState<string>("2580");

  useEffect(() => {
    (async () => {
      const orgId = getOrgId();
      const snap = await getDoc(doc(db, "builderConfigs", orgId));
      if (snap.exists()) setCfgPin(((snap.data() as any).kioskPin || "2580"));
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--paper,#fffaf5)]">
      <div className="fixed top-2 right-2">
        {pinOk ? (
          <button className="btn btn-ghost" onClick={() => setPinOk(false)}>Salir</button>
        ) : (
          <details className="rounded-xl border bg-white p-2">
            <summary className="cursor-pointer text-sm">Admin</summary>
            <div className="mt-2 flex gap-2">
              <input className="input h-9 w-24 text-center" type="password" value={pin} onChange={(e)=>setPin(e.target.value)} placeholder="PIN" />
              <button className="btn btn-primary" onClick={() => { if (pin === cfgPin) { setPinOk(true); setPin(""); } else alert("PIN inválido"); }}>Ok</button>
            </div>
          </details>
        )}
      </div>
      <div className="max-w-5xl mx-auto">
        {/* source diferenciado */}
        <BuilderClient source="kiosk" />
      </div>
    </div>
  );
}

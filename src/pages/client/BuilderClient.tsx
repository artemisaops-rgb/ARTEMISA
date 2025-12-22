// src/pages/BuilderClient.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, getDocs, query as fsQuery, where,
  addDoc, serverTimestamp, doc, setDoc, writeBatch
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db, getOrgId } from "@/services/firebase";
import { createOrderFromBuilder } from "@/services/order";
import { useAuth } from "@/contexts/Auth";

import type {
  InventoryItem, TemplateComponent, SizeOption, Unit as SvcUnit,
} from "@/services/types.ar.rb";

import { Cup } from "../../components/freezeria/Cup";
import { Ticket } from "../../components/freezeria/Ticket";

import "@/styles/freezeria.theme.css";
import "@/styles/freezeria.builder.css";
import "@/styles/freezeria.machine.css";

/* =========================
   Flags DEV (omite claims) y helpers de Org (evita 400/403)
   ========================= */
const DEV_NO_CLAIM =
  (import.meta as any)?.env?.VITE_DEV_NO_CLAIM === "1" ||
  (typeof localStorage !== "undefined" && localStorage.getItem("DEV_NO_CLAIM") === "1");

type OrgClaim = string | null;
async function getClaimedOrgId(): Promise<OrgClaim> {
  const u = getAuth().currentUser; if (!u) return null;
  const tok = await u.getIdTokenResult(true);
  const c: any = tok.claims || {};
  return (c.orgId ?? c.org ?? c.org_id ?? null) as OrgClaim;
}

/* =========================
   Helpers visuales
   ========================= */
function PourArc({
  from, to, color = "#ec4899",
}: { from: { x: number; y: number }; to: { x: number; y: number }; color?: string }) {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const cpx = (from.x + to.x) / 2;
  const cpy = Math.min(from.y, to.y) - 120;
  const d = `M ${from.x},${from.y} Q ${cpx},${cpy} ${to.x},${to.y}`;
  return (
    <svg className="fz-pour-arc" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" className="flow" />
      <style>{`.fz-pour-arc{position:fixed; inset:0; pointer-events:none; z-index:6}
      .fz-pour-arc .flow{stroke-dasharray:1400; stroke-dashoffset:1400; animation:pourflow .9s cubic-bezier(.2,.8,.2,1) forwards; filter:drop-shadow(0 2px 0 rgba(0,0,0,.12))}
      @keyframes pourflow{80%{opacity:1}100%{stroke-dashoffset:0;opacity:0}}`}</style>
    </svg>
  );
}
function PourGuide({ show }: { show: boolean }) { if (!show) return null; return <div className="pour-guide on" aria-hidden />; }

function BlenderHead({ spinning }: { spinning: boolean }) {
  return (
    <div className={`blend-head ${spinning ? "on" : ""}`} aria-hidden>
      <span className="cap" /><span className="ring" /><span className="shaft" />
      <style>{`.blend-head{ position:absolute; left:50%; transform:translateX(-50%); top:170px; z-index:3; width:120px; height:90px; }
      .blend-head .cap{ position:absolute; left:0; right:0; top:0; height:26px; border-radius:14px; background:linear-gradient(#f5e1ff,#e1c6ff); box-shadow:inset 0 -2px 0 rgba(0,0,0,.10) }
      .blend-head .ring{ position:absolute; left:24px; right:24px; top:26px; height:12px; border-radius:8px; background:linear-gradient(#a855f7,#7c3aed) }
      .blend-head .shaft{ position:absolute; left:50%; transform:translateX(-50%); top:34px; width:10px; height:56px; border-radius:6px; background:linear-gradient(#cfd7e2,#9fb2c8) }
      .blend-head.on .ring{ animation:spinHead 1s linear infinite; } @keyframes spinHead{ from{ filter:hue-rotate(0deg) } to{ filter:hue-rotate(360deg) } }`}</style>
    </div>
  );
}

/* Bowl (catálogo toppings) */
function TopBowl({
  id, emoji, label, color = "#ff90d0", onPick,
}: { id: string; emoji: string; label: string; color?: string; onPick: (id: string) => void; }) {
  return (
    <button className="top-bowl" onClick={() => onPick(id)} title={label}>
      <span className="dish" /><span className="spoon" />
      <span className="content" style={{ background: color }}><span className="emoji">{emoji}</span></span>
      <span className="lbl">{label}</span>
      <style>{`.top-bowl{ position:relative; width:92px; height:82px; border:none; background:transparent; cursor:pointer; transition:transform .12s ease }
      .top-bowl:hover{ transform:translateY(-2px) scale(1.05); }
      .top-bowl .dish{ position:absolute; left:6px; right:6px; top:22px; bottom:22px; border-radius:50%; background:radial-gradient(#ffeaf7,#ffd2ef); box-shadow:inset 0 2px 0 #fff, inset 0 -3px 0 #f5b6db }
      .top-bowl .spoon{ position:absolute; right:14px; top:6px; width:36px; height:10px; border-radius:6px; background:linear-gradient(#d9e2ea,#b8c6d4); transform:rotate(24deg) }
      .top-bowl .content{ position:absolute; left:16px; right:16px; top:28px; bottom:28px; border-radius:50%; filter:brightness(1.05); display:flex; align-items:center; justify-content:center; box-shadow:inset 0 2px 0 rgba(255,255,255,.8); }
      .top-bowl .emoji{ font-size:20px } .top-bowl .lbl{ position:absolute; bottom:0; left:0; right:0; text-align:center; font-weight:800; font-size:12px; color:#57264f }`}</style>
    </button>
  );
}

/* Botella (arequipe) */
function SauceBottle({ label, color = "#8b5e34", onSqueeze }: { label: string; color?: string; onSqueeze: () => void; }) {
  return (
    <button className="sauce" onClick={onSqueeze} title={label}>
      <span className="tip" /><span className="tube" /><span className="body" /><span className="band" style={{ background: color }} />
      <span className="lbl">{label}</span>
      <style>{`.sauce{ position:relative; width:64px; height:120px; border:none; background:transparent; cursor:pointer; transition:transform .12s ease }
      .sauce:hover{ transform:translateY(-2px) scale(1.05); }
      .sauce .tip{ position:absolute; left:26px; top:0; width:12px; height:14px; border-radius:2px 2px 0 0; background:#e8edf3 }
      .sauce .tube{ position:absolute; left:30px; top:14px; width:4px; height:20px; background:#c3cfdb }
      .sauce .body{ position:absolute; left:10px; right:10px; top:34px; bottom:22px; border-radius:12px; background:linear-gradient(#ffffff,#f8eef8); border:1px solid #efd8ef }
      .sauce .band{ position:absolute; left:14px; right:14px; top:54px; height:16px; border-radius:6px }
      .sauce .lbl{ position:absolute; bottom:0; left:0; right:0; text-align:center; font-size:10px; font-weight:800; color:#57264f }
      .sauce:active .band{ transform:scaleY(.9) }`}</style>
    </button>
  );
}

/* Sonidos */
function useSfx(muted = false) {
  const ctxRef = React.useRef<AudioContext | null>(null);
  const busRef = React.useRef<GainNode | null>(null);
  const lastBeepRef = React.useRef(0);
  function ensureCtx() {
    if (muted) return;
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const gain = ctx.createGain(); gain.gain.value = 0.06; gain.connect(ctx.destination);
      ctxRef.current = ctx; busRef.current = gain;
    }
    if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
  }
  function tone(freq = 600, ms = 70, type: OscillatorType = "sine", vol = 0.08) {
    if (muted) return;
    ensureCtx(); const ctx = ctxRef.current!, bus = busRef.current!;
    if (!ctx || !bus) return;
    const o = ctx.createOscillator(), v = ctx.createGain();
    o.type = type; o.frequency.value = freq; v.gain.value = 0.0001; o.connect(v); v.connect(bus);
    const t = ctx.currentTime; v.gain.exponentialRampToValueAtTime(vol, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000 + 0.02);
  }
  function click() { tone(180, 90, "square", 0.12); }
  function meterTick(dist01: number) {
    if (muted) return;
    const now = performance.now(); const minGap = 60 - 40 * (1 - dist01);
    if (now - lastBeepRef.current < Math.max(22, minGap)) return;
    lastBeepRef.current = now; const f = 300 + (1 - dist01) * 700; tone(f, 60, "sine", 0.08);
  }
  return { click, meterTick };
}

/* =========================
   Catálogos
   ========================= */
type Station = "prep" | "mix" | "top";
type Role = "liquid" | "syrup" | "ice" | "whipped" | "topping" | "mixable" | "sparkling";
type MachinePhase = "idle" | "arrive" | "ready" | "pour" | "retract" | "travel" | "lower";

const FALLBACK_SIZES: SizeOption[] = [
  { id: "S", label: "Pequeño", basePrice: 7000 },
  { id: "M", label: "Mediano", basePrice: 9000 },
  { id: "L", label: "Grande", basePrice: 11000 },
];

const VTOPS: Array<Pick<InventoryItem, "id" | "name" | "unit" | "category">> = [
  { id: "whip", name: "Crema batida", unit: "pc", category: "topping" },
  { id: "oreo", name: "Galleta Oreo", unit: "pc", category: "topping" },
  { id: "sprinkles", name: "Chispas", unit: "pc", category: "topping" },
  { id: "cherry", name: "Cereza", unit: "pc", category: "topping" },
  { id: "areq", name: "Arequipe", unit: "ml", category: "topping" },
];

const CATEGORY_INFO: Record<string, { label: string; color: string; emoji?: string }> = {
  ice: { label: "Hielo", color: "#22d3ee", emoji: "🧊" },
  liquid: { label: "Líquido", color: "#60a5fa", emoji: "💧" },
  powder: { label: "Polvos", color: "#fbbf24", emoji: "🧂" },
  condensed: { label: "Condensada", color: "#f59e0b", emoji: "🍯" },
};

const EMOJI_BY_ROLE: Record<Role, string> = {
  ice: "🧊", liquid: "💧", sparkling: "✨", syrup: "🍯", whipped: "🥛", topping: "🍬", mixable: "🧂",
};

const CUP_ML: Record<string, number> = { S: 300, M: 450, L: 600 };
const money = (n: number) => `$${Math.max(0, Math.round(n || 0)).toLocaleString()}`;

// Heurística de rol
const roleOfItem = (it: InventoryItem): Role => {
  const raw = String(((it as any)?.category ?? (it as any)?.section ?? "")).toLowerCase();
  const id = String((it as any)?.id ?? "");
  const name = String(it?.name ?? "").toLowerCase();
  const unit = String((it as any)?.unit ?? "").toLowerCase();
  const is = (k: string) => raw.includes(k) || name.includes(k);

  if (id === "areq" || is("topping") || is("oreo") || is("gallet") || is("chisp") || is("frut")) return "topping";
  if (is("whipp") || is("crema batida")) return "whipped";
  if (is("syrup") || is("jarabe") || is("dulce de leche")) return "syrup";
  if (is("spark") || is("tónica") || is("soda")) return "sparkling";
  if (is("hielo") || is("ice")) return "ice";
  if (is("líquido") || is("liquid") || is("leche") || is("café") || is("agua")) return "liquid";
  if (unit === "ml" && is("topping")) return "topping";
  return "mixable";
};

function stepForRole(r: Role, u?: SvcUnit): number {
  if (r === "topping" || r === "whipped") return 1;
  if (r === "ice") return 50;
  const unit = (u || "pc") as SvcUnit;
  switch (unit) { case "ml": return r === "syrup" ? 10 : 50; case "g": return 10; case "shot": return 30; case "pump": return 10; default: return 1; }
}
function toMlEq(qty: number, unit?: SvcUnit): number {
  switch (unit) { case "ml": return qty; case "g": return qty; case "shot": return qty * 30; case "pump": return qty * 10; case "pc": default: return qty * 10; }
}

/* =========================
   PRICING
   ========================= */
type PricingCfg = {
  cupCost: number;
  icePer50g: number;
  liquidPer50ml: number;
  powderPer10g: number;
  condensedPer10ml: number;
  baseMargin: number;
  topPublic: number;
  topBulk5Public: number;
  topBulk10Public: number;
  freebies: Record<"S" | "M" | "L", number>;
};
const PRICING_DEFAULTS: PricingCfg = {
  cupCost: 500,
  icePer50g: 80,
  liquidPer50ml: 120,
  powderPer10g: 100,
  condensedPer10ml: 120,
  baseMargin: 1500,
  topPublic: 2000,
  topBulk5Public: 1500,
  topBulk10Public: 1000,
  freebies: { S: 1, M: 2, L: 3 },
};
function loadPricing(): PricingCfg {
  try { const v = localStorage.getItem("pricing:v1"); if (!v) return PRICING_DEFAULTS; return { ...PRICING_DEFAULTS, ...JSON.parse(v) }; }
  catch { return PRICING_DEFAULTS; }
}
function savePricing(p: PricingCfg) { try { localStorage.setItem("pricing:v1", JSON.stringify(p)); } catch { } }

/* =========================
   calcPublicTotal
   ========================= */
type PricingBreakdown = {
  totalPublic: number;
  basePublic: number;
  baseCost: number;
  topsServings: number;
  topsChargeable: number;
  topsUnit: "serving";
  topsPublic: number;
};
function ceilDiv(n: number, d: number) { return n <= 0 ? 0 : Math.ceil(n / d); }

function calcPublicTotal(
  qtyById: Record<string, number>,
  byId: Record<string, InventoryItem | undefined>,
  pricing: PricingCfg,
  sizeId: "S" | "M" | "L"
): PricingBreakdown {
  let gramsIce = 0, mlLiquids = 0, gramsPowder = 0, mlCondensed = 0;
  let topServings = 0;

  for (const [id, qtyRaw] of Object.entries(qtyById)) {
    const q = Number(qtyRaw || 0); if (!q) continue;
    const it = byId[id]; const unit = (it?.unit as SvcUnit) || "pc";
    const r = it ? roleOfItem(it) : "mixable";

    if (r === "ice" && unit === "g") gramsIce += q;
    else if ((r === "liquid" || r === "sparkling") && unit === "ml") mlLiquids += q;
    else if (r === "mixable" && unit === "g") gramsPowder += q;
    else if (id === "cond" && unit === "ml") mlCondensed += q;

    if (r === "topping" || r === "whipped") {
      if (unit === "pc") topServings += q;
      else if (unit === "ml") topServings += q / 10;
      else topServings += q;
    }
  }

  const baseCost =
    pricing.cupCost +
    ceilDiv(gramsIce, 50) * pricing.icePer50g +
    ceilDiv(mlLiquids, 50) * pricing.liquidPer50ml +
    ceilDiv(gramsPowder, 10) * pricing.powderPer10g +
    ceilDiv(mlCondensed, 10) * pricing.condensedPer10ml;

  const basePublic = baseCost + pricing.baseMargin;

  const freebies = pricing.freebies[sizeId] ?? 0;
  const chargeable = Math.max(0, Math.round(topServings) - freebies);

  const unitPrice =
    chargeable >= 10 ? pricing.topBulk10Public :
      chargeable >= 5 ? pricing.topBulk5Public :
        pricing.topPublic;

  const topsPublic = chargeable * unitPrice;
  const totalPublic = basePublic + topsPublic;

  return {
    totalPublic, basePublic, baseCost,
    topsServings: Math.round(topServings),
    topsChargeable: chargeable, topsUnit: "serving", topsPublic
  };
}

/* =========================
   Dispenser (medidor 1/5/9) con grid interno
   ========================= */
type MeterOutcome = "miss" | "ok" | "perfect";
function DispenserMachine({
  category, choices, selectedItemId, onSelectItem, byId,
  onResolve, disabled = false, size = "M", muted = false,
  speed = 0.45, // 👈 más lento por defecto
}: {
  category: { id: string; label: string; color: string; emoji?: string };
  choices: string[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  byId: Record<string, InventoryItem | undefined>;
  onResolve: (o: MeterOutcome) => void;
  disabled?: boolean;
  size?: "S" | "M" | "L";
  muted?: boolean;
  speed?: number;
}) {
  const sfx = useSfx(muted);
  const sizeScale = size === "L" ? 1.4 : size === "M" ? 1.2 : 1.0;
  const [pos, setPos] = useState(10);
  const dirRef = useRef<1 | -1>(1);
  const loop = useRef<number | null>(null);
  const serveLock = useRef(false);

  useEffect(() => {
    const spd = Math.max(0.2, Math.min(1, speed ?? 0.45));
    const step = 2.2 * spd;
    loop.current = window.setInterval(() => {
      setPos((p) => {
        let np = p + dirRef.current * step;
        if (np >= 100) { dirRef.current = -1; np = 100; }
        if (np <= 0) { dirRef.current = 1; np = 0; }
        if (!disabled) {
          const dist = Math.abs(50 - np);
          if (dist < 18) sfx.meterTick(Math.min(1, dist / 50));
        }
        return np;
      });
    }, 16);
    return () => { if (loop.current) window.clearInterval(loop.current); };
  }, [disabled, sfx, speed]);

  function pressServe() {
    if (disabled || !selectedItemId || serveLock.current) return;
    serveLock.current = true;

    // zona permisiva (verde bien ancho)
    let out: MeterOutcome = "miss";
    if (pos >= 45 && pos <= 55) out = "perfect";
    else if (pos >= 35 && pos <= 65) out = "ok";

    try { console.log("meter_serve", { outcome: out, pos, speed }); } catch { }

    onResolve(out); sfx.click();
    const disp = document.querySelector(".dispenser") as HTMLElement | null;
    disp?.classList.add("serving"); setTimeout(() => disp?.classList.remove("serving"), 200);
    setTimeout(() => { serveLock.current = false; }, 550);
  }

  const contentKind =
    category.id === "ice" ? "ice" :
      category.id === "powder" ? "powder" :
        category.id === "condensed" ? "condensed" : "liquid";

  const mouthW = (category.id === "ice" ? 64 : 44) * sizeScale;
  const mouthH = (category.id === "ice" ? 34 : 26);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); pressServe(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressServe]);

  return (
    <div className="dispenser"
      data-content={contentKind}
      style={{
        ["--accent" as any]: category.color,
        ["--stream-w" as any]: `${12 * sizeScale}px`,
        ["--mouth-w" as any]: `${mouthW}px`,
        ["--mouth-h" as any]: `${mouthH}px`
      } as React.CSSProperties}>
      <div className="tank">
        <div className="rim top" />
        <div className="glass">
          {/* Slots internos → estantes 2×2 a ambos lados */}
          <div className="slot-shelves" role="listbox" aria-label={`Ingredientes de ${category.label}`}>
            {Array.from({ length: Math.max(1, Math.ceil(choices.length / 4)) }).map((_, b) => (
              <div className="shelf" key={b}>
                {choices.slice(b * 4, b * 4 + 4).map((id) => {
                  const it = byId[id]; const rol = it ? roleOfItem(it) : "mixable";
                  const on = selectedItemId === id;
                  return (
                    <button key={id} className={`slot ${on ? "on" : ""}`}
                      onClick={() => onSelectItem(id)} aria-selected={on} title={it?.name || id}>
                      <span className="ico">{EMOJI_BY_ROLE[rol] || "🍧"}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Medidor tech (delgado) */}
          <div className="meter-inlay" role="meter" aria-label="medidor">
            <div className="track">
              <span className="z red" /><span className="z yellow" /><span className="z green" /><span className="z yellow" /><span className="z red" />
              <span className="pointer" /><span className="needle" style={{ left: `${pos}%` }} />
              <span className="leds" aria-hidden />
            </div>
          </div>

          {/* Botón verde (compacto) */}
          <button className="serve-btn" onClick={pressServe} aria-label="Servir" disabled={disabled || !selectedItemId}>
            <span className="shine" />
          </button>

          <span className="glass-stripes" aria-hidden />
        </div>
        <div className="rim bottom" />
        <div className="spout"><span className="mouth" /><span className="stream" aria-hidden /></div>
      </div>
    </div>
  );
}

/* =========================
   Gantry
   ========================= */
function Gantry({ phase, x, lowered, children }:
  { phase: MachinePhase; x: number; lowered: boolean; children: React.ReactNode }) {
  return (
    <div className="gantry">
      <div className="rail" />
      <div className={`carriage ${lowered ? 'lowered' : ''}`} data-phase={phase}
        style={{ ['--x' as any]: `${x}px` } as React.CSSProperties}>
        <div className="stay-centered machine-scale">{children}</div>
      </div>
    </div>
  );
}

/* =========================
   Header – Botón Perfil
   ========================= */
function ProfileButton() {
  const nav = useNavigate();
  const { user } = useAuth();
  const letter = (user?.displayName?.[0] || user?.email?.[0] || "🙂").toUpperCase();
  return (
    <button className="profile-btn" onClick={() => nav("/perfil")} title={user?.displayName || user?.email || "Perfil"}>
      <span className="avatar">{user?.photoURL ? <img src={user.photoURL} alt="profile" /> : letter}</span>
    </button>
  );
}

/* =========================
   BOWLS fuera (estabilidad de hooks)
   ========================= */
const BOWLS = [
  { id: "whip", emoji: "🥛", label: "Crema", color: "#ffffff" },
  { id: "oreo", emoji: "🍪", label: "Oreo", color: "#343a40" },
  { id: "sprinkles", emoji: "✨", label: "Chispas", color: "linear-gradient(45deg,#f43f5e,#f59e0b,#22c55e,#3b82f6)" },
  { id: "cherry", emoji: "🍒", label: "Cereza", color: "#ef4444" },
  { id: "barquillos", emoji: "🥖", label: "Barquillos", color: "#f0c987" },
  { id: "nuts", emoji: "🥜", label: "Nueces", color: "#a4784e" },
  { id: "banana", emoji: "🍌", label: "Banana", color: "#fde047" },
  { id: "berries", emoji: "🍓", label: "Frutilla", color: "#ec4899" },
] as const;
type Bowl = typeof BOWLS[number];
const BOWLS_BY_ID: Readonly<Record<string, Bowl>> =
  Object.fromEntries(BOWLS.map(b => [b.id, b])) as Readonly<Record<string, Bowl>>;

// Fallback local para evitar 400
const LOCAL_FALLBACK_ITEMS: InventoryItem[] = ([
  { id: "ice_cubes", name: "Hielo (cubos)", unit: "g", category: "hielo" },
  { id: "milk", name: "Leche entera", unit: "ml", category: "líquido" },
  { id: "water", name: "Agua", unit: "ml", category: "líquido" },
  { id: "almond", name: "Leche de almendras", unit: "ml", category: "líquido" },
  { id: "lactosefree", name: "Leche deslactosada", unit: "ml", category: "líquido" },
  { id: "milkpow", name: "Leche en polvo", unit: "g", category: "mixable" },
  { id: "splenda", name: "Splenda", unit: "g", category: "mixable" },
  { id: "sugar", name: "Azúcar", unit: "g", category: "mixable" },
  { id: "panela", name: "Panela", unit: "g", category: "mixable" },
  { id: "cond", name: "Leche condensada", unit: "ml", category: "jarabe" },
  ...VTOPS,
] as any) as InventoryItem[];

/* =========================
   Main
   ========================= */
export default function BuilderClient({ source = "client-app" }: { source?: "client-app" | "kiosk" | "worker"; }) {
  const orgId = useMemo(() => getOrgId(), []);
  const nav = useNavigate();
  const { user } = useAuth();

  // Dev: por defecto usar inventario LOCAL y permitir sin claim
  useEffect(() => {
    try {
      if (localStorage.getItem("forceLocalInventory") === null) {
        localStorage.setItem("forceLocalInventory", "1");
      }
      if (localStorage.getItem("DEV_NO_CLAIM") === null) {
        localStorage.setItem("DEV_NO_CLAIM", "1");
      }
      if (localStorage.getItem("allowRemoteWrites") === null) {
        // Para no spamear 400 por defecto
        localStorage.setItem("allowRemoteWrites", "0");
      }
    } catch { }
  }, []);

  // Claims
  const [claimOrgId, setClaimOrgId] = useState<OrgClaim>(null);
  const [claimReady, setClaimReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const c = await getClaimedOrgId(); if (alive) setClaimOrgId(c); }
      finally { if (alive) setClaimReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  const [station, setStation] = useState<Station>("prep");
  const [sizes] = useState<SizeOption[]>(FALLBACK_SIZES);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // mute
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("sfxMuted:v1") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("sfxMuted:v1", muted ? "1" : "0"); } catch { } }, [muted]);

  // receta
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  // precios
  const [pricing, setPricing] = useState<PricingCfg>(loadPricing());
  const [showPricing, setShowPricing] = useState(false);
  useEffect(() => { savePricing(pricing); }, [pricing]);

  // mix
  const [blendPct, setBlendPct] = useState(0);
  const [isMixing, setIsMixing] = useState(false);
  const mixTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // FX
  const [arc, setArc] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string } | null>(null);
  const cupRef = useRef<HTMLDivElement | null>(null);
  const [pops, setPops] = useState<Array<{ id: string; kind: "pop" | "splash" | "cube" | "dust" | "drop" | "cream" | "flake"; color?: string; x?: number; delay?: number }>>([]);

  // toppings carry
  const [carryTop, setCarryTop] = useState<string | null>(null);

  // secuencia/máquina
  type MachineCategory = { id: string; label: string; color: string; emoji?: string; items: string[]; };
  const [categorySequence, setCategorySequence] = useState<MachineCategory[]>([]);
  const [categoryIndex, setCategoryIndex] = useState<number>(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [machinePhase, setMachinePhase] = useState<MachinePhase>("idle");
  const [carX, setCarX] = useState(0);
  const [carLowered, setCarLowered] = useState(false);

  // ====== Guía colapsable + dificultad ======
  const [showHelp, setShowHelp] = useState(true);
  const [meterSpeed, setMeterSpeed] = useState(0.45);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || (t as any)?.isContentEditable;
      if (editing) return;
      if ((e.key === "h" || e.key === "H") && station === "prep") {
        setShowHelp(v => !v);
        try { console.log("help_toggle", { visible: !showHelp }); } catch { }
      }
      if (e.key === "m" || e.key === "M") {
        setMuted(m => {
          try { console.log("mute", { on: !m }); } catch { }
          return !m;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [station, showHelp]);

  // ====== Movimiento por estantes ======
  const SLOT_GAP = 220;
  function slotXFor(choices: string[] = [], selectedId: string | null = null) {
    const idx = Math.max(0, choices.findIndex(id => id === selectedId));
    const bank = Math.max(0, Math.floor(idx / 4));
    const totalBanks = Math.max(1, Math.ceil(choices.length / 4));
    const centerOffset = (totalBanks - 1) / 2;
    return (bank - centerOffset) * SLOT_GAP;
  }

  // inventory
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!claimReady) return;
      setLoading(true);

      const forceLocal = typeof window !== "undefined" && localStorage.getItem("forceLocalInventory") === "1";
      const denyKey = orgId ? `invDenied:${orgId}` : null;
      const deniedBefore = denyKey ? localStorage.getItem(denyKey) === "1" : false;

      const claimMismatch = !orgId || !claimOrgId || claimOrgId !== orgId;

      if (claimMismatch || deniedBefore || forceLocal || !user) {
        setItems(LOCAL_FALLBACK_ITEMS);
        if (alive) setLoading(false);
        return;
      }

      try {
        const snap = await getDocs(fsQuery(collection(db, "inventoryItems"), where("orgId", "==", orgId)));
        if (!alive) return;
        const inv = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as InventoryItem[];
        inv.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        const missing = [
          { id: "ice_cubes", name: "Hielo (cubos)", unit: "g", category: "hielo" },
          { id: "milk", name: "Leche entera", unit: "ml", category: "líquido" },
          { id: "water", name: "Agua", unit: "ml", category: "líquido" },
          { id: "almond", name: "Leche de almendras", unit: "ml", category: "líquido" },
          { id: "lactosefree", name: "Leche deslactosada", unit: "ml", category: "líquido" },
          { id: "milkpow", name: "Leche en polvo", unit: "g", category: "mixable" },
          { id: "splenda", name: "Splenda", unit: "g", category: "mixable" },
          { id: "sugar", name: "Azúcar", unit: "g", category: "mixable" },
          { id: "panela", name: "Panela", unit: "g", category: "mixable" },
          { id: "cond", name: "Leche condensada", unit: "ml", category: "jarabe" },
          ...VTOPS,
        ].filter((v) => !inv.some((i) => i.id === (v as any).id)) as any[];
        setItems([...(inv as InventoryItem[]), ...(missing as any[])] as InventoryItem[]);
      } catch {
        try { if (denyKey) localStorage.setItem(denyKey, "1"); } catch { }
        setItems(LOCAL_FALLBACK_ITEMS);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orgId, claimReady, claimOrgId]);

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id as string, i] as const)), [items]);

  // llenado vaso
  const capMl = useMemo(() => CUP_ML[(sizeId as "S" | "M" | "L") || "M"] ?? 350, [sizeId]);
  const currentMlEq = useMemo(() => {
    let ml = 0; for (const [id, q] of Object.entries(qtyById)) ml += toMlEq(Number(q || 0), byId[id]?.unit as SvcUnit);
    return ml;
  }, [qtyById, byId]);
  const fillPct = useMemo(() => Math.max(0, Math.min(100, Math.round((currentMlEq / capMl) * 100))), [currentMlEq, capMl]);

  // precio
  const pricingBreakdown = useMemo(() => {
    const sid = (sizeId as "S" | "M" | "L") || "M";
    return calcPublicTotal(qtyById, byId, pricing, sid);
  }, [qtyById, byId, pricing, sizeId]);

  const canPlace = !!user && !!sizeId && Object.values(qtyById).some((q) => Number(q) > 0);

  // helpers
  function addQty(id: string, delta: number) { setQtyById((m) => ({ ...m, [id]: Math.max(0, Number(m[id] || 0) + delta) })); }
  function addQtyCapped(id: string, delta: number) {
    setQtyById((m) => {
      const it = byId[id]; const unit = (it?.unit as SvcUnit) || "pc";
      let ml = 0; for (const [iid, q0] of Object.entries(m)) ml += toMlEq(Number(q0 || 0), byId[iid]?.unit as SvcUnit);
      const deltaMl = toMlEq(delta, unit);
      const room = Math.max(0, capMl - ml);
      let realDelta = delta;
      if (deltaMl > room) {
        if (deltaMl <= 0 || room <= 0) realDelta = 0;
        else {
          const factor = room / deltaMl;
          realDelta = Math.floor(delta * factor);
          if (realDelta <= 0 && (unit === "ml" || unit === "g")) realDelta = Math.min(delta, room);
        }
      }
      const next = Math.max(0, Number(m[id] || 0) + realDelta);
      return { ...m, [id]: next };
    });
  }
  function clearAll() {
    setQtyById({}); setBlendPct(0); setIsMixing(false); setSizeId(null);
    setCategoryIndex(0); setSelectedItemId(null); setStation("prep"); setCarryTop(null);
  }

  // hielo visual
  const iceItemId = items.find((i) => roleOfItem(i) === "ice")?.id ?? null;
  const iceQty = (iceItemId ? qtyById[iceItemId] : 0) || 0;
  const iceCubes = Math.max(0, Math.min(12, Math.round(iceQty / 50) + (iceQty > 0 ? 2 : 0)));

  // orden de categorías
  useEffect(() => {
    const sequence: MachineCategory[] = [];
    (["ice", "liquid", "powder", "condensed"] as const).forEach((cat) => {
      let itemIds: string[] = [];
      if (cat === "ice") itemIds = items.filter((it) => roleOfItem(it) === "ice").map((it) => it.id as string);
      else if (cat === "liquid") itemIds = items.filter((it) => (roleOfItem(it) === "liquid" || roleOfItem(it) === "sparkling") && (it.unit as SvcUnit) === "ml").map((it) => it.id as string);
      else if (cat === "powder") itemIds = items.filter((it) => roleOfItem(it) === "mixable" && (it.unit as SvcUnit) === "g").map((it) => it.id as string);
      else if (cat === "condensed") itemIds = items.filter((it) => it.id === "cond").map((it) => it.id as string);
      if (itemIds.length > 0) { const info = CATEGORY_INFO[cat]; sequence.push({ id: cat, label: info.label, color: info.color, emoji: info.emoji, items: itemIds }); }
    });
    setCategorySequence(sequence); setCategoryIndex(0); setSelectedItemId(null);
  }, [items]);

  // seleccionar siempre el primero
  useEffect(() => {
    if (!categorySequence.length) return;
    if (categoryIndex >= categorySequence.length) return;
    const currentCat = categorySequence[categoryIndex];
    setSelectedItemId(currentCat.items[0] || null);
  }, [categoryIndex, categorySequence]);

  // llegada a categoría → posicionar cabezal
  useEffect(() => {
    if (!categorySequence.length || station !== "prep") return;
    const cat = categorySequence[categoryIndex];
    setCarX(slotXFor(cat?.items, selectedItemId));
    setMachinePhase("arrive");
    const t1 = setTimeout(() => { setCarLowered(true); setMachinePhase("ready"); }, 280);
    return () => { clearTimeout(t1); };
  }, [categorySequence, categoryIndex, station, selectedItemId]);

  useEffect(() => {
    if (station !== "prep") return;
    const cat = categorySequence[categoryIndex];
    if (!cat) return;
    setCarX(slotXFor(cat.items, selectedItemId));
  }, [selectedItemId, station, categoryIndex, categorySequence]);

  function fireArcFromEl(fromEl: HTMLElement, color = "#ec4899") {
    const cup = cupRef.current; if (!cup) return;
    const fr = fromEl.getBoundingClientRect(), to = cup.getBoundingClientRect();
    const from = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
    const midX = to.left + to.width / 2, midY = to.top + 30;
    setArc({ from, to: { x: midX, y: midY }, color }); setTimeout(() => setArc(null), 900);
  }

  // loop mix
  useEffect(() => {
    if (!isMixing) { if (mixTimer.current) { clearInterval(mixTimer.current); mixTimer.current = null; } return; }
    mixTimer.current = setInterval(() => setBlendPct((p) => (p >= 100 ? 100 : p + 1)), 130);
    return () => { if (mixTimer.current) clearInterval(mixTimer.current); };
  }, [isMixing]);

  // Helper: asegurar claim org en token (modo dev relajado)
  async function hasOrgClaimMatch(): Promise<boolean> {
    const local = (typeof window !== "undefined" && (location.hostname.includes("localhost") || localStorage.getItem("forceLocalInventory") === "1"));
    if (DEV_NO_CLAIM || local) return true;
    if (!user) return false;
    try {
      const tok = await user.getIdTokenResult(true);
      const claims: any = tok?.claims || {};
      const claim = claims.orgId ?? claims.org ?? claims.org_id ?? null;
      return !!orgId && claim === orgId;
    } catch { return false; }
  }

  // cola local DEV (sin server) — PARCHEA el optional chain en `new`
  function devEnqueue(order: any) {
    try {
      const key = "workQueue:dev";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(order);
      localStorage.setItem(key, JSON.stringify(list));
      // broadcast seguro (sin `new ?.`)
      try {
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const BC: any = (window as any).BroadcastChannel;
          const ch = new BC("fz:workQueue");
          ch.postMessage(order);
          ch.close?.();
        }
      } catch { }
    } catch { }
  }

  // crear orden + encolar worker
  async function placeOrder() {
    if (!canPlace) { alert("Completa tamaño e ingredientes."); return; }
    if (!orgId) { alert("No hay organización configurada."); return; }

    const orderData = {
      orgId,
      customerUid: user?.uid || "anon",
      customerName: user?.displayName || "Cliente",
      items: Object.entries(qtyById).map(([id, qty]) => ({
        id, qty, name: byId[id]?.name || id, unit: byId[id]?.unit
      })),
      total: pricingBreakdown.totalPublic,
      status: "pending",
      createdAt: serverTimestamp(),
      source,
      size: sizeId,
    };

    try {
      if (source === "kiosk" || source === "worker") {
        await addDoc(collection(db, "orders"), orderData);
        alert(source === "worker" ? "¡Orden creada por Staff!" : "¡Orden enviada!");
        clearAll();
        // Stay on page for Kiosk/Worker to allow next order immediately
        if (source === "worker") {
          // Optional: could navigate back to menu, but staying allows rapid entry
          // nav("/menu"); 
        }
      } else {
        // Client app logic
        if (DEV_NO_CLAIM) {
          devEnqueue(orderData);
          alert("¡Orden enviada (Modo DEV)!");
          clearAll();
          nav("/cliente");
        } else {
          await addDoc(collection(db, "orders"), orderData);
          alert("¡Orden enviada!");
          clearAll();
          nav("/cliente");
        }
      }
    } catch (e: any) {
      console.error(e);
      alert("Error al enviar orden: " + e.message);
    }
  }

  // --- Render Helpers ---
  const currentTicket = (
    <Ticket
      size={sizeId}
      items={Object.entries(qtyById).map(([k, v]) => ({
        name: byId[k]?.name || k,
        qty: Number(v),
        unit: byId[k]?.unit
      }))}
      total={money(pricingBreakdown.totalPublic)}
      blendPct={blendPct}
    />
  );

  return (
    <div className="game-container">
      {/* 1. TOP RAIL (Tickets) */}
      <div className="ticket-rail">
        {currentTicket}
        <div style={{ opacity: 0.5, transform: "scale(0.9)" }}>
          <Ticket size="S" items={[]} total="$0" blendPct={0} />
        </div>
        {arc && <PourArc from={arc.from} to={arc.to} color={arc.color} />}
      </div>

      {/* 2. MAIN STAGE AREA */}
      <div className="stage-container">

        {/* --- PREP (BUILD) STATION --- */}
        {station === "prep" && (
          <div className="stage prep">
            {/* Size Selector Overlay if no size selected */}
            {!sizeId && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 50,
                background: "rgba(0,0,0,0.8)", display: "flex",
                alignItems: "center", justifyContent: "center"
              }}>
                <div className="fz-card" style={{ padding: 32, textAlign: "center" }}>
                  <h2 style={{ marginBottom: 16, color: "var(--fz-ink)" }}>Selecciona Tamaño</h2>
                  <div className="size-selector" style={{ display: "flex", gap: 16 }}>
                    {sizes.map((s) => (
                      <button
                        key={s.id}
                        className={`fz-btn ${sizeId === s.id ? "primary" : "secondary"}`}
                        onClick={() => setSizeId(s.id)}
                        style={{ minWidth: 80 }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Machine Area */}
            <div className="machine-area">
              {categorySequence.length > 0 && categoryIndex < categorySequence.length && (
                <>
                  <DispenserMachine
                    category={categorySequence[categoryIndex]}
                    choices={categorySequence[categoryIndex].items}
                    selectedItemId={selectedItemId}
                    onSelectItem={setSelectedItemId}
                    byId={byId}
                    size={sizeId as any}
                    muted={muted}
                    speed={meterSpeed}
                    onResolve={(outcome) => {
                      if (selectedItemId) {
                        const it = byId[selectedItemId];
                        const role = it ? roleOfItem(it) : "mixable";
                        const step = stepForRole(role, it?.unit as SvcUnit);
                        addQtyCapped(selectedItemId, step);

                        // FX
                        const el = document.querySelector(".spout");
                        if (el) fireArcFromEl(el as HTMLElement, categorySequence[categoryIndex].color);
                      }
                    }}
                  />

                  {/* Controls */}
                  <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
                    <button
                      className="fz-btn secondary"
                      disabled={categoryIndex === 0}
                      onClick={() => setCategoryIndex(i => i - 1)}
                    >
                      ◀ Anterior
                    </button>
                    <button
                      className="fz-btn secondary"
                      onClick={() => {
                        if (categoryIndex < categorySequence.length - 1) {
                          setCategoryIndex(i => i + 1);
                        } else {
                          setStation("mix");
                        }
                      }}
                    >
                      {categoryIndex < categorySequence.length - 1 ? "Siguiente ▶" : "Ir a Mezclar ▶"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* --- MIX STATION --- */}
        {station === "mix" && (
          <div className="stage mix" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div style={{ position: "relative" }}>
              <BlenderHead spinning={isMixing} />
              <Cup fillPct={fillPct} width={260} mixing={isMixing} />
            </div>

            <div style={{ marginTop: 32, textAlign: "center" }}>
              <div className="fz-card" style={{ padding: 16, display: "inline-block" }}>
                <div style={{ marginBottom: 8, fontWeight: "bold" }}>Nivel de Mezcla</div>
                <div style={{ width: 200, height: 20, background: "#e2e8f0", borderRadius: 10, overflow: "hidden", border: "2px solid #cbd5e1", margin: "0 auto" }}>
                  <div style={{ width: `${blendPct}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #22c55e)" }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{blendPct}%</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  className={`fz-btn ${isMixing ? "secondary" : "primary"}`}
                  onMouseDown={() => setIsMixing(true)}
                  onMouseUp={() => setIsMixing(false)}
                  onMouseLeave={() => setIsMixing(false)}
                  onTouchStart={() => setIsMixing(true)}
                  onTouchEnd={() => setIsMixing(false)}
                >
                  {isMixing ? "Mezclando..." : "Mantener para Mezclar"}
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                <button className="fz-btn ghost" onClick={() => setStation("top")}>Terminar Mezcla ▶</button>
              </div>
            </div>
          </div>
        )}

        {/* --- TOP STATION --- */}
        {station === "top" && (
          <div className="stage top" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, height: "100%" }}>
            <div style={{ display: "inline-block", position: "relative", marginBottom: "auto" }}>
              <Cup fillPct={fillPct} width={260} foam />
            </div>

            <div className="toppings-shelf" style={{
              width: "100%",
              background: "rgba(255,255,255,0.9)", padding: 16,
              display: "flex", gap: 16, overflowX: "auto",
              borderTop: "4px solid var(--fz-border)",
              justifyContent: "center"
            }}>
              {items.filter(i => roleOfItem(i) === "topping" || roleOfItem(i) === "whipped").map(it => (
                <div key={it.id} style={{ flex: "0 0 auto", textAlign: "center" }}>
                  <TopBowl
                    id={it.id}
                    emoji={EMOJI_BY_ROLE[roleOfItem(it)]}
                    label={it.name}
                    onPick={() => addQty(it.id, 1)}
                  />
                  <div style={{ fontSize: 12, fontWeight: "bold", marginTop: 4 }}>x{qtyById[it.id] || 0}</div>
                </div>
              ))}
            </div>

            <div style={{ position: "absolute", top: 20, right: 20 }}>
              <button className="fz-btn primary" onClick={placeOrder}>¡TERMINAR ORDEN!</button>
            </div>
          </div>
        )}

      </div>

      {/* 3. BOTTOM TABS */}
      <div className="station-tabs">
        <button className={`tab-btn prep ${station === "prep" ? "active" : ""}`} onClick={() => setStation("prep")}>
          <span>🏗️</span>
          <span>Build</span>
        </button>
        <button className={`tab-btn mix ${station === "mix" ? "active" : ""}`} onClick={() => setStation("mix")}>
          <span>🌪️</span>
          <span>Mix</span>
        </button>
        <button className={`tab-btn top ${station === "top" ? "active" : ""}`} onClick={() => setStation("top")}>
          <span>🍒</span>
          <span>Top</span>
        </button>
      </div>

      {/* Global FX */}
      <PourGuide show={false} />
    </div>
  );
}

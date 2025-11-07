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

import type {
  InventoryItem, TemplateComponent, SizeOption, Unit as SvcUnit,
} from "@/services/types.ar.rb";

import { Cup } from "../components/freezeria/Cup";
import { Ticket } from "../components/freezeria/Ticket";

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
}: { from: {x:number; y:number}; to: {x:number; y:number}; color?: string }) {
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
    const t = ctx.currentTime; v.gain.exponentialRampToValueAtTime(vol, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + ms/1000);
    o.start(t); o.stop(t + ms/1000 + 0.02);
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
type Station = "order" | "prep" | "mix" | "top";
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
  ice:       { label: "Hielo",      color: "#22d3ee", emoji: "🧊" },
  liquid:    { label: "Líquido",    color: "#60a5fa", emoji: "💧" },
  powder:    { label: "Polvos",     color: "#fbbf24", emoji: "🧂" },
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
  const id  = String((it as any)?.id ?? "");
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
function savePricing(p: PricingCfg) { try { localStorage.setItem("pricing:v1", JSON.stringify(p)); } catch {} }

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
    chargeable >= 5  ? pricing.topBulk5Public  :
                       pricing.topPublic;

  const topsPublic = chargeable * unitPrice;
  const totalPublic = basePublic + topsPublic;

  return { totalPublic, basePublic, baseCost,
    topsServings: Math.round(topServings),
    topsChargeable: chargeable, topsUnit: "serving", topsPublic };
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
        if (np <= 0)   { dirRef.current = 1;  np = 0; }
        if (!disabled) {
          const dist = Math.abs(50 - np);
          if (dist < 18) sfx.meterTick(Math.min(1, dist/50));
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

    try { console.log("meter_serve", { outcome: out, pos, speed }); } catch {}

    onResolve(out); sfx.click();
    const disp = document.querySelector(".dispenser") as HTMLElement | null;
    disp?.classList.add("serving"); setTimeout(() => disp?.classList.remove("serving"), 200);
    setTimeout(() => { serveLock.current = false; }, 550);
  }

  const contentKind =
    category.id === "ice"       ? "ice"       :
    category.id === "powder"    ? "powder"    :
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
      style={{ ["--accent" as any]: category.color,
               ["--stream-w" as any]: `${12 * sizeScale}px`,
               ["--mouth-w"  as any]: `${mouthW}px`,
               ["--mouth-h"  as any]: `${mouthH}px` } as React.CSSProperties}>
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
  const user = getAuth().currentUser;
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
  { id: "whip",       emoji: "🥛", label: "Crema",       color: "#ffffff" },
  { id: "oreo",       emoji: "🍪", label: "Oreo",        color: "#343a40" },
  { id: "sprinkles",  emoji: "✨", label: "Chispas",     color: "linear-gradient(45deg,#f43f5e,#f59e0b,#22c55e,#3b82f6)" },
  { id: "cherry",     emoji: "🍒", label: "Cereza",      color: "#ef4444" },
  { id: "barquillos", emoji: "🥖", label: "Barquillos",  color: "#f0c987" },
  { id: "nuts",       emoji: "🥜", label: "Nueces",      color: "#a4784e" },
  { id: "banana",     emoji: "🍌", label: "Banana",      color: "#fde047" },
  { id: "berries",    emoji: "🍓", label: "Frutilla",    color: "#ec4899" },
] as const;
type Bowl = typeof BOWLS[number];
const BOWLS_BY_ID: Readonly<Record<string, Bowl>> =
  Object.fromEntries(BOWLS.map(b => [b.id, b])) as Readonly<Record<string, Bowl>>;

// Fallback local para evitar 400
const LOCAL_FALLBACK_ITEMS: InventoryItem[] = ([
  { id: "ice_cubes", name: "Hielo (cubos)",  unit: "g",  category: "hielo" },
  { id: "milk",      name: "Leche entera",   unit: "ml", category: "líquido" },
  { id: "water",     name: "Agua",           unit: "ml", category: "líquido" },
  { id: "almond",    name: "Leche de almendras", unit: "ml", category: "líquido" },
  { id: "lactosefree",name:"Leche deslactosada",  unit: "ml", category: "líquido" },
  { id: "milkpow",   name: "Leche en polvo", unit: "g",  category: "mixable" },
  { id: "splenda",   name: "Splenda",        unit: "g",  category: "mixable" },
  { id: "sugar",     name: "Azúcar",         unit: "g",  category: "mixable" },
  { id: "panela",    name: "Panela",         unit: "g",  category: "mixable" },
  { id: "cond",      name: "Leche condensada", unit: "ml", category: "jarabe" },
  ...VTOPS,
] as any) as InventoryItem[];

/* =========================
   Main
   ========================= */
export default function BuilderClient({ source = "client-app" }: { source?: "client-app" | "kiosk"; }) {
  const orgId = useMemo(() => getOrgId(), []);
  const nav = useNavigate();
  const user = getAuth().currentUser;

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
    } catch {}
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

  const [station, setStation] = useState<Station>("order");
  const [sizes] = useState<SizeOption[]>(FALLBACK_SIZES);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // mute
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem("sfxMuted:v1") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("sfxMuted:v1", muted ? "1" : "0"); } catch {} }, [muted]);

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
  const [arc, setArc] = useState< { from: {x:number;y:number}; to: {x:number;y:number}; color: string } | null >(null);
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
        try { console.log("help_toggle", { visible: !showHelp }); } catch {}
      }
      if (e.key === "m" || e.key === "M") {
        setMuted(m => {
          try { console.log("mute", { on: !m }); } catch {}
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

      if (claimMismatch || deniedBefore || forceLocal || !getAuth().currentUser) {
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
          { id: "ice_cubes",  name: "Hielo (cubos)", unit: "g",  category: "hielo" },
          { id: "milk",       name: "Leche entera",  unit: "ml", category: "líquido" },
          { id: "water",      name: "Agua",          unit: "ml", category: "líquido" },
          { id: "almond",     name: "Leche de almendras", unit: "ml", category: "líquido" },
          { id: "lactosefree",name:"Leche deslactosada",  unit: "ml", category: "líquido" },
          { id: "milkpow",    name: "Leche en polvo", unit: "g",  category: "mixable" },
          { id: "splenda",    name: "Splenda",        unit: "g",  category: "mixable" },
          { id: "sugar",      name: "Azúcar",         unit: "g",  category: "mixable" },
          { id: "panela",     name: "Panela",         unit: "g",  category: "mixable" },
          { id: "cond",       name: "Leche condensada", unit: "ml", category: "jarabe" },
          ...VTOPS,
        ].filter((v) => !inv.some((i) => i.id === (v as any).id)) as any[];
        setItems([...(inv as InventoryItem[]), ...(missing as any[])] as InventoryItem[]);
      } catch {
        try { if (denyKey) localStorage.setItem(denyKey, "1"); } catch {}
        setItems(LOCAL_FALLBACK_ITEMS);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orgId, claimReady, claimOrgId]);

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id as string, i] as const)), [items]);

  // llenado vaso
  const capMl = useMemo(() => CUP_ML[(sizeId as "S"|"M"|"L") || "M"] ?? 350, [sizeId]);
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
    setCategoryIndex(0); setSelectedItemId(null); setStation("order"); setCarryTop(null);
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
    const u = getAuth().currentUser;
    if (!u) return false;
    try {
      const tok = await u.getIdTokenResult(true);
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
      } catch {}
    } catch {}
  }

  // crear orden + encolar worker
  async function placeOrder() {
    if (!canPlace) { alert("Completa tamaño e ingredientes."); return; }
    if (!orgId) { alert("No hay organización configurada."); return; }
    if (!user) { alert("Inicia sesión para pedir."); return; }

    const okClaim = await hasOrgClaimMatch();
    const allowRemote = localStorage.getItem("allowRemoteWrites") === "1";
    const tryRemote = okClaim && allowRemote;

    const s = sizes.find((x) => x.id === sizeId)!;
    const components: TemplateComponent[] = Object.entries(qtyById)
      .filter(([, qty]) => Number(qty || 0) > 0)
      .map(([id, qty]) => ({ itemId: id, qty: Number(qty || 0), unit: ((byId[id]?.unit as SvcUnit) ?? "pc") as SvcUnit }));

    const orderPayload: any = {
      custom: true,
      sizeId: s.id,
      components,
      price: pricingBreakdown.totalPublic,
      meta: {
        basePublic: pricingBreakdown.basePublic,
        baseCost: pricingBreakdown.baseCost,
        topsServings: pricingBreakdown.topsServings,
        topsChargeable: pricingBreakdown.topsChargeable,
        topsUnit: pricingBreakdown.topsUnit,
        topsPublic: pricingBreakdown.topsPublic,
      },
    };

    let orderId: string | null = null;
    let wroteRemote = false;

    if (tryRemote) {
      try {
        orderId = await createOrderFromBuilder({ orgId, userId: user.uid, source, items: [orderPayload] });
        wroteRemote = true;
      } catch (e: any) {
        console.warn("createOrderFromBuilder falló; intento batch:", e?.message);
        try {
          const batch = writeBatch(db);
          const orderRef = doc(collection(db, "orders"));
          batch.set(orderRef, {
            id: orderRef.id, orgId, userId: user.uid, source,
            items: [orderPayload], status: "pending", createdAt: serverTimestamp(),
          });
          const qRef = doc(collection(db, `orgs/${orgId}/workQueue`), orderRef.id);
          batch.set(qRef, {
            orgId, orderId: orderRef.id, route: "kitchen", kind: "builder-ticket",
            status: "queued", sizeId: s.id, total: pricingBreakdown.totalPublic,
            createdAt: serverTimestamp(), source, createdBy: user.uid,
          });
          await batch.commit();
          orderId = orderRef.id;
          wroteRemote = true;
        } catch (ee) {
          console.warn("Batch remoto falló. Cambio a cola local DEV.", ee);
          wroteRemote = false;
        }
      }
    }

    if (!wroteRemote) {
      // dev enqueue local (sin errores 400)
      const localId = Math.random().toString(36).slice(2);
      orderId = localId;
      devEnqueue({
        id: localId,
        orgId,
        userId: user.uid,
        source,
        items: [orderPayload],
        status: "queued",
        sizeId: s.id,
        total: pricingBreakdown.totalPublic,
        createdAt: Date.now(),
      });
    } else {
      // encolar visual en subcolección (si hay permiso). No reintentar si falla.
      try {
        await addDoc(collection(db, "orgs", orgId, "workQueue"), {
          orgId,
          orderId: String(orderId || ""),
          route: "kitchen",
          kind: "builder-ticket",
          status: "queued",
          sizeId: s.id,
          total: pricingBreakdown.totalPublic,
          createdAt: serverTimestamp(),
          source,
          createdBy: user.uid,
        });
      } catch (e) {
        console.warn("No se pudo encolar en workQueue (ver reglas). La orden igualmente existe.", e);
      }
    }

    alert(`¡Orden creada! #${(orderId || "").slice(0, 6)}${wroteRemote ? "" : " (DEV local)"}`);
    clearAll(); nav("/cliente");
  }

  function goStation(s: Station) { if (s === "prep" && !sizeId) { alert("Elige un tamaño primero."); return; } setStation(s); }

  const scaleBySize = sizeId === "L" ? 1.1 : sizeId === "S" ? 0.92 : 1;
  const isMixStation = station === "mix";
  const mixingActive = isMixStation && isMixing;

  if (!claimReady) return <div className="p-6">Cargando…</div>;
  if (loading) return <div className="p-6">Cargando…</div>;

  const bowlsById = BOWLS_BY_ID;

  const STATIONS: ReadonlyArray<readonly [Station, string, string]> = [
    ["order", "ORDEN", "🧾"],
    ["prep",  "MÁQUINA", "🧪"],
    ["mix",   "LICUADO", "⚙️"],
    ["top",   "TOPPINGS", "🍬"],
  ] as const;

  function handleItemResolve(outcome: MeterOutcome) {
    if (!selectedItemId) return;
    const item = byId[selectedItemId]; if (!item) return;

    const catId = categorySequence[categoryIndex]?.id as "ice" | "liquid" | "powder" | "condensed";
    const perPulse = stepForRole(roleOfItem(item), item.unit as SvcUnit);
    const pulses = outcome === "perfect" ? 1 : outcome === "ok" ? 5 : 9;
    const shouldAdvance = outcome !== "miss";

    const spout = document.querySelector(".dispenser .spout") as HTMLElement | null;

    for (let i = 0; i < pulses; i++) {
      setTimeout(() => {
        addQtyCapped(item.id as string, perPulse);

        if (catId === "ice") {
          const n = 6 + Math.round(Math.random() * 4);
          setPops(p => [...p, ...Array.from({ length: n }).map((_, j) => ({
            id: Math.random().toString(36).slice(2), kind: "cube" as const, x: (Math.random() * 60) - 30, delay: j * 40,
          }))]); setTimeout(() => setPops(p => p.filter(x => x.kind !== "cube")), 1200);
        } else if (catId === "powder") {
          setPops(p => [...p, ...Array.from({ length: 4 }).map(() => ({ id: Math.random().toString(36).slice(2), kind: "dust" as const }))]);
          setTimeout(() => setPops(p => p.filter(x => x.kind !== "dust")), 900);
        } else {
          setPops(p => [...p, ...Array.from({ length: 5 }).map(() => ({
            id: Math.random().toString(36).slice(2), kind: "drop" as const,
            x: (Math.random() * 18) - 9,
            color: catId === "condensed" ? "#f7e7c1" : "#9dd9ff",
          }))]);
          setTimeout(() => setPops(p => p.filter(x => x.kind !== "drop")), 1100);
          if (spout) fireArcFromEl(spout, categorySequence[categoryIndex]?.color || "#ec4899");
        }
      }, i * 170);
    }

    const perShotMs = catId === "powder" ? 150 : 190;
    const pourMs = Math.max(240, perShotMs * pulses);
    setMachinePhase("pour");
    setTimeout(() => { setCarLowered(false); setMachinePhase("retract"); }, pourMs);
    setTimeout(() => {
      const cat = categorySequence[categoryIndex];
      setCarX(slotXFor(cat?.items, selectedItemId));
      setMachinePhase("travel");
    }, pourMs + 260);
    setTimeout(() => { setCarLowered(true); setMachinePhase("lower"); }, pourMs + 260 + 360);
    setTimeout(() => {
      setMachinePhase("ready");
      if (shouldAdvance) { setSelectedItemId(null); setCategoryIndex(i => i + 1); }
    }, pourMs + 260 + 360 + 260);
  }

  const showGuide =
    station === "prep" &&
    (machinePhase === "ready" || machinePhase === "pour" || machinePhase === "lower") &&
    categorySequence[categoryIndex]?.id !== "ice";

  // Cat actual e item seleccionado
  const currentCat = categorySequence[categoryIndex];
  const currentItemName = selectedItemId ? (byId[selectedItemId]?.name || currentCat?.label) : currentCat?.label;

  return (
    <div className="freezeria-root" data-station={station}>
      <div className="fx-bkg" />
      <header className="header">
        <div className="brand">Artemisa • Freezer</div>
        <div className="crumbs">
          {STATIONS.map(([id, label, icon]) => (
            <button key={id} className={`crumb ${station === id ? "on" : ""}`} onClick={() => goStation(id)}>
              <span className="ic">{icon}</span> {label}
            </button>
          ))}
          <button
            className={`mute-btn ${muted ? "off" : "on"}`}
            onClick={() => { setMuted(m => !m); try { console.log("mute", { on: !muted }); } catch {} }}
            title={muted ? "Sonido desactivado (M)" : "Sonido activado (M)"}>
            {muted ? "🔇" : "🔊"} <span className="mute-lbl">Mute</span>
          </button>
        </div>
        <ProfileButton />
      </header>

      <div className="freezeria-grid">
        {/* Stage */}
        <section className={`stage ${station}`}>
          <PourGuide show={showGuide} />

          {/* Vaso */}
          {station !== "order" && (
            <div className="cup-hold" ref={cupRef} data-ice={iceCubes}
              style={{ transform: `translateX(-50%) scale(${scaleBySize})` }}>
              {isMixStation && <BlenderHead spinning={isMixing} />}
              <span className="frappe-lid" aria-hidden />
              <span className="frappe-straw" aria-hidden />
              {isMixStation
                ? <div className="blender-jar"><Cup fillPct={fillPct} foam={blendPct >= 60} mixing={mixingActive} /></div>
                : <Cup fillPct={fillPct} foam={blendPct >= 60} mixing={mixingActive} />}

              {/* Cuchara carry */}
              {station === "top" && carryTop && (
                <button className="carry-spoon" title="Soltar en el vaso"
                  onClick={() => {
                    if (carryTop === "whip") {
                      setPops(p => [...p, ...Array.from({ length: 3 }).map((_,i) => ({ id: Math.random().toString(36).slice(2), kind:"cream" as const, delay: i * 120 }))]);
                      setTimeout(() => setPops(p => p.filter(x=>x.kind!=="cream")), 1200);
                    } else if (carryTop === "sprinkles") {
                      setPops(p => [...p, ...Array.from({ length: 14 }).map(() => ({ id: Math.random().toString(36).slice(2), kind:"flake" as const, color:"#ff9de1", x:(Math.random()*80)-40 }))]);
                      setTimeout(() => setPops(p => p.filter(x=>x.kind!=="flake")), 1300);
                    } else {
                      setPops(p => [...p, { id: Math.random().toString(36).slice(2), kind:"pop" }]); setTimeout(() => setPops(p => p.slice(1)), 700);
                    }
                    addQty("areq" === carryTop ? "areq" : carryTop, carryTop === "areq" ? 10 : 1);
                    setCarryTop(null);
                  }}>
                  <span className="spoon" /><span className="blob">{bowlsById[carryTop]?.emoji || "🍧"}</span>
                </button>
              )}

              {/* partículas */}
              <div className="pop-layer" aria-hidden>
                {pops.map((pp) =>
                  pp.kind === "cube" ? (
                    <span key={pp.id} className="cube" style={{ left: `calc(50% + ${pp.x ?? 0}px)`, animationDelay: `${pp.delay ?? 0}ms` }} />
                  ) : pp.kind === "dust" ? (
                    <span key={pp.id} className="dust" />
                  ) : pp.kind === "drop" ? (
                    <span key={pp.id} className="drop" style={{ left: `calc(50% + ${pp.x ?? 0}px)`, background: pp.color || "#9dd9ff" }} />
                  ) : pp.kind === "cream" ? (
                    <span key={pp.id} className="cream" style={{ animationDelay: `${pp.delay ?? 0}ms` }} />
                  ) : pp.kind === "flake" ? (
                    <span key={pp.id} className="flake" style={{ left: `calc(50% + ${pp.x ?? 0}px)`, background: pp.color || "#ffd166" }} />
                  ) : (
                    <span key={pp.id} className={`pop ${pp.kind === "splash" ? "splash" : ""}`} />
                  )
                )}
              </div>
            </div>
          )}

          {/* Máquina */}
          {station === "prep" && currentCat && (
            <Gantry phase={machinePhase} x={carX} lowered={carLowered}>
              <DispenserMachine
                category={currentCat}
                choices={currentCat.items}
                selectedItemId={selectedItemId}
                onSelectItem={(id)=>setSelectedItemId(id)}
                byId={byId}
                size={(sizeId as "S"|"M"|"L") || "M"}
                disabled={machinePhase !== "ready"}
                onResolve={handleItemResolve}
                muted={muted}
                speed={meterSpeed}
              />
            </Gantry>
          )}

          {/* Orden */}
          {station === "order" && (
            <div className="order-station">
              <h2>1) Elige el tamaño</h2>
              <div className="size-rail">
                {sizes.map((s) => (
                  <button key={s.id} className={`size-pill ${sizeId === s.id ? "on" : ""}`} onClick={() => setSizeId(s.id)}>
                    <span className="cup-ico" /><span className="lbl">{s.label}</span><span className="price">{money(s.basePrice)}</span>
                  </button>
                ))}
              </div>

              <div style={{margin: "8px 0", display: "flex", gap: 8, flexWrap:"wrap"}}>
                <button className="fz-btn" onClick={() => setShowPricing(v => !v)}>{showPricing ? "Ocultar" : "Configurar precios"}</button>
                <button className="fz-btn" onClick={() => {
                  const v = localStorage.getItem("forceLocalInventory") === "1";
                  localStorage.setItem("forceLocalInventory", v ? "0" : "1");
                  try { console.log("inv_mode", { mode: v ? "remote" : "local" }); } catch {}
                  location.reload();
                }}>{localStorage.getItem("forceLocalInventory")==="1" ? "Inventario: LOCAL" : "Inventario: REMOTO"}</button>
                <button className="fz-btn" onClick={() => {
                  const v = localStorage.getItem("allowRemoteWrites") === "1";
                  localStorage.setItem("allowRemoteWrites", v ? "0" : "1");
                  alert(`Servidor ${v ? "desactivado" : "activado"} para pedidos.`);
                }}>{localStorage.getItem("allowRemoteWrites")==="1" ? "Usar servidor: SÍ" : "Usar servidor: NO"}</button>
                {DEV_NO_CLAIM && <span className="hint">DEV_NO_CLAIM activo</span>}
              </div>

              {showPricing && (
                <div className="pricing-card">
                  <h3>Config de precios</h3>
                  <div className="grid2">
                    <label>Vaso $<input type="number" value={pricing.cupCost} onChange={e=>setPricing({...pricing, cupCost:+(e.target.value||0)})}/></label>
                    <label>Hielo /50g $<input type="number" value={pricing.icePer50g} onChange={e=>setPricing({...pricing, icePer50g:+(e.target.value||0)})}/></label>
                    <label>Líquido /50ml $<input type="number" value={pricing.liquidPer50ml} onChange={e=>setPricing({...pricing, liquidPer50ml:+(e.target.value||0)})}/></label>
                    <label>Polvos /10g $<input type="number" value={pricing.powderPer10g} onChange={e=>setPricing({...pricing, powderPer10g:+(e.target.value||0)})}/></label>
                    <label>Condensada /10ml $<input type="number" value={pricing.condensedPer10ml} onChange={e=>setPricing({...pricing, condensedPer10ml:+(e.target.value||0)})}/></label>
                    <label>Margen base $<input type="number" value={pricing.baseMargin} onChange={e=>setPricing({...pricing, baseMargin:+(e.target.value||0)})}/></label>
                  </div>
                  <div className="grid2">
                    <label>Topping 1–4 $<input type="number" value={pricing.topPublic} onChange={e=>setPricing({...pricing, topPublic:+(e.target.value||0)})}/></label>
                    <label>Topping 5–9 $<input type="number" value={pricing.topBulk5Public} onChange={e=>setPricing({...pricing, topBulk5Public:+(e.target.value||0)})}/></label>
                    <label>Topping 10+ $<input type="number" value={pricing.topBulk10Public} onChange={e=>setPricing({...pricing, topBulk10Public:+(e.target.value||0)})}/></label>
                    <label>Gratis S <input type="number" value={pricing.freebies.S} onChange={e=>setPricing({...pricing, freebies:{...pricing.freebies, S:+(e.target.value||0)}})}/></label>
                    <label>Gratis M <input type="number" value={pricing.freebies.M} onChange={e=>setPricing({...pricing, freebies:{...pricing.freebies, M:+(e.target.value||0)}})}/></label>
                    <label>Gratis L <input type="number" value={pricing.freebies.L} onChange={e=>setPricing({...pricing, freebies:{...pricing.freebies, L:+(e.target.value||0)}})}/></label>
                  </div>
                  <small className="hint">La base = costo real (vaso+hielo+líquidos+polvos+condensada) + margen. La ganancia fuerte está en Toppings.</small>
                </div>
              )}

              <div className="hint">Luego pasa a <b>Máquina</b> para añadir hielo, bases y condensada.</div>
              <div className="order-cta">
                <button className="fz-btn primary" disabled={!sizeId} onClick={() => goStation("prep")}>Continuar → Máquina</button>
              </div>
            </div>
          )}

          {/* Panel de ayuda Prep */}
          {station === "prep" && currentCat && (
            <>
              <div className={`prep-wrap ${showHelp ? "" : "hidden"}`}>
                <div className="step-progress">
                  {categorySequence.map((cat, idx) => (
                    <div key={idx} className={`step-icon ${idx < categoryIndex ? "done" : idx === categoryIndex ? "current" : ""}`} title={cat.label}>
                      <span className="icon-emoji">{cat.emoji}</span>
                    </div>
                  ))}
                </div>
                <div className="machine-meter">
                  <div className="prep-top-row">
                    <h3 className="prep-title">Añadir {currentItemName}</h3>
                    <button className="mini" onClick={() => { setShowHelp(false); try { console.log("help_toggle", { visible: false }); } catch {} }}>Ocultar guía (H)</button>
                  </div>
                  <p className="hint">
                    Elige un ingrediente en los <b>cuadros</b> dentro de la máquina y pulsa el botón <b>verde</b> cuando la aguja esté en <b>VERDE</b>.
                    Amarillo: 5 dosis. Rojo: 9 dosis.
                  </p>
                  <div className="hint" style={{marginTop:8}}>
                    Dificultad:
                    <select
                      value={meterSpeed}
                      onChange={e=>{ const nv = +e.target.value; setMeterSpeed(nv); try { console.log("difficulty", { speed: nv }); } catch {} }}
                      style={{marginLeft:6}}>
                      <option value={0.35}>Muy lento</option>
                      <option value={0.45}>Lento</option>
                      <option value={0.75}>Normal</option>
                      <option value={1}>Rápido</option>
                    </select>
                  </div>
                  <div className="row-actions">
                    <button className="btn-trash" onClick={clearAll}>X TRASH</button>
                    {categoryIndex + 1 >= categorySequence.length && (
                      <button className="btn-finish" onClick={() => goStation("mix")}>Ir a Licuado ✓</button>
                    )}
                  </div>
                </div>
              </div>
              {!showHelp && (
                <button className="help-fab" onClick={() => { setShowHelp(true); try { console.log("help_toggle", { visible: true }); } catch {} }} title="Mostrar guía (H)">❔ Guía</button>
              )}
            </>
          )}

          {/* Mix */}
          {station === "mix" && (
            <div className="mix-wrap">
              <div className="mix-meter">
                <span>Chunky</span>
                <div className={`bar ${blendPct >= 72 && blendPct <= 88 ? "sweet" : ""}`} title={blendPct >= 72 && blendPct <= 88 ? "¡Perfecto!" : ""}>
                  <em className="sweet-zone" /><span style={{ width: `${blendPct}%` }} />
                </div>
                <span>Smooth</span>
              </div>
              <div className="controls">
                {!isMixing ? <button className="fz-btn primary" onClick={() => setIsMixing(true)}>Iniciar</button>
                           : <button className="fz-btn" onClick={() => setIsMixing(false)}>Pausar</button>}
                <button className="fz-btn" onClick={() => { setBlendPct(0); setIsMixing(false); }}>Reiniciar</button>
                <button className="fz-btn" onClick={() => goStation("top")}>Ir a Toppings →</button>
              </div>
            </div>
          )}

          {/* Top */}
          {station === "top" && (
            <div className="top-wrap">
              <h2>4) Toppings</h2>
              <div className="hint">
                Clickea un topping para <b>tomarlo con la cuchara</b>, luego clic en la cuchara para soltarlo en el vaso. <b>Gratis:</b> S {pricing.freebies.S}, M {pricing.freebies.M}, L {pricing.freebies.L}.{" "}
                <b>Promos:</b> 5–9 a ${pricing.topBulk5Public} c/u, 10+ a ${pricing.topBulk10Public} c/u.
              </div>
              <div className="sauce-row">
                <SauceBottle label="Arequipe" color="#8b5e34"
                  onSqueeze={() => { const el = document.querySelector(".sauce") as HTMLElement | null;
                    if (el) fireArcFromEl(el, "#8b5e34"); addQty("areq", 10);
                    setPops((p) => [...p, { id: Math.random().toString(36).slice(2), kind: "splash" }]);
                    setTimeout(() => setPops((p) => p.slice(1)), 700); }} />
              </div>
              <div className="bowl-shelf">
                {BOWLS.map((b) => (
                  <TopBowl key={b.id} id={b.id} emoji={b.emoji} label={b.label} color={b.color}
                    onPick={(id) => setCarryTop(id)} />
                ))}
              </div>
              <div className="row-actions">
                <button className="fz-btn" onClick={() => goStation("prep")}>← Volver a Máquina</button>
                <button className="fz-btn primary" disabled={!canPlace} onClick={placeOrder}
                  title={user ? "" : "Inicia sesión para pedir"}>Pedir ✓</button>
              </div>
            </div>
          )}
          {arc && <PourArc from={arc.from} to={arc.to} color={arc.color} />}
        </section>

        {/* Ticket */}
        <aside className="ticket-panel">
          <Ticket
            size={sizeId}
            items={Object.entries(qtyById).map(([id, qty]) => ({ name: byId[id]?.name || id, qty, unit: ((byId[id]?.unit as string) || "u") as string }))}
            total={money(pricingBreakdown.totalPublic)}
            blendPct={blendPct}
          />
          <div className="ticket-actions">
            <button className="fz-btn" onClick={clearAll}>Vaciar</button>
            <button className="fz-btn primary" disabled={!canPlace} onClick={placeOrder} title={user ? "" : "Inicia sesión para pedir"}>Pedir</button>
          </div>
        </aside>
      </div>

      {/* Dock */}
      <nav className="stations">
        {STATIONS.map(([id, label]) => (
          <button key={id} className={`tab ${station === id ? "active" : ""} ${id}`} onClick={() => goStation(id)}>
            {label} <span className="station-sub">station</span>
          </button>
        ))}
      </nav>

      <style>{STYLE}</style>
    </div>
  );
}

/* =========================
   Styles — tema heladería (violetas/rosas) + ajustes UX/Accesibilidad
   ========================= */
const STYLE = `
:root{--ink:#461a3e;--muted:#835a7a;--primary:#a855f7;--accent:#ec4899}
*{box-sizing:border-box} body{margin:0}
.freezeria-root{min-height:100dvh;position:relative;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:linear-gradient(#f9e8ff,#ffe0f4)}
.fx-bkg::after{content:"";position:fixed;inset:0;background:
  radial-gradient(ellipse at 50% -10%,rgba(168,85,247,.22),transparent 60%),
  radial-gradient(ellipse at 50% 110%,rgba(236,72,153,.16),transparent 60%);pointer-events:none}
.header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px}
.brand{font-weight:900;letter-spacing:.3px}
.crumbs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.crumb{border:none;background:#fff;padding:6px 10px;border-radius:999px;box-shadow:0 2px 0 rgba(0,0,0,.06);cursor:pointer}
.crumb.on{background:#f5e8ff}
.mute-btn{border:none;background:#fff;padding:6px 10px;border-radius:10px;cursor:pointer}
.profile-btn{border:none;background:transparent;cursor:pointer}
.profile-btn .avatar{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 2px 0 rgba(0,0,0,.06);font-weight:800}

.freezeria-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;padding:10px}
@media (max-width:1000px){.freezeria-grid{grid-template-columns:1fr}}
.stage{position:relative;border-radius:14px;background:linear-gradient(#f1d6ff,#ffd1f1);min-height:70vh;box-shadow:inset 0 1px 0 rgba(255,255,255,.7);overflow:hidden}
.ticket-panel{background:#fff;border-radius:14px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,.08);min-height:200px}
.ticket-actions{display:flex;gap:8px;margin-top:10px}

/* ---------- Vaso centrado (más abajo), por debajo de la máquina ---------- */
.cup-hold{position:absolute;left:50%;bottom:1.5%;transform:translateX(-50%);z-index:2}
.blender-jar{position:absolute;left:50%;transform:translateX(-50%);bottom:0}

/* Cúpula y pitillo de frappe */
.frappe-lid{position:absolute;left:50%;transform:translateX(-50%);bottom:58%;width:180px;height:80px;border-radius:90px/40px;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.75),rgba(255,255,255,.2) 60%,transparent 70%);filter:blur(.2px);pointer-events:none}
.frappe-straw{position:absolute;left:calc(50% + 36px);bottom:48%;width:16px;height:110px;border-radius:10px;background:linear-gradient(#9dd9ff,#67b7ff);box-shadow:inset 0 -3px 0 rgba(0,0,0,.08);transform:translateX(-50%) rotate(6deg);pointer-events:none}

.pop-layer{position:absolute;inset:0;pointer-events:none}
.pop{position:absolute;left:50%;bottom:35%;width:10px;height:10px;background:#ffc8eb;border-radius:50%;transform:translateX(-50%);animation:pop .7s ease forwards}
.pop.splash{width:60px;height:20px;border-radius:20px;background:rgba(255,200,235,.6);left:calc(50% - 30px)}
@keyframes pop{from{opacity:0;transform:translate(-50%,10px)}to{opacity:0;transform:translate(-50%,-30px)}}
.drop{position:absolute;bottom:46%;width:6px;height:10px;border-radius:6px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.08))}
.dust{position:absolute;left:50%;bottom:50%;width:6px;height:6px;background:#fcd34d;border-radius:50%;opacity:.9;animation:fall .9s linear forwards}
.cube{position:absolute;bottom:46%;width:14px;height:14px;background:#e8faff;border-radius:2px;transform:translateX(-50%);animation:fall .9s ease-out forwards;box-shadow:inset 0 2px 0 #fff}
.cream{position:absolute;left:50%;bottom:44%;width:50px;height:24px;transform:translateX(-50%);background:#fff;border-radius:20px;box-shadow:0 2px 0 rgba(0,0,0,.06);animation:cream .9s ease-out forwards}
.flake{position:absolute;bottom:48%;width:6px;height:10px;border-radius:2px;animation:fall .8s linear forwards}
@keyframes fall{to{transform:translate(-50%,60px);opacity:0}}
@keyframes cream{to{bottom:50%;opacity:0}}

/* ---------- Máquina (compacta, no tapa el vaso) ---------- */
.dispenser{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:520px;height:190px;--accent:#ec4899;z-index:4}
.dispenser .tank{position:absolute;inset:0;border-radius:16px;background:
  linear-gradient(#fff7ff,#f3e7ff);box-shadow:0 10px 30px rgba(0,0,0,.06)}
.dispenser .rim.top,.dispenser .rim.bottom{position:absolute;left:16px;right:16px;height:10px;border-radius:8px;background:#e9d9ff}
.dispenser .rim.top{top:8px}.dispenser .rim.bottom{bottom:54px}
.dispenser .glass{position:absolute;left:26px;right:26px;top:20px;bottom:78px;border-radius:10px;background:
  linear-gradient(#ffffff,#fff1fb);box-shadow:inset 0 2px 0 #fff}

/* Vitrina por estantes 2×2 a izquierda y derecha */
.dispenser .slot-shelves{
  position:absolute; left:14px; right:14px; top:10px; display:flex;
  gap:18px; justify-content:space-between; align-items:flex-start; flex-wrap:nowrap;
}
.dispenser .shelf{
  display:grid; grid-template-columns:repeat(2,58px); grid-template-rows:repeat(2,58px);
  gap:8px; padding:6px; border-radius:10px;
  background:linear-gradient(#f7f2ff,#f0e6ff);
  box-shadow:inset 0 1px 0 #fff, inset 0 -2px 0 #e6d9ff;
}
.dispenser .slot{ width:58px; height:58px; border:none; background:#fff;
  border-radius:10px; display:grid; place-items:center; cursor:pointer;
  box-shadow:0 2px 0 rgba(0,0,0,.06), inset 0 1px 0 #fff, inset 0 -2px 0 #eadfff;
}
.dispenser .slot.on{ outline:3px solid var(--accent); outline-offset:-3px; }
.dispenser .slot .ico{ font-size:20px }

/* Medidor 1/5/9 DELGADO */
.dispenser .meter-inlay{position:absolute;left:22px;right:90px;bottom:42px;height:18px;background:#2b0f26;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 2px rgba(255,255,255,.06)}
.dispenser .track{position:relative;height:100%}
.dispenser .z{position:absolute;top:0;bottom:0;width:20%}
.dispenser .z.red{left:0;background:linear-gradient(#9e1c1c,#b83a3a)}
.dispenser .z.yellow{left:20%;width:30%;background:linear-gradient(#cc8b13,#f6b94c)}
/* Verde más ANCHO y centrado */
.dispenser .z.green{left:37%;width:26%;background:linear-gradient(#0c8a3e,#16c172);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)}
.dispenser .pointer{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#fff;opacity:.25}
.dispenser .needle{position:absolute;top:-6px;width:2px;height:30px;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.08)}
.dispenser .leds{position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 8px,transparent 8px 16px);pointer-events:none}

/* Botón verde COMPACTO */
.dispenser .serve-btn{position:absolute;right:22px;bottom:34px;width:40px;height:40px;border:none;border-radius:50%;background:var(--accent);color:#fff;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.14)}
.dispenser .serve-btn::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 10px rgba(255,255,255,.55) inset}
.dispenser .serve-btn:disabled{opacity:.5;cursor:not-allowed}

/* Pitorro y chorro */
.dispenser .spout{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;height:40px}
.dispenser .mouth{display:block;width:var(--mouth-w,44px);height:var(--mouth-h,26px);background:#f2c6ff;border-radius:6px}
.dispenser .stream{position:absolute;left:calc(50% - var(--stream-w,10px)/2);top:6px;width:var(--stream-w,10px);bottom:-6px;background:linear-gradient(var(--accent),transparent);border-radius:10px;opacity:0;transition:.12s}
.dispenser.serving .stream{opacity:1}

/* Gantry encima del vaso, debajo del panel */
.gantry{position:absolute;inset:0;z-index:3}
.gantry .rail{position:absolute;left:0;right:0;top:0;height:16px;background:linear-gradient(#e4ccff,#c7a6ff)}
.gantry .carriage{position:absolute;left:calc(50% + var(--x,0px));top:0;transform:translateX(-50%);transition:transform .3s ease, top .3s ease;pointer-events:auto}
.gantry .carriage.lowered{top:6px}

/* Guía visual */
.pour-guide.on{position:absolute;inset:0;border-radius:14px;outline:3px dashed rgba(255,255,255,.4);outline-offset:-6px;pointer-events:none}

/* ---------- Panel de ayuda PREP reposicionado y colapsable ---------- */
.prep-wrap{position:absolute;left:16px;top:16px;width:360px;z-index:5;background:rgba(255,255,255,.88);backdrop-filter:blur(2px);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.12);padding:10px}
.prep-wrap.hidden{ transform:translateX(-8px) translateY(-8px); opacity:.0; pointer-events:none; }
.mini{ border:none; background:#f1e6ff; padding:6px 10px; border-radius:10px; cursor:pointer; font-size:12px }
.help-fab{
  position:absolute; left:16px; top:16px; z-index:6;
  border:none; background:#a855f7; color:#fff; border-radius:999px; padding:8px 12px; cursor:pointer;
  box-shadow:0 8px 20px rgba(168,85,247,.35);
}

.step-progress{display:flex;gap:8px;margin:6px 0 10px}
.step-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#f5e8ff}
.step-icon.current{outline:2px solid var(--primary)}
.step-icon.done{background:#d1ffd9}
.machine-meter{padding:6px 6px 10px}

/* Orden */
.order-station{padding:16px 14px}
.hint{color:var(--muted);font-size:13px;margin:6px 0}
.order-cta{margin-top:6px}
.fz-btn{border:none;background:#ffe8fb;padding:8px 12px;border-radius:10px;cursor:pointer}
.fz-btn.primary{background:var(--primary);color:#fff}

/* Tamaños */
.size-rail{display:flex;gap:8px;flex-wrap:wrap}
.size-pill{border:none;background:#fff;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:center;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.06)}
.size-pill .cup-ico::after{content:"🥤";font-size:18px}
.size-pill.on{outline:2px solid var(--primary)}
.size-pill .price{font-weight:800;color:#7c3aed}

/* Mix */
.mix-wrap{padding:12px}
.mix-meter{display:flex;align-items:center;gap:10px}
.mix-meter .bar{position:relative;flex:1;height:16px;background:#fde6ff;border-radius:999px;overflow:hidden}
.mix-meter .bar>span{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#a855f7,#7c3aed)}
.mix-meter .sweet-zone{position:absolute;left:72%;right:12%;top:0;bottom:0;background:rgba(16,193,121,.15)}
.mix-meter .bar.sweet{box-shadow:0 0 0 2px rgba(16,193,121,.6) inset}

/* Top */
.top-wrap{padding:12px}
.sauce-row{display:flex;gap:10px;margin:6px 0}
.bowl-shelf{display:flex;flex-wrap:wrap;gap:8px}
.carry-spoon{position:absolute;left:50%;top:20%;transform:translateX(-50%);border:none;background:transparent;cursor:pointer}
.carry-spoon .spoon{display:block;width:120px;height:28px;border-radius:14px;background:linear-gradient(#f0eef3,#d9dce2)}
.carry-spoon .blob{position:absolute;left:50%;top:-20px;transform:translateX(-50%);font-size:22px}

/* Dock */
.stations{position:sticky;bottom:0;display:flex;gap:6px;padding:8px;background:linear-gradient(#fff0fb,#ffeaf9);border-top:1px solid rgba(0,0,0,.06)}
.tab{border:none;background:#fff;border-radius:999px;padding:8px 10px;cursor:pointer}
.tab.active{background:#f5e8ff}

/* Pricing */
.pricing-card{background:#fff;border-radius:12px;padding:10px;margin:8px 0;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.pricing-card input{width:90px}

/* Rendimiento y accesibilidad */
.gantry .carriage, .dispenser .needle, .drop, .cube, .cream, .flake { will-change: transform, opacity; }
@media (prefers-reduced-motion: reduce){
  *{ animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
`;

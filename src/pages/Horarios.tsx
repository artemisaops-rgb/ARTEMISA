import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/contexts/Auth";

type SlotDoc = {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  note?: string | null;
  updatedAt?: any;
};

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;
const ROW_H = 64;

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getMonday(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const x = new Date(d);
  x.setDate(d.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function hoursArray() {
  const xs: string[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) xs.push(`${String(h).padStart(2, "0")}:00`);
  return xs;
}
function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function clampBlock(start: string, end: string) {
  const s = Math.max(toMinutes(start), OPEN_HOUR * 60);
  const e = Math.max(s + 30, Math.min(toMinutes(end), CLOSE_HOUR * 60));
  return [s, e] as const;
}

type DaySlots = { id: string; data: SlotDoc }[];
type WeekData = Record<string /*YYYY-MM-DD*/, DaySlots>;

export default function Horarios() {
  const { user } = useAuth();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hours = useMemo(() => hoursArray(), []);

  const [week, setWeek] = useState<WeekData>({});

  // Al cambiar de semana/usuario, limpio el estado para no mezclar semanas
  useEffect(() => {
    setWeek({});
  }, [weekStart, user?.uid]);

  // ---- Suscripciones: schedules/{uid}/days/{date}/slots ----
  useEffect(() => {
    if (!user?.uid) return;
    const unsubs = days.map((d) => {
      const date = fmtDate(d);
      const col = collection(db, "schedules", user.uid, "days", date, "slots");
      return onSnapshot(col, (snap) => {
        const arr: DaySlots = [];
        snap.forEach((x) => arr.push({ id: x.id, data: x.data() as SlotDoc }));
        setWeek((prev) => ({ ...prev, [date]: arr }));
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [days, user?.uid]);

  const [sheet, setSheet] = useState({ open: false, dayIdx: 0, start: "08:00", end: "12:00", note: "" });

  const openNew = (dayIdx = 0, hh = 8) =>
    setSheet({
      open: true,
      dayIdx,
      start: `${String(hh).padStart(2, "0")}:00`,
      end: `${String(Math.min(hh + 4, CLOSE_HOUR)).padStart(2, "0")}:00`,
      note: "",
    });

  const createSlot = async () => {
    if (!user?.uid) return;
    const d = days[sheet.dayIdx];
    const date = fmtDate(d);
    const [sMin, eMin] = clampBlock(sheet.start, sheet.end);
    const start = `${String(Math.floor(sMin / 60)).padStart(2, "0")}:${String(sMin % 60).padStart(2, "0")}`;
    const end = `${String(Math.floor(eMin / 60)).padStart(2, "0")}:${String(eMin % 60).padStart(2, "0")}`;

    await addDoc(collection(db, "schedules", user.uid, "days", date, "slots"), {
      start,
      end,
      note: sheet.note.trim() || null,
      updatedAt: serverTimestamp(),
    } as SlotDoc);

    setSheet((s) => ({ ...s, open: false }));
  };

  const tryDelete = async (date: string, id: string) => {
    if (!user?.uid) return;
    if (!window.confirm("¿Eliminar este bloque?")) return;
    await deleteDoc(doc(db, "schedules", user.uid, "days", date, "slots", id));
  };

  return (
    <div className="max-w-5xl mx-auto p-4" style={{ paddingBottom: "var(--bottom-bar-space,160px)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h1 className="text-2xl font-bold">Horarios</h1>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semana anterior</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(getMonday(new Date()))}>Esta semana</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(addDays(weekStart, +7))}>Semana siguiente →</button>
        </div>
      </div>

      <WeekGrid days={days} hours={hours} week={week} onDelete={tryDelete} />

      <button
        className="fixed right-5 bottom-[calc(20px+var(--bottom-bar-space,160px))] rounded-full shadow-xl"
        style={{ background:"linear-gradient(180deg,var(--brand,#ff7a1a), var(--brand-600,#ea580c))", color:"#fff", width:56, height:56, display:"grid", placeItems:"center" }}
        onClick={() => openNew(0, 8)}
        title="Nuevo bloque"
      >+</button>

      {sheet.open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center"
          onClick={(e)=>{ if (e.target === e.currentTarget) setSheet((s)=>({...s, open:false})); }}
        >
          <div
            className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-3"
            style={{ marginBottom:"var(--bottom-bar-space,160px)" }}
          >
            <div className="font-semibold text-lg">Nuevo bloque</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="label">Día</label>
              <select className="input" value={sheet.dayIdx} onChange={(e)=>setSheet((s)=>({...s, dayIdx:Number(e.target.value)}))}>
                {days.map((d,i)=>(<option key={i} value={i}>{DAYS_ES[i]} {fmtDate(d)}</option>))}
              </select>

              <label className="label">Inicio</label>
              <input
                type="time"
                className="input"
                step={900}
                min={`${String(OPEN_HOUR).padStart(2,"0")}:00`}
                max={`${String(CLOSE_HOUR).padStart(2,"0")}:00`}
                value={sheet.start}
                onChange={(e)=>setSheet((s)=>({...s, start:e.target.value}))}
              />

              <label className="label">Fin</label>
              <input
                type="time"
                className="input"
                step={900}
                min={`${String(OPEN_HOUR).padStart(2,"0")}:15`}
                max={`${String(CLOSE_HOUR).padStart(2,"0")}:00`}
                value={sheet.end}
                onChange={(e)=>setSheet((s)=>({...s, end:e.target.value}))}
              />
            </div>

            <label className="label">Nota (opcional)</label>
            <input
              className="input"
              placeholder="Ej. turno mañana, entrega, etc."
              value={sheet.note}
              onChange={(e)=>setSheet((s)=>({...s, note:e.target.value}))}
            />

            <div className="hstack" style={{ gap:8 }}>
              <button className="btn flex-1" onClick={()=>setSheet((s)=>({...s, open:false}))}>Cancelar</button>
              <button className="btn btn-primary flex-1" onClick={createSlot}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekGrid({
  days, hours, week, onDelete
}:{
  days: Date[]; hours: string[]; week: WeekData;
  onDelete: (date:string, id:string)=>void;
}) {
  const dayColStyle: React.CSSProperties = { position:"relative", borderLeft:"1px solid var(--border)", overflow:"hidden" };

  return (
    <div className="w-full overflow-auto" style={{ borderRadius:16, border:"1px solid var(--border)", background:"#fff" }}>
      <div className="grid" style={{ gridTemplateColumns:"80px repeat(7, minmax(140px,1fr))" }}>
        <div className="px-3 py-3 text-sm font-semibold bg-slate-50 border-b border-[var(--border)]">Hora</div>
        {days.map((d,i)=>(
          <div key={i} className="px-3 py-3 text-sm font-semibold bg-slate-50 border-b border-l border-[var(--border)]" style={{ whiteSpace:"nowrap" }}>
            {DAYS_ES[i]} <span className="text-slate-500">{fmtDate(d)}</span>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns:"80px repeat(7, minmax(140px,1fr))" }}>
        <div className="border-r border-[var(--border)]">
          {hours.map((h)=>(
            <div key={h} style={{ height:ROW_H, borderTop:"1px solid var(--border)", padding:"6px 10px", fontSize:12, color:"#475569" }}>{h}</div>
          ))}
        </div>

        {days.map((d)=>{
          const date = fmtDate(d);
          const slots = (week[date] || []).slice().sort((a,b)=>toMinutes(a.data.start)-toMinutes(b.data.start));
          return (
            <div key={date} style={dayColStyle}>
              {hours.map((h,idx)=>(
                <div key={h} style={{ position:"absolute", left:0, right:0, top:idx*ROW_H, height:ROW_H, borderTop:"1px solid var(--border)" }} />
              ))}

              {slots.map(({id, data})=>{
                const [sMin,eMin] = clampBlock(data.start,data.end);
                const top = ((sMin-OPEN_HOUR*60)/60)*ROW_H;
                const height = ((eMin-sMin)/60)*ROW_H - 6;

                return (
                  <div
                    key={id}
                    onClick={()=>onDelete(date, id)}
                    title={`${data.start} – ${data.end}${data.note ? "  " + data.note : ""}\nHaz clic para eliminar.`}
                    style={{
                      position:"absolute", left:8, right:8, top, height,
                      background:"hsla(24, 95%, 55%, .16)", border:"1.5px solid hsl(24, 90%, 52%)",
                      color:"hsl(24, 60%, 26%)",
                      borderRadius:12, padding:"8px 10px", overflow:"hidden",
                      display:"flex", flexDirection:"column", justifyContent:"space-between",
                      cursor:"pointer", backdropFilter:"saturate(1.1)"
                    }}
                  >
                    <div className="text-[12px] font-semibold leading-none">Bloque</div>
                    <div className="text-[11px] leading-3 opacity-80">
                      {data.start} – {data.end}{data.note ? `  ${data.note}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

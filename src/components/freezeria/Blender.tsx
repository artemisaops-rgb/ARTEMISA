import React from "react";

export function Blender({ fillPct=0, spinning=false }: { fillPct?:number; spinning?:boolean; }){
  return (
    <div className="fz-blender">
      <div className="head" />
      <div className="jar">
        <div className="mix" style={{ height: `${fillPct}%` }} />
        <div className={`whirl ${spinning?"on":""}`} />
      </div>
      <div className="base" />
      <style>{`
        .fz-blender{position:relative;width:200px;height:240px}
        .head{height:28px;background:linear-gradient(#bcd3e3,#9fb8cb);border:1px solid #8eacc2;border-radius:8px 8px 0 0}
        .jar{position:relative;height:160px;border:1px solid #b7cfe0;background:linear-gradient(#fff,#e9f4fb);border-radius:6px;overflow:hidden}
        .mix{position:absolute;left:8px;right:8px;bottom:8px;background:linear-gradient(#a7e9dc,#63cbbd);border-radius:8px;transition:height .35s}
        .whirl{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg, rgba(10,39,64,.06) 0 12deg, transparent 12deg 24deg);opacity:0;transition:opacity .2s}
        .whirl.on{opacity:1;animation:spin .9s linear infinite}
        .base{height:30px;background:linear-gradient(#9fb8cb,#7a9bb4);border:1px solid #6a869c;border-radius:0 0 10px 10px}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}

export function BlendMeter({ value=0 }: { value:number }){
  return (
    <div className="fz-meter">
      <div className="labels"><span>Chunky</span><span>Regular</span><span>Smooth</span></div>
      <div className="bar"><span style={{ width:`${value}%` }} /></div>
      <style>{`
        .fz-meter{display:grid;gap:6px}
        .labels{display:flex;justify-content:space-between;font-size:11px;color:#6b8594}
        .bar{height:10px;border-radius:999px;background:#e2ebf2;overflow:hidden}
        .bar span{display:block;height:100%;background:linear-gradient(90deg,#ec4899,#8b5cf6,#0ea5e9);transition:width .2s}
      `}</style>
    </div>
  );
}

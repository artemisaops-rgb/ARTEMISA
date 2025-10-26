import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = path.join(process.cwd(), "out");

const sa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "serviceAccount.json"), "utf8"));
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const rows = lines.map(l => {
    const out = [];
    let cur = "", inQ = false;
    for (let i=0;i<l.length;i++){
      const c=l[i];
      if (c === '"'){ if (inQ && l[i+1]==='"'){ cur+='"'; i++; } else inQ=!inQ; }
      else if (c===',' && !inQ){ out.push(cur); cur=""; }
      else cur+=c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...data] = rows;
  return data.map(r => Object.fromEntries(head.map((h,i)=>[h,r[i]])));
};

const asCSV = (rows) => rows.map(r => r.map(v=>{
  const s=String(v??""); return /[,"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}).join(",")).join("\n");

(async () => {
  const invMap = new Map((await db.collection("inventoryItems").get())
    .docs.map(d => [d.id, { id:d.id, ...d.data() }]));

  const products = (await db.collection("products").get())
    .docs.map(d => ({ id:d.id, ...d.data() }));

  const byPS = new Map(); // (pId|sizeId) -> recipe
  for (const p of products) {
    for (const s of (p.sizes||[])) {
      byPS.set(`${p.id}|${s.id}`, { productId:p.id, productName:p.name||"", sizeId:s.id, sizeName:s.name||"", recipe:s.recipe||{} });
    }
  }

  const planPath = path.join(OUT, "servings.csv");
  if (!fs.existsSync(planPath)) {
    throw new Error("No existe out/servings.csv (copia y edita servings-template.csv).");
  }
  const servings = parseCSV(fs.readFileSync(planPath, "utf8"));

  // acumular requerimientos
  const need = new Map(); // ingId -> { item, qty }
  for (const row of servings) {
    const key = `${row.productId}|${row.sizeId}`;
    const serv = Number(row.servings || 0);
    if (!serv || serv <= 0) continue;
    const ps = byPS.get(key);
    if (!ps) continue;
    for (const [ingId, amt] of Object.entries(ps.recipe)) {
      const add = Number(amt || 0) * serv;
      const cur = need.get(ingId) || { item: invMap.get(ingId) || { id: ingId, name: "(missing)" }, qty: 0 };
      cur.qty += add;
      need.set(ingId, cur);
    }
  }

  // CSV de compras
  const rows = [["ingredientId","name","unit","neededQty","costPerUnit","totalCost"]];
  let total = 0, unknown = 0;
  for (const [id, v] of need.entries()) {
    const name = v.item.name || "(missing)";
    const unit = v.item.unit || "u";
    const cpu  = Number(v.item.costPerUnit || 0);
    const line = cpu * v.qty;
    if (cpu > 0) total += line; else unknown += v.qty;
    rows.push([id, name, unit, v.qty, cpu, line]);
  }
  fs.writeFileSync(path.join(OUT, "purchase_plan.csv"), asCSV(rows), "utf8");

  const summary = [
    `Items distintos: ${rows.length - 1}`,
    `TOTAL (con costo): $${total.toLocaleString()}`,
    `Cantidades sin costo unitario: ${unknown}`,
    ``,
    `>> Completa costos faltantes en inventoryItems y vuelve a correr.`
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "purchase_summary.txt"), summary, "utf8");
  console.log("✓ purchase_plan.csv");
  console.log("✓ purchase_summary.txt");
})();

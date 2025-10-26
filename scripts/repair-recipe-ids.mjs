import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const sa = JSON.parse(fs.readFileSync("serviceAccount.json","utf8"));
if (admin.apps.length===0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const MAP_FILE = path.join("out","id_map.csv"); // columnas: oldId,newId

const parseCSV = (txt) => {
  const [head,...rows] = txt.trim().split(/\r?\n/).map(l=>{
    const out=[], s=l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    for (let v of s) out.push(v.replace(/^"|"$/g,"").replace(/""/g,'"'));
    return out;
  });
  return rows.map(r => Object.fromEntries(head.map((h,i)=>[h,r[i]])));
};

(async ()=>{
  if (!fs.existsSync(MAP_FILE)) throw new Error("Falta out/id_map.csv");
  const map = parseCSV(fs.readFileSync(MAP_FILE,"utf8")).filter(x=>x.oldId && x.newId);

  const byOld = new Map(map.map(x=>[x.oldId,x.newId]));
  const prods = (await db.collection("products").get()).docs;

  let touched = 0;
  for (const d of prods) {
    const p = d.data(); let changed = false;
    for (const s of (p.sizes||[])) {
      const rec = s.recipe || {};
      for (const [k,v] of Object.entries(rec)) {
        const replacement = byOld.get(k);
        if (replacement) {
          delete rec[k];
          rec[replacement] = (Number(rec[replacement]||0)+Number(v||0));
          changed = true;
        }
      }
      s.recipe = rec;
    }
    if (changed) {
      await db.collection("products").doc(d.id).set({ sizes: p.sizes, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
      touched++;
    }
  }
  console.log(`Listo. Productos actualizados: ${touched}`);
})();

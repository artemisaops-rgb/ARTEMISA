import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = "out";
const sa = JSON.parse(fs.readFileSync("serviceAccount.json","utf8"));
if (admin.apps.length===0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/\s+/g," ").trim();

const dist = (a,b) => { // Levenshtein simple
  a = norm(a); b = norm(b);
  const m = Array(a.length+1).fill(0).map((_,i)=>[i]);
  for (let j=1;j<=b.length;j++) m[0][j]=j;
  for (let i=1;i<=a.length;i++) for (let j=1;j<=b.length;j++)
    m[i][j] = Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1] + (a[i-1]===b[j-1]?0:1));
  return m[a.length][b.length];
};

(async ()=>{
  const inv = (await db.collection("inventoryItems").get()).docs.map(d=>({id:d.id, ...d.data()}));
  const rows = [["idA","nameA","idB","nameB","distance"]];
  for (let i=0;i<inv.length;i++){
    for (let j=i+1;j<inv.length;j++){
      const a=inv[i], b=inv[j];
      const d = dist(a.name||"", b.name||"");
      if (d<=3) rows.push([a.id,a.name||"", b.id,b.name||"", d]);
    }
  }
  fs.writeFileSync(path.join(OUT,"possible_duplicates.csv"), rows.map(r=>r.join(",")).join("\n"), "utf8");
  console.log("✓ out/possible_duplicates.csv");
})();

import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = path.join(process.cwd(), "out");
fs.mkdirSync(OUT, { recursive: true });

const sa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "serviceAccount.json"), "utf8"));
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const asCSV = (rows) => rows.map(r => r.map(v=>{
  const s=String(v??""); return /[,"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}).join(",")).join("\n");

(async () => {
  const snap = await db.collection("products").get();
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const rows = [["productId","productName","sizeId","sizeName","servings"]];
  for (const p of products) {
    for (const s of (p.sizes||[])) {
      rows.push([p.id, p.name||"", s.id, s.name||"", 0]);
    }
  }
  fs.writeFileSync(path.join(OUT, "servings-template.csv"), asCSV(rows), "utf8");
  console.log("✓ out/servings-template.csv  (edítalo y guárdalo como servings.csv)");
})();

import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = path.join(process.cwd(), "out");
fs.mkdirSync(OUT, { recursive: true });

const ORG_ID = process.env.ORG_ID || null; // opcional

// ---- init admin ----
const sa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "serviceAccount.json"), "utf8"));
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ---- helpers ----
const normalize = (s) =>
  String(s || "").normalize("NFD").toLowerCase().replace(/\p{Diacritic}/gu, "");

const asCSV = (rows) =>
  rows.map(r => r.map(v => {
    const s = String(v ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

const writeCSV = (name, rows) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, asCSV(rows), "utf8");
  console.log("✓", name);
};

const writeJSON = (name, data) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log("✓", name);
};

// Heurística de categorías operativas
const isEquipment = (n) => /(licuadora|batidora|freezer|congelador|nevera|vitrina|balanza|molinillo|prensa|sif[oó]n|moka|v60|cafetera|hervidor|term[oó]metro|jarra|dosificador|selladora|dispensador)/.test(n);
const isCleaning  = (n) => /(detergente|desinfectante|limpia|jab[oó]n|cloro|hipoclorito|esponja|trapo|toalla|guante|alcohol|sanitizante|bolsa de basura|bolsas de basura)/.test(n);
const isDisposable= (n) => /(vaso|tapa|pitillo|pajilla|sorbete|servilleta|popote|cuchara|cucharita|cart[oó]n|pl[aá]stico|sticker|etiqueta)/.test(n);

(async () => {
  // inventoryItems
  const invSnap = await db.collection("inventoryItems").get();
  let inventory = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (ORG_ID) inventory = inventory.filter(i => String(i.orgId || "") === ORG_ID);
  const invMap = new Map(inventory.map(i => [i.id, i]));

  // products
  const prodSnap = await db.collection("products").get();
  let products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (ORG_ID) products = products.filter(p => String(p.orgId || "") === ORG_ID);

  // recorrer recetas
  const usage = new Map(); // ingId -> { item, usedBy:[{product,size,amount}] }
  const missing = [];
  for (const p of products) {
    for (const s of (p.sizes || [])) {
      const recipe = s?.recipe || {};
      for (const [ingId, amount] of Object.entries(recipe)) {
        if (!invMap.has(ingId)) {
          missing.push({
            productId: p.id, productName: p.name || "",
            sizeId: s.id, sizeName: s.name || "",
            ingId, amount
          });
          continue;
        }
        const entry = usage.get(ingId) ?? { item: invMap.get(ingId), usedBy: [] };
        entry.usedBy.push({
          productId: p.id, productName: p.name || "",
          sizeId: s.id, sizeName: s.name || "",
          amount: Number(amount || 0)
        });
        usage.set(ingId, entry);
      }
    }
  }

  const usedIds = new Set([...usage.keys()]);
  const unused = inventory.filter(i => !usedIds.has(i.id));

  // salidas
  writeCSV("missing_refs.csv", [
    ["productId","productName","sizeId","sizeName","ingredientId","amount"],
    ...missing.map(m => [m.productId, m.productName, m.sizeId, m.sizeName, m.ingId, m.amount])
  ]);

  writeCSV("unused_inventory.csv", [
    ["ingredientId","name","unit","costPerUnit"],
    ...unused.map(i => [i.id, i.name || "", i.unit || "", Number(i.costPerUnit || 0)])
  ]);

  writeCSV("used_inventory.csv", [
    ["ingredientId","name","unit","costPerUnit","usedByCount"],
    ...[...usage.values()].map(u => [
      u.item.id, u.item.name || "", u.item.unit || "", Number(u.item.costPerUnit || 0), u.usedBy.length
    ])
  ]);
  writeJSON("used.detail.json", [...usage.entries()].map(([id, v]) => ({ id, ...v })));

  // categorización operativa
  const ops = inventory.map(i => {
    const n = normalize(i.name || "");
    let category = "";
    if (isEquipment(n)) category = "equipment";
    else if (isCleaning(n)) category = "cleaning";
    else if (isDisposable(n)) category = "disposable";
    else category = "ingredient";
    return { id: i.id, name: i.name || "", unit: i.unit || "", category };
  });
  writeCSV("ops_categorized.csv", [
    ["ingredientId","name","unit","category"],
    ...ops.map(o => [o.id, o.name, o.unit, o.category])
  ]);

  console.log("\nListo ✅  Revisa la carpeta /out");
})();

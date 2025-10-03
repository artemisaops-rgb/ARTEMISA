import fs from "node:fs";
import admin from "firebase-admin";
const cred = JSON.parse(fs.readFileSync("./serviceAccount.json","utf8"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();
const orgId     = process.env.ORG_ID      || "default";
const allowMail = process.env.ALLOW_EMAIL || "";
const ownerUid  = process.env.OWNER_UID   || "";

async function run(){
  // settings con allowlist (o dominio en null)
  await db.doc(`orgs/${orgId}/settings`).set({
    workerAllowlist: allowMail ? [allowMail] : [],
    workerDomain: null
  }, { merge: true });

  // owner (opcional) activo
  if (ownerUid){
    await db.doc(`orgs/${orgId}/members/${ownerUid}`).set({
      orgId, role:"owner", active:true, createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  // Parche: poner orgId a customers/products que no lo tengan
  const cust = await db.collection("customers").get();
  let patchedC = 0;
  for (const d of cust.docs){ const x=d.data()||{}; if(!x.orgId){ await d.ref.set({orgId},{merge:true}); patchedC++; } }

  const prods = await db.collection("products").get();
  let patchedP = 0;
  for (const d of prods.docs){ const x=d.data()||{}; if(!x.orgId){ await d.ref.set({orgId},{merge:true}); patchedP++; } }

  // Si no hay productos, siembra 2 básicos
  if (prods.empty){
    const batch = db.batch();
    const base = [
      { id:"frappe-cafe", name:"Frappe de café", category:"frappes", price:12000, active:true },
      { id:"coldbrew",    name:"Cold Brew",       category:"coldbrew", price:10000, active:true },
    ];
    for (const p of base){ batch.set(db.collection("products").doc(p.id), { ...p, orgId }); }
    await batch.commit();
  }

  console.log(JSON.stringify({patchedCustomers:patchedC, patchedProducts:patchedP, orgId},null,2));
}
run().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });

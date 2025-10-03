#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function die(msg) { console.error(msg); process.exit(1); }

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.resolve(process.cwd(), "serviceAccount.json");
if (!fs.existsSync(saPath)) die(`No existe la credencial: ${saPath}`);
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || sa.project_id || undefined;
initializeApp({ credential: cert(sa), projectId });
const db = getFirestore();

async function makeOwner(uid, org="default") {
  const ref = db.doc(`orgs/${org}/members/${uid}`);
  await ref.set({ role:"owner", active:true, orgId:org, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() }, { merge:true });
  console.log(`OK owner => ${ref.path}`);
}
function parseArgs(argv){const o={_:[]};for(const a of argv){if(a.startsWith("--domain="))o.domain=a.split("=")[1];else o._.push(a)}return o;}
async function setSettings(org="default", emails=[], domain){
  const ref = db.doc(`orgs/${org}/settings/main`);
  const d={};
  if (emails.length) d.workerAllowlist = emails;
  if (domain) d.workerDomain = domain;
  if (!Object.keys(d).length) die("Nada que guardar");
  await ref.set(d,{merge:true});
  console.log(`OK settings => ${ref.path} ${JSON.stringify(d)}`);
}
async function backfill(org="default"){
  const colls=["products","inventoryItems"];
  for(const c of colls){
    const snap=await db.collection(c).get();
    const batch=db.batch();let count=0;
    snap.forEach(d=>{
      const data=d.data()||{};
      if(!("orgId" in data)){batch.set(db.doc(`${c}/${d.id}`),{orgId:org},{merge:true});count++;}
    });
    if(count)await batch.commit();
    console.log(`OK backfill ${c} => ${count}`);
  }
}
const [,, cmd, ...rest]=process.argv;
(async()=>{try{
  if(cmd==="owner"){const[uid,org="default"]=rest;if(!uid)die("Uso: owner <UID> [org]");await makeOwner(uid,org);}
  else if(cmd==="settings"){const p=parseArgs(rest);const[org="default",...emails]=p._;await setSettings(org,emails,p.domain);}
  else if(cmd==="backfill"){const[org="default"]=rest;await backfill(org);}
  else{die("Comandos: owner <UID> [org] | settings <org> [emails...] [--domain=x] | backfill [org]");}
}catch(e){console.error(e);process.exit(1);}})();

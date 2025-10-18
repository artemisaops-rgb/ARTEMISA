// src/lib/openDay.ts
import { doc, setDoc, updateDoc, serverTimestamp, collection, getDoc } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

/** Org actual (multi-tenant) */
const ORG_ID = getOrgId();

/** YYYY-MM-DD (UTC) */
function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Apertura del día por usuario (id = YYYY-MM-DD_uid) */
export async function openDay(params: {
  initialCash: number;
  tasksDone: string[];
  photoDataUrl?: string | null;
  userId?: string | null;
}) {
  const { initialCash, tasksDone, photoDataUrl, userId } = params;

  if (!userId) throw new Error("Falta userId (sesión)");
  // Las reglas piden las 2 confirmaciones de WhatsApp
  const must = ["foto_wpp_sent", "foto_wpp_double"] as const;
  const hasBoth = must.every((k) => tasksDone.includes(k));
  if (!hasBoth) throw new Error("Faltan las 2 confirmaciones de WhatsApp en el checklist");

  const id = `${ymd()}_${userId}`;
  const ref = doc(collection(db, "openings"), id);
  const prev = await getDoc(ref);

  await setDoc(
    ref,
    {
      id,
      orgId: ORG_ID,
      dateKey: ymd(),
      userId,
      initialCash: Number(initialCash) || 0,
      tasksDone,
      status: "open",
      createdAt: prev.exists() ? prev.data()?.createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // (Opcional) almacenar la foto dentro del documento
  if (photoDataUrl) {
    await updateDoc(ref, { photoDataUrl });
  }

  return { id };
}

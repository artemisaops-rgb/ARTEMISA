// Placeholder: genera un brief simple basado en agregados de ventas.
// Integraremos Gemini cuando tengamos credenciales (no se ejecuta solo).
import * as admin from "firebase-admin";
if (!admin.apps.length) admin.initializeApp();

export async function buildBriefFor(dateISO: string){
  const db = admin.firestore();
  const salesSnap = await db.collection("sales")
    .where("createdAt", ">=", new Date(dateISO+"T00:00:00Z"))
    .get();

  let total=0, orders=0;
  salesSnap.forEach(d=>{ orders++; total += (d.data().total||0); });

  const brief = [
    `Resumen ${dateISO}`,
    `Ingresos: $${total.toLocaleString()}`,
    `'????T,??"?"rdenes: ${orders}`,
    `Top horas y productos: (pendiente)`,
    `Recomendaciones IA: (pendiente integrar Gemini)`
  ].join("\n");

  await db.collection("briefs").doc(dateISO).set({
    date: dateISO, total, orders, brief, createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return brief;
}





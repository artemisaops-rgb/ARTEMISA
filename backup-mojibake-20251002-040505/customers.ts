// src/lib/customers.ts ?f?'????T?f??s?,�?f?'?,�?f��??s�?.�?f??s?,�?f?'?,�?f��?,?s?,�?f??s?,� REEMPLAZA COMPLETO
import {
  doc, getDoc, runTransaction, serverTimestamp, setDoc, collection,
} from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

type EnsureArgs = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

/** Crea/actualiza el perfil del cliente (usado en login). */
export async function ensureCustomerProfile(a: EnsureArgs) {
  const orgId = getOrgId();
  const ref = doc(db, "customers", a.uid);
  const snap = await getDoc(ref);
  const base = {
    id: a.uid,
    orgId,
    email: a.email ?? null,
    displayName: a.displayName ?? null,
    photoURL: a.photoURL ?? null,
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      points: 0,              // puntos totales (mod 10 se ve en stampsProgress)
      stampsProgress: 0,      // 0..9
      totalStamps: 0,         // sellos acumulados hist?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�ricos
      freeCredits: 0,         // bebidas gratis disponibles
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      ref,
      { ...base, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

type AwardItem = {
  name: string;
  qty: number;
  price: number;
  isBeverage?: boolean;
  category?: string;
};

type AwardArgs = {
  id: string;          // orderId
  orgId: string;
  customerId: string | null;
  items: AwardItem[];
};

const BEV_CATS = ["frappes", "coldbrew", "bebidas calientes"];

/** 10?f?'????T?f???�?,??"??f?'?,�?f��?,?s?,�?f��??s�?,�1: cada bebida suma 1; cada 10 => +1 cr?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�dito gratis y registro en loyaltyRedemptions. */
export async function awardLoyalty(args: AwardArgs) {
  if (!args.customerId) return;
  const add = (args.items || []).reduce((sum, it) => {
    const isBeverage = !!it.isBeverage || BEV_CATS.includes(String(it.category || "").toLowerCase());
    return sum + (isBeverage ? Math.max(0, Math.floor(it.qty || 0)) : 0);
  }, 0);
  if (add <= 0) return;

  const cref = doc(db, "customers", args.customerId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(cref);
    const prevPoints = snap.exists() ? Number(snap.data()?.points || 0) : 0;
    const prevTotalStamps = snap.exists() ? Number(snap.data()?.totalStamps || 0) : 0;
    const prevCredits = snap.exists() ? Number(snap.data()?.freeCredits || 0) : 0;

    let newPoints = prevPoints + add;
    let newCredits = prevCredits;
    let redemptions = 0;

    while (newPoints >= 10) {
      redemptions += 1;
      newPoints -= 10;
      newCredits += 1;
    }

    tx.set(
      cref,
      {
        orgId: args.orgId,
        points: newPoints,
        totalStamps: prevTotalStamps + add,
        stampsProgress: newPoints % 10,
        freeCredits: newCredits,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // registra canjes autom?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�ticos (cr?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�dito ganado)
    for (let i = 0; i < redemptions; i++) {
      const rref = doc(collection(db, "loyaltyRedemptions"));
      tx.set(rref, {
        id: rref.id,
        orgId: args.orgId,
        customerId: args.customerId,
        orderId: args.id,
        points: 10,
        kind: "auto", // auto-grant (gana 1 cr?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�dito)
        note: "free drink (10x1)",
        at: serverTimestamp(), // nowish
      });
    }
  });
}

/** Canje manual de 1 bebida gratis desde la UI de staff. */
export async function redeemOneFreeBeverage(_db: typeof db, customerId: string) {
  const cref = doc(db, "customers", customerId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(cref);
    if (!snap.exists()) throw new Error("Cliente no existe");
    const free = Number(snap.data()?.freeCredits || 0);
    if (free <= 0) throw new Error("Sin cr?f?'????T?f???�?,??"??f?'�?,?s?f??s?,�ditos disponibles");

    tx.set(
      cref,
      {
        freeCredits: free - 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const rref = doc(collection(db, "loyaltyRedemptions"));
    tx.set(rref, {
      id: rref.id,
      orgId: getOrgId(),
      customerId,
      orderId: null,
      points: 10,
      kind: "manual", // canjeado por staff
      note: "redeem 1 free drink",
      at: serverTimestamp(),
    });
  });
}

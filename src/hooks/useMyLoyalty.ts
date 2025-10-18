// src/hooks/useMyLoyalty.ts
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

const USE_ORG_SUBCOLS = false;

const custDocRef = (uid: string, orgId: string) =>
  USE_ORG_SUBCOLS ? doc(db, "orgs", orgId, "customers", uid) : doc(db, "customers", uid);

const custEventsCol = (uid: string, orgId: string) =>
  USE_ORG_SUBCOLS
    ? collection(db, "orgs", orgId, "customers", uid, "loyaltyEvents")
    : collection(db, "customers", uid, "loyaltyEvents");

export type LoyaltyEvent = {
  id: string;
  type: "earn" | "redeem";
  delta: number;
  at?: Timestamp | null;
  orderId?: string | null;
  staffId?: string | null;
};

export type CustomerDoc = {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  stampsProgress?: number;
  totalStamps?: number;
  freeCredits?: number;
};

export function useMyLoyalty(uid?: string | null) {
  const [me, setMe] = useState<CustomerDoc | null>(null);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const orgId = getOrgId();

  useEffect(() => {
    if (!uid) {
      setMe(null);
      return;
    }
    const ref = custDocRef(uid, orgId);
    return onSnapshot(ref, (snap) => setMe(snap.exists() ? (snap.data() as any) : null));
  }, [uid, orgId]);

  useEffect(() => {
    if (!uid) {
      setEvents([]);
      return;
    }
    const qy = query(
      custEventsCol(uid, orgId),
      where("orgId", "==", orgId),
      orderBy("at", "desc"),
      limit(20)
    );
    return onSnapshot(qy, (snap) => {
      const xs: LoyaltyEvent[] = [];
      snap.forEach((d) => {
        const v: any = d.data();
        xs.push({
          id: d.id,
          type: v.type === "redeem" ? "redeem" : "earn",
          delta: Number(v.delta || 0),
          at: v.at ?? null,
          orderId: v.orderId ?? null,
          staffId: v.staffId ?? null,
        });
      });
      setEvents(xs);
    });
  }, [uid, orgId]);

  return { me, events };
}

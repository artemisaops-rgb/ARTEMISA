// src/hooks/useMyOrders.ts
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db, getOrgId } from "@/services/firebase";

const USE_ORG_SUBCOLS = false;
const ordersCol = (orgId: string) =>
  USE_ORG_SUBCOLS ? collection(db, "orgs", orgId, "orders") : collection(db, "orders");

export type MyOrder = {
  id: string;
  total: number;
  createdAt?: Timestamp | null;
  status?: string | null;
};

export function useMyOrders(uid?: string | null, max = 10) {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const orgId = getOrgId();

  useEffect(() => {
    if (!uid) {
      setOrders([]);
      return;
    }
    const qy = query(
      ordersCol(orgId),
      where("orgId", "==", orgId),
      where("customerUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    return onSnapshot(qy, (snap) => {
      const xs: MyOrder[] = [];
      snap.forEach((d) => {
        const v: any = d.data();
        xs.push({
          id: d.id,
          total: Number(v.total || 0),
          createdAt: v.createdAt ?? v.at ?? null,
          status: String(v.status || ""),
        });
      });
      setOrders(xs);
    });
  }, [uid, orgId, max]);

  return orders;
}

import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, Timestamp, where, } from "firebase/firestore";
/** Rango del día local [00:00, 24:00) en Timestamps de Firestore */
export function dayRange(d = new Date()) {
    const from = new Date(d);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: Timestamp.fromDate(from), to: Timestamp.fromDate(to) };
}
/** Registra un movimiento de caja. Cumple tus reglas de seguridad. */
export async function addCashMovement(db, params) {
    const amount = Number(params.amount || 0);
    if (!params.userId)
        throw new Error("Falta userId");
    if (amount <= 0)
        throw new Error("El monto debe ser mayor a 0");
    if (params.type !== "in" && params.type !== "out") {
        throw new Error("Tipo inválido");
    }
    await addDoc(collection(db, "cashMovements"), {
        userId: params.userId,
        type: params.type,
        amount,
        reason: params.reason ?? null,
        orderId: params.orderId ?? null,
        at: serverTimestamp(), // ← las reglas validan nowish(at)
    });
}
/**
 * Calcula snapshot de caja de HOY:
 * - openingCash: toma la primera apertura del día (si existe) y usa initialCash
 * - cashSales:   suma de órdenes entregadas en efectivo menos anuladas en efectivo
 * - inTotal/outTotal: suma de cashMovements de hoy por tipo
 * - expectedCash = openingCash + cashSales + inTotal - outTotal
 */
export async function getTodayCashSnapshot(db, userId) {
    const { from, to } = dayRange();
    // --- Apertura (openingCash)
    let openingCash = 0;
    {
        // tomamos cualquier apertura de hoy (si tienes una por usuario, puedes filtrar por userId)
        const qOpen = query(collection(db, "openings"), where("createdAt", ">=", from), where("createdAt", "<", to));
        const snap = await getDocs(qOpen);
        // si hay varias, coge la primera (o la más reciente)
        snap.forEach((d) => {
            const v = d.data();
            if (typeof v?.initialCash === "number") {
                openingCash = Number(v.initialCash || 0);
            }
        });
    }
    // --- Ventas en efectivo (delivered - canceled)
    let cashSales = 0;
    {
        const qOrders = query(collection(db, "orders"), where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "asc"));
        const snap = await getDocs(qOrders);
        snap.forEach((d) => {
            const v = d.data();
            const total = Number(v.total || 0);
            const pm = String(v.payMethod || "");
            const status = String(v.status || "");
            if (pm === "cash") {
                if (status === "delivered")
                    cashSales += total;
                else if (status === "canceled")
                    cashSales -= total;
            }
        });
    }
    // --- Movimientos de caja (ingresos/egresos)
    let inTotal = 0;
    let outTotal = 0;
    {
        const qMovs = query(collection(db, "cashMovements"), where("at", ">=", from), where("at", "<", to), orderBy("at", "asc"));
        const snap = await getDocs(qMovs);
        snap.forEach((d) => {
            const v = d.data();
            const amt = Number(v.amount || 0);
            if (v.type === "in")
                inTotal += amt;
            else if (v.type === "out")
                outTotal += amt;
        });
    }
    const expectedCash = openingCash + cashSales + inTotal - outTotal;
    return { openingCash, cashSales, inTotal, outTotal, expectedCash };
}

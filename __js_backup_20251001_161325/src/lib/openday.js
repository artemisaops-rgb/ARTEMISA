import { doc, setDoc, updateDoc, serverTimestamp, collection } from "firebase/firestore";
import { db } from "@/services/firebase";
export async function openDay(params) {
    const { initialCash, tasksDone, photoDataUrl, userId } = params;
    const d = new Date();
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${userId ?? "anon"}`;
    const ref = doc(collection(db, "openings"), id);
    await setDoc(ref, {
        id,
        userId: userId ?? null,
        initialCash: Number(initialCash) || 0,
        tasksDone,
        status: "open",
        createdAt: serverTimestamp(),
    });
    if (photoDataUrl) {
        await updateDoc(ref, { photoDataUrl });
    }
    return { id };
}

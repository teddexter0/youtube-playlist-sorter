import { adminDb } from "./firebase";
export async function knownSeenIds(userId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const collection = adminDb().collection("users").doc(userId).collection("watched");
  const found = await adminDb().getAll(...[...new Set(ids)].map((id) => collection.doc(id)));
  return new Set(found.filter((doc) => doc.exists).map((doc) => doc.id));
}
export async function rememberSeen(userId: string, ids: string[], source: string) {
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 400) {
    const batch = adminDb().batch();
    for (const id of unique.slice(i, i + 400)) batch.set(adminDb().collection("users").doc(userId).collection("watched").doc(id), { at: new Date().toISOString(), source, ...(source === "watched" ? { qualifiedWatch: true } : {}) }, { merge: true });
    await batch.commit();
  }
  return unique.length;
}

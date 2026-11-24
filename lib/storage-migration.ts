import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, type QueryDocumentSnapshot, type DocumentReference } from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";
import { envValue } from "./runtime-config";
export const storageTarget = "youtube-playlist-sorter-513321";
export function migrationDatabase() {
  const name = "personal-tv-storage-target";
  const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId: storageTarget, credential: cert({ projectId: storageTarget, clientEmail: envValue("FIREBASE_CLIENT_EMAIL"), privateKey: envValue("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n") }) }, name);
  return getFirestore(app);
}
export async function copyAccountStorage(source: Firestore, target: Firestore, userId: string) {
  const root = source.collection("users").doc(userId);
  const initial = await root.get();
  if (!initial.exists || !initial.data()?.tv || !initial.data()?.encryptedRefreshToken) throw new Error("This is not a connected Personal TV account.");
  // Prove target access before pausing any operations on the live account.
  await target.collection("users").doc(userId).get();
  await source.runTransaction(async tx => { const current = (await tx.get(root)).data(); if ((current?.tvLockUntil ?? 0) > Date.now()) throw new Error("Wait for the active playlist build before moving storage."); tx.update(root,{storageMigrating:true}); });
  let copied = 0;
  async function copyDocument(ref: DocumentReference) {
    if (ref.path !== `users/${userId}` && !ref.path.startsWith(`users/${userId}/`)) throw new Error("Migration scope mismatch.");
    if (++copied > 20000) throw new Error("Account exceeds the migration batch limit.");
    const snapshot = await ref.get();
    if (snapshot.exists) {
      const value = snapshot.data()!;
      if (ref.path === root.path) value.storageMigrating = false;
      await target.doc(ref.path).set(value);
      const checked = await target.doc(ref.path).get();
      if (!isDeepStrictEqual(value, checked.data())) throw new Error("A copied record did not verify. Live storage is unchanged.");
    }
    for (const collection of await ref.listCollections()) {
      let cursor: QueryDocumentSnapshot | undefined;
      do {
        const page = await (cursor ? collection.orderBy("__name__").startAfter(cursor).limit(200) : collection.orderBy("__name__").limit(200)).get();
        for (const doc of page.docs) await copyDocument(doc.ref);
        cursor = page.size === 200 ? page.docs[page.docs.length - 1] : undefined;
      } while (cursor);
    }
  }
  try { await copyDocument(root); return { copied, verified: true, target: storageTarget }; }
  catch (error) { await root.update({storageMigrating:false}); throw error; }
}

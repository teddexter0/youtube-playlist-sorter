import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function privateKey(): string | undefined {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key?.replace(/\\n/g, "\n");
}

export function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const key = privateKey();

    if (!projectId || !clientEmail || !key) {
      throw new Error("Firebase admin env vars are required");
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: key
      })
    });
  }

  return getFirestore();
}

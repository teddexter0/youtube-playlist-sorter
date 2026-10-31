import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { envValue } from "@/lib/runtime-config";

function privateKey(): string | undefined {
  const key = envValue("FIREBASE_PRIVATE_KEY");
  return key.replace(/\\n/g, "\n");
}

export function adminDb() {
  if (!getApps().length) {
    const projectId = envValue("FIREBASE_PROJECT_ID");
    const clientEmail = envValue("FIREBASE_CLIENT_EMAIL");
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

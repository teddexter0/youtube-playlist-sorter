import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase";
import { missingGoogleConfig } from "@/lib/runtime-config";
import { aiConfigured } from "@/lib/tv-ai";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    // No documents or identifying data are returned to the caller.
    await adminDb().collection("users").limit(1).get();
    database = true;
  } catch { /* Public health only reports readiness, never credentials/errors. */ }
  const missing = missingGoogleConfig();
  return NextResponse.json({ status: database && !missing.length ? "ready" : "setup-required",
    database, googleConfigured: !missing.length, missingGoogleSettings: missing, aiConfigured: aiConfigured()
  }, { headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getApps } from "firebase-admin/app";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings, getLogs } from "@/lib/store";
import { envValue } from "@/lib/runtime-config";
import { adminDb } from "@/lib/firebase";
import { hasDailyPersonalStations } from "@/lib/stations";
export const dynamic = "force-dynamic";
export async function GET() {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Connect Google first." }, { status: 401 });
  const user = await getUserSettings(userId);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const db = adminDb();
  let edition = "unavailable", location = "unavailable";
  try {
    const token = await getApps()[0].options.credential?.getAccessToken();
    if (token) {
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${envValue("FIREBASE_PROJECT_ID")}/databases/(default)`, { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
      if (response.ok) { const meta = await response.json(); edition = meta.databaseEdition ?? "STANDARD"; location = meta.locationId ?? "unavailable"; }
    }
  } catch { /* Database identity still comes from the active connection. */ }
  const attempts = await db.collection("users").doc(userId).collection("stationRuns").orderBy("at", "desc").limit(10).get();
  return NextResponse.json({ automatic: Boolean(user.stationAutopilot), database: { projectId: envValue("FIREBASE_PROJECT_ID"), edition, location },
    attempts: attempts.docs.map(doc => ({ id: doc.id, ...doc.data() })), logs: await getLogs(userId, 10),
    schedule: { timezone: "Africa/Nairobi", tv: "Daily at 19:00", faith: hasDailyPersonalStations(user) ? "Daily at 19:00" : "Friday at 19:00", themed: hasDailyPersonalStations(user) ? "Daily at 09:00" : "Saturday at 09:00" }
  }, { headers: { "cache-control": "private, no-store" } });
}

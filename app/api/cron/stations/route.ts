import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase";
import { runStations } from "@/lib/stations";
import type { UserSettings } from "@/lib/config";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slot = request.nextUrl.searchParams.get("slot") === "morning" ? "morning" : "evening";
  const snapshots = await adminDb().collection("users").where("stationAutopilot", "==", true).get();
  const result = [];
  for (const doc of snapshots.docs) result.push({ userId: doc.id, stations: await runStations(doc.data() as UserSettings, slot) });
  return NextResponse.json({ ok: true, result });
}

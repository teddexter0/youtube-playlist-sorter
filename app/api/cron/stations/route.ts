import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase";
import { runStations } from "@/lib/stations";
import type { UserSettings } from "@/lib/config";
import { envValue } from "@/lib/runtime-config";
import { tvErrorDetails } from "@/lib/tv-error";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const secret = envValue("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slot = request.nextUrl.searchParams.get("slot") === "morning" ? "morning" : "evening";
  const snapshots = await adminDb().collection("users").where("stationAutopilot", "==", true).get();
  const result = [];
  const now = new Date();
  let failures = 0;
  for (const doc of snapshots.docs) {
    try {
      const stations = await runStations(doc.data() as UserSettings, slot, now);
      failures += stations.filter(station => station.error).length;
      result.push({ userId: doc.id, stations });
    } catch (error) {
      failures++;
      result.push({ userId: doc.id, code: tvErrorDetails(error).code });
    }
  }
  console.info("Station cron finished", { slot, accounts: snapshots.size, failures, runs: result.flatMap(account => account.stations?.map(({ station, added, code }) => ({ station, added, code })) ?? []) });
  return NextResponse.json({ ok: failures === 0, result });
}

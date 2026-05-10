import { NextRequest, NextResponse } from "next/server";
import { runCleanupForUser } from "@/lib/janitor";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings, upsertUserSettings } from "@/lib/store";

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const { mode = "dry-run" } = (await request.json()) as { mode?: "dry-run" | "live" };
  const settings = await getUserSettings(userId);
  if (!settings) return NextResponse.json({ error: "Settings not found" }, { status: 404 });

  const results = await runCleanupForUser(settings, mode);
  if (mode === "dry-run") await upsertUserSettings(userId, { cleanupDryRunCompletedAt: new Date().toISOString() });
  return NextResponse.json({ results });
}

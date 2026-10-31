import { NextRequest, NextResponse } from "next/server";
import { runSortForUser } from "@/lib/janitor";
import { getAllUsersForSorting } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { runTvForUser } from "@/lib/tv";
import type { UserSettings } from "@/lib/config";

export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getAllUsersForSorting();
  const summaries = [];
  for (const user of users) {
    try {
      const results = await runSortForUser(user, "live");
      summaries.push({ userId: user.userId, ok: true, count: results.length });
    } catch (error) {
      summaries.push({
        userId: user.userId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  const tvUsers = await adminDb().collection("users").where("tv.liveEnabled", "==", true).get();
  const tvSummaries = [];
  for (const doc of tvUsers.docs) {
    try {
      const result = await runTvForUser(doc.data() as UserSettings, "live");
      tvSummaries.push({ userId: doc.id, ok: true, count: result.videos.length });
    } catch (error) {
      tvSummaries.push({ userId: doc.id, ok: false, error: error instanceof Error ? error.message : "TV run failed" });
    }
  }
  return NextResponse.json({ ok: true, users: summaries, tvUsers: tvSummaries });
}

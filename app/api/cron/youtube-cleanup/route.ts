import { NextRequest, NextResponse } from "next/server";
import { runCleanupForUser } from "@/lib/janitor";
import { getAllUsersForCleanup } from "@/lib/store";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function shouldRun(lastCleanupAt?: string) {
  if (!lastCleanupAt) return true;
  return Date.now() - new Date(lastCleanupAt).getTime() >= 14 * 24 * 60 * 60 * 1000;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getAllUsersForCleanup();
  const summaries = [];
  for (const user of users) {
    if (!shouldRun(user.lastCleanupAt)) {
      summaries.push({ userId: user.userId, ok: true, skipped: "Cleanup ran less than 14 days ago" });
      continue;
    }
    try {
      const results = await runCleanupForUser(user, "live");
      summaries.push({ userId: user.userId, ok: true, count: results.length });
    } catch (error) {
      summaries.push({
        userId: user.userId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return NextResponse.json({ ok: true, users: summaries });
}

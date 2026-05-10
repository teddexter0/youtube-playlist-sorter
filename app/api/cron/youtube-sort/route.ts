import { NextRequest, NextResponse } from "next/server";
import { runSortForUser } from "@/lib/janitor";
import { getAllUsersForSorting } from "@/lib/store";

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

  return NextResponse.json({ ok: true, users: summaries });
}

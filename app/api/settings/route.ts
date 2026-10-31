import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allPlaylistKeys } from "@/lib/config";
import { parsePlaylistId } from "@/lib/playlist";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings, publicUserSettings, upsertUserSettings } from "@/lib/store";

const schema = z.object({
  playlistIds: z.record(z.string()).default({}),
  liveSortingEnabled: z.boolean().default(false),
  cleanupEnabled: z.boolean().default(false),
  cleanupMode: z.enum(["age", "done"]).default("age"),
  excludedCleanupPlaylistKeys: z.array(z.string()).default(["newNj"])
});

export async function GET() {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const user = await getUserSettings(userId);
  return NextResponse.json(user ? publicUserSettings(user) : null);
}

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  const body = schema.parse(await request.json());
  const playlistIds = Object.fromEntries(
    allPlaylistKeys.map((key) => [key, parsePlaylistId(body.playlistIds[key] ?? "")]).filter(([, value]) => value)
  );

  const existing = await getUserSettings(userId);
  const liveSortingEnabled =
    body.liveSortingEnabled && existing?.sortingDryRunCompletedAt ? true : false;
  const cleanupEnabled =
    body.cleanupEnabled && existing?.cleanupDryRunCompletedAt ? true : false;

  await upsertUserSettings(userId, {
    playlistIds,
    liveSortingEnabled,
    cleanupEnabled,
    cleanupMode: body.cleanupMode,
    excludedCleanupPlaylistKeys: body.excludedCleanupPlaylistKeys as never[]
  });

  return NextResponse.json({ ok: true, liveSortingEnabled, cleanupEnabled });
}

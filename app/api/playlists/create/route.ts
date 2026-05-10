import { NextRequest, NextResponse } from "next/server";
import { playlistLabels, type PlaylistKey } from "@/lib/config";
import { listOwnPlaylistTitles, uniquePlaylistTitle, youtubeForUser } from "@/lib/google";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings, upsertUserSettings } from "@/lib/store";

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const settings = await getUserSettings(userId);
  if (!settings) return NextResponse.json({ error: "Settings not found" }, { status: 404 });

  const { key } = (await request.json()) as { key?: PlaylistKey };
  if (!key || key === "inbox") return NextResponse.json({ error: "Unsupported playlist key" }, { status: 400 });
  if (settings.playlistIds[key]) {
    return NextResponse.json({ error: "Playlist ID is already configured" }, { status: 400 });
  }

  const youtube = youtubeForUser(settings);
  const existingTitles = await listOwnPlaylistTitles(youtube);
  const title = uniquePlaylistTitle(playlistLabels[key], existingTitles);
  const created = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description: "Created by YouTube Playlist Auto-Janitor after explicit user request."
      },
      status: { privacyStatus: "private" }
    }
  });
  const playlistId = created.data.id;
  if (!playlistId) return NextResponse.json({ error: "YouTube did not return a playlist ID" }, { status: 500 });

  await upsertUserSettings(userId, {
    playlistIds: {
      ...settings.playlistIds,
      [key]: playlistId
    }
  });

  return NextResponse.json({ ok: true, playlistId, title });
}

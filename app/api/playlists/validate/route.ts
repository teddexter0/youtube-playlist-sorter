import { NextRequest, NextResponse } from "next/server";
import { youtubeForUser, validatePlaylist } from "@/lib/google";
import { parsePlaylistId } from "@/lib/playlist";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const settings = await getUserSettings(userId);
  if (!settings) return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  const { input } = (await request.json()) as { input?: string };
  const playlistId = parsePlaylistId(input ?? "");
  if (!playlistId) return NextResponse.json({ error: "Missing playlist ID" }, { status: 400 });

  const playlist = await validatePlaylist(youtubeForUser(settings), playlistId);
  if (!playlist) return NextResponse.json({ valid: false, playlistId });
  return NextResponse.json({
    valid: true,
    playlistId,
    title: playlist.snippet?.title,
    channelTitle: playlist.snippet?.channelTitle
  });
}

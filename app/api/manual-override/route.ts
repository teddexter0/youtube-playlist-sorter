import { NextRequest, NextResponse } from "next/server";
import { playlistLabels, type PlaylistKey } from "@/lib/config";
import { getVideos, playlistVideoRefs, youtubeForUser } from "@/lib/google";
import { parseIsoDurationSeconds } from "@/lib/playlist";
import { getCurrentUserId } from "@/lib/session";
import { appendLog, getUserSettings, saveProcessedVideo } from "@/lib/store";

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  const settings = await getUserSettings(userId);
  if (!settings) return NextResponse.json({ error: "Settings not found" }, { status: 404 });

  const body = (await request.json()) as { videoId?: string; targetKey?: PlaylistKey; dryRun?: boolean };
  if (!body.videoId || !body.targetKey) return NextResponse.json({ error: "videoId and targetKey are required" }, { status: 400 });
  const targetPlaylistId = settings.playlistIds[body.targetKey];
  if (!targetPlaylistId) return NextResponse.json({ error: "Target playlist is not configured" }, { status: 400 });

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      action: `Would add ${body.videoId} to ${playlistLabels[body.targetKey]}`
    });
  }

  const youtube = youtubeForUser(settings);
  const [video] = await getVideos(youtube, [body.videoId]);
  const durationSeconds = parseIsoDurationSeconds(video?.contentDetails?.duration);
  const refs = await playlistVideoRefs(youtube, targetPlaylistId);
  const targetVideos = await getVideos(youtube, refs.map((item) => item.videoId));
  const durationById = new Map(
    targetVideos.map((targetVideo) => [targetVideo.id, parseIsoDurationSeconds(targetVideo.contentDetails?.duration)])
  );
  const position = refs
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((item) => (durationById.get(item.videoId) ?? Number.POSITIVE_INFINITY) <= durationSeconds)
    .length;

  const inserted = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId: targetPlaylistId,
        position,
        resourceId: { kind: "youtube#video", videoId: body.videoId }
      }
    }
  });
  const now = new Date().toISOString();
  await saveProcessedVideo(userId, {
    videoId: body.videoId,
    sourcePlaylistId: settings.playlistIds.inbox ?? "",
    targetPlaylistId,
    targetPlaylistName: playlistLabels[body.targetKey],
    playlistItemIdInTarget: inserted.data.id ?? undefined,
    classifiedAt: now,
    addedToTargetAt: now,
    reason: "Manual override",
    confidence: 1,
    status: "processed"
  });
  await appendLog({
    userId,
    level: "info",
    message: "Manual override added video to playlist",
    data: { videoId: body.videoId, targetKey: body.targetKey, targetPlaylistId, position, durationSeconds },
    createdAt: now
  });

  return NextResponse.json({ ok: true, playlistItemId: inserted.data.id });
}

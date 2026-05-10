import { classifyVideo } from "@/lib/classifier";
import { playlistLabels, type PlaylistKey, type ProcessedVideo, type UserSettings } from "@/lib/config";
import { getSubscribedChannelIds, getTopCommentTexts, listPlaylistItems, getVideos, playlistVideoIds, playlistVideoRefs, youtubeForUser } from "@/lib/google";
import { parseIsoDurationSeconds } from "@/lib/playlist";
import {
  appendLog,
  cacheTargetPlaylist,
  getProcessedForCleanup,
  getProcessedVideo,
  saveProcessedVideo,
  touchCleanup
} from "@/lib/store";

type RunMode = "dry-run" | "live";

export type SortResult = {
  videoId: string;
  title?: string;
  channelTitle?: string;
  targetPlaylistName?: string;
  reason: string;
  confidence: number;
  status: ProcessedVideo["status"];
  action: string;
  durationSeconds: number;
};

function nowIso() {
  return new Date().toISOString();
}

async function log(userId: string, level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  await appendLog({ userId, level, message, data, createdAt: nowIso() });
}

function hasRequiredPlaylists(settings: UserSettings) {
  return Boolean(
    settings.playlistIds.inbox &&
      settings.playlistIds.next &&
      settings.playlistIds.lateNightShows &&
      settings.playlistIds.newNj &&
      settings.playlistIds.podcasts &&
      settings.playlistIds.news &&
      settings.playlistIds.games &&
      settings.playlistIds.football
  );
}

async function getDurationSortedInsertPosition(
  youtube: ReturnType<typeof youtubeForUser>,
  playlistId: string,
  durationSeconds: number
) {
  const refs = await playlistVideoRefs(youtube, playlistId);
  const ids = refs.map((item) => item.videoId);
  const videos = await getVideos(youtube, ids);
  const durationById = new Map(
    videos.map((video) => [video.id, parseIsoDurationSeconds(video.contentDetails?.duration)])
  );

  return refs
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((item) => (durationById.get(item.videoId) ?? Number.POSITIVE_INFINITY) <= durationSeconds)
    .length;
}

export async function runSortForUser(
  settings: UserSettings & { encryptedRefreshToken?: string },
  mode: RunMode
): Promise<SortResult[]> {
  if (!hasRequiredPlaylists(settings)) throw new Error("Missing required playlist IDs");
  if (mode === "live" && !settings.sortingDryRunCompletedAt) {
    throw new Error("Run a dry-run scan before enabling live sorting");
  }

  const youtube = youtubeForUser(settings);
  const inboxId = settings.playlistIds.inbox!;
  const inboxItems = await listPlaylistItems(youtube, inboxId);
  const inboxVideoIds = inboxItems
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  const videos = await getVideos(youtube, inboxVideoIds);
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const subscribedChannelIds = await getSubscribedChannelIds(youtube).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Unknown subscriptions error";
    await log(settings.userId, "warn", "Could not read subscriptions; classification will use video text only", { error: message });
    return new Set<string>();
  });
  const targetCaches = new Map<string, Set<string>>();
  const targetPositions = new Map<string, Map<string, number>>();
  const results: SortResult[] = [];

  await log(settings.userId, "info", `Starting ${mode} sort`, {
    inboxId,
    inboxCount: inboxVideoIds.length
  });

  for (const item of inboxItems) {
    const videoId = item.contentDetails?.videoId;
    if (!videoId) continue;
    const video = videoById.get(videoId);
    const snippet = video?.snippet;
    const durationSeconds = parseIsoDurationSeconds(video?.contentDetails?.duration);
    const commentTexts = await getTopCommentTexts(youtube, videoId).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Unknown comments error";
      await log(settings.userId, "warn", "Could not read comments for classification", { videoId, error: message });
      return [];
    });
    const classification = classifyVideo({
      title: snippet?.title ?? item.snippet?.title ?? "",
      description: snippet?.description ?? "",
      channelTitle: snippet?.channelTitle ?? item.snippet?.channelTitle ?? "",
      channelId: snippet?.channelId ?? item.snippet?.channelId ?? "",
      tags: snippet?.tags ?? [],
      commentTexts,
      categoryId: snippet?.categoryId ?? "",
      durationSeconds,
      isSubscribedChannel: subscribedChannelIds.has(snippet?.channelId ?? item.snippet?.channelId ?? "")
    });

    const base: SortResult = {
      videoId,
      title: snippet?.title ?? item.snippet?.title ?? "",
      channelTitle: snippet?.channelTitle ?? item.snippet?.channelTitle ?? "",
      targetPlaylistName: classification.targetPlaylistName,
      reason: classification.reason,
      confidence: classification.confidence,
      status: "skipped",
      action: "No action",
      durationSeconds
    };

    const existing = await getProcessedVideo(settings.userId, videoId);
    if (existing?.status === "processed" || existing?.status === "kept") {
      results.push({ ...base, status: "skipped", action: "Already processed earlier" });
      await log(settings.userId, "info", "Skipped already processed video", { videoId });
      continue;
    }

    if (classification.keepInInbox || !classification.targetKey) {
      const processed: ProcessedVideo = {
        videoId,
        sourcePlaylistId: inboxId,
        classifiedAt: nowIso(),
        reason: classification.reason,
        confidence: classification.confidence,
        status: "kept",
        title: base.title,
        channelTitle: base.channelTitle
      };
      if (mode === "live") await saveProcessedVideo(settings.userId, processed);
      results.push({ ...base, status: "kept", action: "Keep in Inbox" });
      await log(settings.userId, "info", "Kept video in Inbox", { videoId, reason: classification.reason });
      continue;
    }

    const targetId = settings.playlistIds[classification.targetKey];
    if (!targetId) {
      results.push({ ...base, status: "error", action: `Missing playlist ID for ${classification.targetKey}` });
      await log(settings.userId, "error", "Missing target playlist ID", { videoId, targetKey: classification.targetKey });
      continue;
    }

    if (!targetCaches.has(targetId)) {
      const ids = await playlistVideoIds(youtube, targetId);
      targetCaches.set(targetId, new Set(ids));
      await cacheTargetPlaylist(settings.userId, targetId, ids);
    }

    if (targetCaches.get(targetId)!.has(videoId)) {
      const processed: ProcessedVideo = {
        videoId,
        sourcePlaylistId: inboxId,
        targetPlaylistId: targetId,
        targetPlaylistName: playlistLabels[classification.targetKey],
        classifiedAt: nowIso(),
        addedToTargetAt: nowIso(),
        reason: "Already exists in target playlist",
        confidence: classification.confidence,
        status: "skipped",
        title: base.title,
        channelTitle: base.channelTitle
      };
      if (mode === "live") await saveProcessedVideo(settings.userId, processed);
      results.push({ ...base, status: "skipped", action: "Already in target playlist" });
      await log(settings.userId, "warn", "Skipped duplicate target insert", { videoId, targetId });
      continue;
    }

    if (mode === "dry-run") {
      results.push({ ...base, status: "processed", action: `Would add to ${playlistLabels[classification.targetKey]} in duration order` });
      continue;
    }

    try {
      if (!targetPositions.has(targetId)) targetPositions.set(targetId, new Map());
      const positionKey = `${targetId}:${durationSeconds}`;
      const cachedPosition = targetPositions.get(targetId)!.get(positionKey);
      const position = cachedPosition ?? (await getDurationSortedInsertPosition(youtube, targetId, durationSeconds));
      targetPositions.get(targetId)!.set(positionKey, position + 1);

      const inserted = await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: targetId,
            position,
            resourceId: { kind: "youtube#video", videoId }
          }
        }
      });
      const addedAt = nowIso();
      targetCaches.get(targetId)!.add(videoId);
      await saveProcessedVideo(settings.userId, {
        videoId,
        sourcePlaylistId: inboxId,
        targetPlaylistId: targetId,
        targetPlaylistName: playlistLabels[classification.targetKey],
        playlistItemIdInTarget: inserted.data.id ?? undefined,
        classifiedAt: addedAt,
        addedToTargetAt: addedAt,
        reason: classification.reason,
        confidence: classification.confidence,
        status: "processed",
        title: base.title,
        channelTitle: base.channelTitle
      });
      results.push({ ...base, status: "processed", action: `Added to ${playlistLabels[classification.targetKey]} at duration position ${position + 1}` });
      await log(settings.userId, "info", "Added video to target playlist", {
        videoId,
        targetId,
        targetName: playlistLabels[classification.targetKey],
        position,
        durationSeconds
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown YouTube insert error";
      await saveProcessedVideo(settings.userId, {
        videoId,
        sourcePlaylistId: inboxId,
        targetPlaylistId: targetId,
        targetPlaylistName: playlistLabels[classification.targetKey],
        classifiedAt: nowIso(),
        reason: classification.reason,
        confidence: classification.confidence,
        status: "error",
        title: base.title,
        channelTitle: base.channelTitle,
        error: message
      });
      results.push({ ...base, status: "error", action: message });
      await log(settings.userId, "error", "Failed adding video to target playlist", { videoId, targetId, error: message });
    }
  }

  await log(settings.userId, "info", `Finished ${mode} sort`, { resultCount: results.length });
  return results;
}

export async function runCleanupForUser(
  settings: UserSettings & { encryptedRefreshToken?: string },
  mode: RunMode
) {
  if (mode === "live" && !settings.cleanupDryRunCompletedAt) {
    throw new Error("Run cleanup dry-run before live cleanup");
  }

  const youtube = youtubeForUser(settings);
  const removed: SortResult[] = [];
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const doneIds = settings.playlistIds.done ? new Set(await playlistVideoIds(youtube, settings.playlistIds.done)) : new Set<string>();
  const candidates = await getProcessedForCleanup(settings.userId, cutoff);
  const excludedIds = new Set(
    settings.excludedCleanupPlaylistKeys
      .map((key: PlaylistKey) => settings.playlistIds[key])
      .filter((id): id is string => Boolean(id))
  );

  await log(settings.userId, "info", `Starting ${mode} cleanup`, {
    mode: settings.cleanupMode,
    candidates: candidates.length,
    note: "YouTube Data API does not expose per-video watch progress; age mode removes sorted playlist items after 14 days unless excluded."
  });

  for (const item of candidates) {
    if (!item.targetPlaylistId || !item.playlistItemIdInTarget) continue;
    if (excludedIds.has(item.targetPlaylistId)) continue;
    if (settings.cleanupMode === "done" && !doneIds.has(item.videoId)) continue;

    const result: SortResult = {
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      targetPlaylistName: item.targetPlaylistName,
      reason:
        settings.cleanupMode === "done"
          ? "Video appears in Done playlist"
          : "Video has been in sorted playlist for at least 14 days",
      confidence: 1,
      status: "removed",
      action: mode === "dry-run" ? "Would remove playlist item" : "Removed playlist item",
      durationSeconds: 0
    };

    if (mode === "live") {
      await youtube.playlistItems.delete({ id: item.playlistItemIdInTarget });
      await saveProcessedVideo(settings.userId, {
        ...item,
        status: "removed",
        reason: result.reason,
        classifiedAt: item.classifiedAt
      });
    }
    removed.push(result);
    await log(settings.userId, "info", result.action, { videoId: item.videoId, targetPlaylistId: item.targetPlaylistId });
  }

  if (mode === "live") await touchCleanup(settings.userId);
  await log(settings.userId, "info", `Finished ${mode} cleanup`, { removed: removed.length });
  return removed;
}

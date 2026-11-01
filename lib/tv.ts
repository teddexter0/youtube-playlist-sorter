import crypto from "crypto";
import type { UserSettings } from "./config";
import { adminDb } from "./firebase";
import { getSubscribedChannelIds, getYouTubeAccountTaste, getVideos, listPlaylistItems, validatePlaylist, youtubeForUser } from "./google";
import { parseIsoDurationSeconds } from "./playlist";
import { rankTvCandidates } from "./tv-ai";
import { selectTvMix, passesMetadataFilter, tvProfileSchema, categoryForVideo, discoveryInterests, type TvCandidate, type TvProfile, type TvLane } from "./tv-profile";

export function tvProfileHash(profile: TvProfile) {
  const { liveEnabled: _live, ...preferences } = profile;
  return crypto.createHash("sha256").update(JSON.stringify(preferences)).digest("hex");
}

export type TvRun = { videos: (TvCandidate & { action: string })[]; candidateCount: number; warnings: string[]; mode: "dry-run" | "live" };

export async function runTvForUser(user: UserSettings, mode: "dry-run" | "live", options: { manual?: boolean } = {}): Promise<TvRun> {
  const profile = tvProfileSchema.parse(user.tv ?? {});
  if (!profile.playlistId || !profile.interests.length) throw new Error("Save a TV playlist and at least one interest first.");
  if (mode === "live" && !options.manual && (!profile.liveEnabled || user.tvPreviewHash !== tvProfileHash(profile))) {
    throw new Error("Preview your saved TV preferences, then enable daily TV before running live.");
  }
  if (Object.entries(user.playlistIds).some(([key, id]) => key !== "tv" && id === profile.playlistId) || profile.seedPlaylistIds.includes(profile.playlistId)) {
    throw new Error("Use a separate TV playlist, distinct from Inbox, seed and sorted playlists.");
  }
  const ref = adminDb().collection("users").doc(user.userId);
  const lease = crypto.randomUUID();
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("A TV run is already in progress. Try again shortly.");
    if (snap.data()?.tv && tvProfileHash(tvProfileSchema.parse(snap.data()?.tv)) !== tvProfileHash(profile)) throw new Error("TV preferences changed; reload before running again.");
    if (mode === "live" && !options.manual && (!snap.data()?.tv?.liveEnabled || snap.data()?.tvPreviewHash !== tvProfileHash(profile))) throw new Error("Daily TV is paused or its preferences need a preview.");
    tx.update(ref, { tvLock: lease, tvLockUntil: Date.now() + 10 * 60000 });
  });
  try {
    const youtube = youtubeForUser(user);
    const playlist = await validatePlaylist(youtube, profile.playlistId);
    const channels = await youtube.channels.list({ part: ["id"], mine: true });
    if (!playlist || !channels.data.items?.some((c) => c.id === playlist.snippet?.channelId)) {
      throw new Error("TV playlist is missing or belongs to another channel. Use Build my TV playlist to reconnect it.");
    }
    const existingItems = await listPlaylistItems(youtube, profile.playlistId, 500);
    if (existingItems.length >= 40) {
      if (mode === "dry-run") await ref.update({ tvPreviewHash: tvProfileHash(profile) });
      return { videos: [], candidateCount: 0, mode, warnings: ["TV already has 40 or more videos. Remove finished items in YouTube before topping up; existing items are never deleted here."] };
    }
    const existing = new Set(existingItems.map((v) => v.contentDetails?.videoId ?? ""));
    const accountTaste = profile.useYouTubeLikes ? await getYouTubeAccountTaste(youtube) : null;
    const excluded = new Set([...existing, ...(user.tvHistory ?? []), ...Object.keys(user.tvFeedback ?? {})]);
    for (const id of accountTaste?.likedVideoIds ?? []) excluded.add(id);
    const blockedChannels = new Set(Object.values(user.tvFeedback ?? {}).filter((f) => f.action === "block-channel").map((f) => f.channelId));
    const warnings: string[] = [];
    const origins = new Map<string, { topic: string; discovery: boolean }>();
    const add = (id: string | null | undefined, topic: string, discovery = false) => { if (id && !origins.has(id)) origins.set(id, { topic, discovery }); };
    // Rotate through topics daily rather than spending search quota on every interest.
    const day = Math.floor(Date.now() / 86400000);
    const personalCount = profile.discoveryPercent > 0 ? 2 : 4;
    const topics = Array.from({ length: Math.min(personalCount, profile.interests.length) }, (_, i) => ({ topic: profile.interests[(day * personalCount + i) % profile.interests.length], discovery: false }));
    if (profile.discoveryPercent > 0) {
      for (let i = 0; i < 2; i++) topics.push({ topic: discoveryInterests[(day * 2 + i) % discoveryInterests.length], discovery: true });
    }
    await Promise.all(topics.flatMap(({ topic, discovery }) => [false, true].map(async (archive) => {
        const result = await youtube.search.list({
          part: ["snippet"], type: ["video"], q: topic, maxResults: 10,
          safeSearch: profile.sharedTv ? "strict" : "moderate", order: "relevance",
          ...(archive ? { publishedBefore: new Date(Date.now() - 365 * 86400000).toISOString() }
            : { publishedAfter: new Date(Date.now() - 30 * 86400000).toISOString() })
        });
        for (const item of result.data.items ?? []) add(item.id?.videoId, topic, discovery);
    })));
    for (const id of profile.seedPlaylistIds) {
      const items = await listPlaylistItems(youtube, id, 50);
      for (const item of items) add(item.contentDetails?.videoId, "Your saved picks");
    }
    if (profile.useSubscriptions) {
      const subscribed = Array.from(await getSubscribedChannelIds(youtube));
      const chosen = Array.from({ length: Math.min(4, subscribed.length) }, (_, i) => subscribed[(day * 4 + i) % subscribed.length]);
      if (chosen.length) {
        const details = await youtube.channels.list({ part: ["contentDetails"], id: chosen });
        for (const channel of details.data.items ?? []) {
          const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
          if (!uploads) continue;
          const items = await listPlaylistItems(youtube, uploads, 50);
          for (const item of items.slice(0, 8)) add(item.contentDetails?.videoId, "Your subscriptions");
        }
      }
    }
    const raw = await getVideos(youtube, Array.from(origins.keys()).filter((id) => !excluded.has(id)));
    let candidates: TvCandidate[] = raw.flatMap((video) => {
      if (!video.id || !video.snippet || video.snippet.liveBroadcastContent !== "none" || video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return [];
      const candidate: TvCandidate = {
        videoId: video.id, title: video.snippet.title ?? "", description: video.snippet.description ?? "",
        channelId: video.snippet.channelId ?? "", channelTitle: video.snippet.channelTitle ?? "",
        topic: origins.get(video.id)?.topic ?? "Discovery", publishedAt: video.snippet.publishedAt ?? "",
        discovery: origins.get(video.id)?.discovery ?? false,
        durationSeconds: parseIsoDurationSeconds(video.contentDetails?.duration), score: 0.7,
        reason: `Found via ${origins.get(video.id)?.topic}; metadata match, not a content review.`
      };
      candidate.category = categoryForVideo(candidate);
      return blockedChannels.has(candidate.channelId) || !passesMetadataFilter(candidate, profile) ? [] : [candidate];
    });
    if (profile.aiEnabled && candidates.length) {
      const likedIds = Object.entries(user.tvFeedback ?? {}).filter(([, f]) => f.action === "like").slice(-20).map(([id]) => id);
      const liked = await getVideos(youtube, likedIds);
      candidates = await rankTvCandidates(candidates.slice(0, 120), profile, [...(accountTaste?.likedTitles ?? []), ...liked.map((v) => v.snippet?.title ?? "")]);
    } else if (!profile.aiEnabled) {
      warnings.push("AI is off: selection uses search relevance, metadata filters and diversity rules. Shared-TV suitability is not certified.");
    }
    const categoryCounts = new Map<TvLane, number>();
    const channelCounts = new Map<string, number>();
    const queuedVideos = await getVideos(youtube, [...existing].filter(Boolean));
    for (const queued of queuedVideos) {
      const lane = categoryForVideo({ videoId: queued.id ?? "", title: queued.snippet?.title ?? "", channelTitle: queued.snippet?.channelTitle ?? "", channelId: queued.snippet?.channelId ?? "", description: queued.snippet?.description ?? "", topic: "Existing queue", durationSeconds: 0, publishedAt: "", score: 0, reason: "" });
      categoryCounts.set(lane, (categoryCounts.get(lane) ?? 0) + 1);
      const channelId = queued.snippet?.channelId ?? "";
      channelCounts.set(channelId, (channelCounts.get(channelId) ?? 0) + 1);
    }
    const recent = (user.tvRecent ?? []).filter((v) => Date.parse(v.at) > Date.now() - 31 * 86400000);
    const videos = selectTvMix(candidates, profile, excluded, Date.now(), { categoryCounts, channelCounts,
      recentLanes: recent.filter((v) => Date.parse(v.at) > Date.now() - 3 * 86400000).map((v) => v.category),
      monthlyMotorsportSeen: recent.some((v) => v.category === "motorsport")
    }).slice(0, Math.max(0, 40 - existingItems.length));
    if ([...categoryCounts.values()].some((count) => count > profile.maxPerTopic)) warnings.push("Your existing queue already has a topic above the new cap. No more of that topic will be added; manage older items in YouTube.");
    if (!videos.length) warnings.push("No new picks fit this mix. Your topic caps, seen videos or duration limits may have filled the available slots. Try more interests or remove finished items in YouTube.");
    const results: TvRun["videos"] = [];
    for (const video of videos) {
      if (mode === "live") {
        await youtube.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: {
          playlistId: profile.playlistId, resourceId: { kind: "youtube#video", videoId: video.videoId }
        } } });
        // Record each successful insertion so a partially failed run can resume safely.
        await adminDb().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          tx.update(ref, { tvHistory: [...new Set([...(snap.data()?.tvHistory ?? []), video.videoId])].slice(-500),
            tvRecent: [...(snap.data()?.tvRecent ?? []), { videoId: video.videoId, category: categoryForVideo(video), channelId: video.channelId, at: new Date().toISOString() }].slice(-300) });
        });
      }
      results.push({ ...video, action: mode === "live" ? "Added to TV" : "Would add to TV" });
    }
    if (mode === "dry-run" || (options.manual && videos.length)) await ref.update({ tvPreviewHash: tvProfileHash(profile) });
    await ref.collection("logs").add({ userId: user.userId, level: "info", message: `${mode} TV run: ${results.length} selections`, createdAt: new Date().toISOString() });
    return { videos: results, candidateCount: candidates.length, warnings, mode };
  } finally {
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.tvLock === lease) tx.update(ref, { tvLockUntil: 0, tvLock: "" });
    });
  }
}

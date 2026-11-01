import crypto from "crypto";
import type { UserSettings } from "./config";
import { adminDb } from "./firebase";
import { getSubscribedChannelIds, getYouTubeAccountTaste, getVideos, listPlaylistItems, validatePlaylist, youtubeForUser } from "./google";
import { parseIsoDurationSeconds } from "./playlist";
import { knownSeenIds, rememberSeen } from "./station-history";
import { stationSources } from "./station-sources";
import { orderExistingQueue } from "./playlist-order";
import { prepareStationRefresh, finishStationRefresh } from "./station-refresh";
import type { StationKey } from "./station-rules";
import { rankTvCandidates } from "./tv-ai";
import { selectTvMix, passesMetadataFilter, tvProfileSchema, categoryForVideo, planTvSearches, type TvCandidate, type TvProfile, type TvLane } from "./tv-profile";

export function tvProfileHash(profile: TvProfile) {
  const { liveEnabled: _live, ...preferences } = profile;
  return crypto.createHash("sha256").update(JSON.stringify(preferences)).digest("hex");
}

export type TvRun = { videos: (TvCandidate & { action: string })[]; candidateCount: number; warnings: string[]; mode: "dry-run" | "live" };

export async function runTvForUser(user: UserSettings, mode: "dry-run" | "live", options: { manual?: boolean; stationKey?: StationKey; cycleId?: string } = {}): Promise<TvRun> {
  const profile = tvProfileSchema.parse(user.tv ?? {});
  const key = options.stationKey ?? "tv";
  if (!profile.playlistId || !profile.interests.length) throw new Error("Save a TV playlist and at least one interest first.");
  if (mode === "live" && !options.manual && (!profile.liveEnabled || user.tvPreviewHash !== tvProfileHash(profile))) {
    throw new Error("Preview your saved TV preferences, then enable daily TV before running live.");
  }
  if (Object.entries(user.playlistIds).some(([name, id]) => name !== "tv" && !(key === "faith" && name === "newNj") && id === profile.playlistId) || (key !== "tv" && user.playlistIds.tv === profile.playlistId) || profile.seedPlaylistIds.includes(profile.playlistId)) {
    throw new Error("Use a separate TV playlist, distinct from Inbox, seed and sorted playlists.");
  }
  const ref = adminDb().collection("users").doc(user.userId);
  const lease = crypto.randomUUID();
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("A TV run is already in progress. Try again shortly.");
    const currentProfile = key === "tv" ? snap.data()?.tv : snap.data()?.stationProfiles?.[key];
    if (currentProfile && tvProfileHash(tvProfileSchema.parse(currentProfile)) !== tvProfileHash(profile)) throw new Error("TV preferences changed; reload before running again.");
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
    let existingItems = await listPlaylistItems(youtube, profile.playlistId, 500);
    let refreshToken = "";
    if (mode === "live") {
      const refresh = await prepareStationRefresh(user.userId, key, youtube, existingItems, options.cycleId);
      if (refresh.held) return { videos: [], candidateCount: 0, mode, warnings: [`Keeping your TV queue: ${refresh.gate?.watched} of ${refresh.gate?.total} videos qualify as watched. ${refresh.gate?.required} are needed before the next refresh. Two minutes of playback, a completed shorter clip, or an explicit watched mark counts. Native YouTube progress is unavailable.`] };
      existingItems = refresh.items; refreshToken = refresh.token;
    }
    if (existingItems.length >= 40) {
      if (mode === "live") await finishStationRefresh(user.userId, key, refreshToken);
      if (mode === "dry-run") await ref.update({ tvPreviewHash: tvProfileHash(profile) });
      return { videos: [], candidateCount: 0, mode, warnings: ["The queue is at capacity; no more videos were added."] };
    }
    const existing = new Set(existingItems.map((v) => v.contentDetails?.videoId ?? ""));
    const accountTaste = profile.useYouTubeLikes ? await getYouTubeAccountTaste(youtube) : null;
    const excluded = new Set([...existing, ...(user.tvHistory ?? []), ...Object.keys(user.tvFeedback ?? {})]);
    for (const id of accountTaste?.likedVideoIds ?? []) excluded.add(id);
    const blockedChannels = new Set(Object.values(user.tvFeedback ?? {}).filter((f) => f.action === "block-channel").map((f) => f.channelId));
    const warnings: string[] = [];
    const origins = new Map<string, { topic: string; discovery: boolean; subscribed?: boolean; officialTrailer?: boolean }>();
    const add = (id: string | null | undefined, topic: string, discovery = false, subscribed = false) => { if (id) { if (!origins.has(id)) origins.set(id, { topic, discovery, subscribed }); else if (subscribed) origins.get(id)!.subscribed = true; } };
    // Keep the same eight-call budget while covering twice as many topics.
    const day = Math.floor(Date.now() / 86400000);
    const cursor = key === "tv" ? user.tvSearchCursor ?? 0 : user.stationCursors?.[key] ?? 0;
    const topics = planTvSearches(profile, cursor);
    if (profile.useSubscriptions && accountTaste?.subscriptionTopics?.length && topics.some(topic => topic.discovery)) {
      const lastDiscovery = topics.map(topic => topic.discovery).lastIndexOf(true);
      topics[lastDiscovery] = { topic: accountTaste.subscriptionTopics[day % accountTaste.subscriptionTopics.length], discovery: true, archive: false, recentDays: 30 };
    }
    if (profile.preferredHandles.length || profile.mandatoryDaily || profile.stationMode === "faith") {
      const direct = await stationSources(user, profile);
      direct.origins.forEach((origin, id) => origins.set(id, origin)); warnings.push(...direct.warnings);
    }
    await Promise.all(topics.map(async ({ topic, discovery, archive, recentDays }) => {
        const result = await youtube.search.list({
          part: ["snippet"], type: ["video"], q: topic, maxResults: 10,
          safeSearch: profile.sharedTv ? "strict" : "moderate", order: "relevance",
          ...(archive ? { publishedBefore: new Date(Date.now() - 365 * 86400000).toISOString() }
            : { publishedAfter: new Date(Date.now() - recentDays * 86400000).toISOString() })
        });
        for (const item of result.data.items ?? []) add(item.id?.videoId, topic, discovery);
    }));
    for (const id of profile.seedPlaylistIds) {
      try {
        const items = await listPlaylistItems(youtube, id, 50);
        for (const item of items) add(item.contentDetails?.videoId, "Your saved picks");
      } catch (error) {
        const status = (error as { response?: { status?: number }; code?: number }).response?.status ?? (error as { code?: number }).code;
        if (status !== 404 && status !== 400) throw error;
        warnings.push(`A reference playlist (${id}) could not be read by YouTube. Check its full link and visibility; the rest of your mix can continue.`);
      }
    }
    if (profile.useSubscriptions && profile.stationMode !== "faith") {
      const subscribed = Array.from(await getSubscribedChannelIds(youtube));
      const chosen = Array.from({ length: Math.min(6, subscribed.length) }, (_, i) => subscribed[(day * 6 + i) % subscribed.length]);
      if (chosen.length) {
        const details = await youtube.channels.list({ part: ["contentDetails"], id: chosen });
        for (const channel of details.data.items ?? []) {
          const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
          if (!uploads) continue;
          const items = await listPlaylistItems(youtube, uploads, 50);
          for (const item of items.slice(0, 8)) add(item.contentDetails?.videoId, "Your subscriptions", false, true);
        }
      }
    }
    for (const id of await knownSeenIds(user.userId, [...origins.keys()])) excluded.add(id);
    const raw = await getVideos(youtube, Array.from(origins.keys()).filter((id) => !excluded.has(id)));
    let candidates: TvCandidate[] = raw.flatMap((video) => {
      if (!video.id || !video.snippet || video.snippet.liveBroadcastContent !== "none" || video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return [];
      const candidate: TvCandidate = {
        videoId: video.id, title: video.snippet.title ?? "", description: video.snippet.description ?? "",
        channelId: video.snippet.channelId ?? "", channelTitle: video.snippet.channelTitle ?? "",
        topic: origins.get(video.id)?.topic ?? "Discovery", publishedAt: video.snippet.publishedAt ?? "",
        discovery: origins.get(video.id)?.discovery ?? false,
        subscribed: origins.get(video.id)?.subscribed ?? false,
        officialTrailer: origins.get(video.id)?.officialTrailer ?? false,
        durationSeconds: parseIsoDurationSeconds(video.contentDetails?.duration), score: 0.7,
        reason: `Found via ${origins.get(video.id)?.topic}; metadata match, not a content review.`
      };
      candidate.category = categoryForVideo(candidate);
      if (candidate.subscribed) candidate.score += 0.05;
      if (/\bgameranx\b/i.test(candidate.channelTitle)) candidate.score += /\bfalcon\b/i.test(`${candidate.title} ${candidate.description}`) ? 0.15 : 0.05;
      if (/austin evans|marques brownlee|mkbhd|cleo abram|wrestlinggifs|critical drinker/i.test(candidate.channelTitle)) candidate.score += 0.1;
      if (profile.allowClassicFootball && /\b201\d\b|\b2020\b/.test(candidate.title) && categoryForVideo(candidate) === "football") { candidate.score = Math.max(0.85, candidate.score); candidate.classicFootball = true; }
      return blockedChannels.has(candidate.channelId) || !passesMetadataFilter(candidate, profile) ? [] : [candidate];
    });
    if (profile.aiEnabled && candidates.length) {
      const likedIds = Object.entries(user.tvFeedback ?? {}).filter(([, f]) => f.action === "like").slice(-20).map(([id]) => id);
      const liked = await getVideos(youtube, likedIds);
      if (profile.mandatoryDaily) candidates.sort((a,b) => Number(["trailers", "football"].includes(categoryForVideo(b))) - Number(["trailers", "football"].includes(categoryForVideo(a))));
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
    let videos = selectTvMix(candidates, profile, excluded, Date.now(), { categoryCounts, channelCounts,
      recentLanes: recent.filter((v) => Date.parse(v.at) > Date.now() - 3 * 86400000).map((v) => v.category),
      monthlyMotorsportSeen: recent.some((v) => v.category === "motorsport")
      , classicFootballSeen: recent.some(v => v.classicFootball)
    }).slice(0, Math.max(0, 40 - existingItems.length));
    if (profile.durationOrder) videos = videos.sort((a, b) => a.durationSeconds - b.durationSeconds);
    if (profile.mandatoryDaily) for (const lane of ["trailers", "football"] as const) {
      if (!videos.some(v => categoryForVideo(v) === lane) && !(categoryCounts.get(lane) ?? 0)) warnings.push(`No suitable unseen ${lane} could be added today. Freshness, source checks, time limits and topic caps still apply.`);
    }
    if ([...categoryCounts.values()].some((count) => count > profile.maxPerTopic)) warnings.push("Your existing queue already has a topic above the new cap. No more of that topic will be added; manage older items in YouTube.");
    if (!videos.length) warnings.push("No new picks fit this mix. Your topic caps, seen videos or duration limits may have filled the available slots. Try more interests or remove finished items in YouTube.");
    const results: TvRun["videos"] = [];
    const queuedDurations = mode === "live" && profile.durationOrder ? await orderExistingQueue(youtube, profile.playlistId, existingItems, queuedVideos) : [];
    for (const video of videos) {
      if (mode === "live") {
        await youtube.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: {
          playlistId: profile.playlistId, ...(profile.durationOrder ? { position: queuedDurations.filter(seconds => seconds <= video.durationSeconds).length } : {}), resourceId: { kind: "youtube#video", videoId: video.videoId }
        } } });
        if (profile.durationOrder) queuedDurations.push(video.durationSeconds);
        await rememberSeen(user.userId, [video.videoId], "delivered");
        // Record each successful insertion so a partially failed run can resume safely.
        await adminDb().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          tx.update(ref, { tvHistory: [...new Set([...(snap.data()?.tvHistory ?? []), video.videoId])].slice(-500),
            tvRecent: [...(snap.data()?.tvRecent ?? []), { videoId: video.videoId, category: categoryForVideo(video), channelId: video.channelId, at: new Date().toISOString(), classicFootball: Boolean(video.classicFootball) }].slice(-300) });
        });
      }
      results.push({ ...video, action: mode === "live" ? "Added to TV" : "Would add to TV" });
    }
    if (key === "tv" && (mode === "dry-run" || (options.manual && videos.length))) await ref.update({ tvPreviewHash: tvProfileHash(profile) });
    if (mode === "live") await ref.update({ [key === "tv" ? "tvSearchCursor" : `stationCursors.${key}`]: cursor + topics.filter((topic) => !topic.discovery).length });
    if (mode === "live") await finishStationRefresh(user.userId, key, refreshToken);
    await ref.collection("logs").add({ userId: user.userId, level: "info", message: `${mode} TV run: ${results.length} selections`, createdAt: new Date().toISOString() });
    return { videos: results, candidateCount: candidates.length, warnings, mode };
  } finally {
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.tvLock === lease) tx.update(ref, { tvLockUntil: 0, tvLock: "" });
    });
  }
}

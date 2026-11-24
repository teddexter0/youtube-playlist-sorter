import crypto from "crypto";
import type { UserSettings } from "./config";
import { adminDb } from "./firebase";
import { getSubscribedChannelIds, getYouTubeAccountTaste, getVideos, listPlaylistItems, readOptionalPlaylist, validatePlaylist, youtubeForUser } from "./google";
import { parseIsoDurationSeconds } from "./playlist";
import { knownSeenIds, rememberSeen } from "./station-history";
import { stationSources } from "./station-sources";
import { orderExistingQueue } from "./playlist-order";
import { prepareStationRefresh, beginStationRefresh, finishStationRefresh } from "./station-refresh";
import type { StationKey } from "./station-rules";
import { rankTvCandidates } from "./tv-ai";
import { selectTvMix, passesMetadataFilter, tvProfileSchema, categoryForVideo, planTvSearches, tvRankingScore, type TvCandidate, type TvProfile, type TvLane } from "./tv-profile";
import { envValue } from "./runtime-config";

export function tvProfileHash(profile: TvProfile) {
  const { liveEnabled: _live, ...preferences } = profile;
  return crypto.createHash("sha256").update(JSON.stringify(preferences)).digest("hex");
}

export type TvRun = { videos: (TvCandidate & { action: string })[]; candidateCount: number; warnings: string[]; mode: "dry-run" | "live"; appended?: { count: number; seconds: number; preserved: number; networks: string[]; previews: number } };

export async function runTvForUser(user: UserSettings, mode: "dry-run" | "live", options: { manual?: boolean; forceRefresh?: boolean; stationKey?: StationKey; cycleId?: string; appendLimit?: number; appendCycleId?: string; previousAppendSeconds?: number } = {}): Promise<TvRun> {
  const profile = tvProfileSchema.parse(user.tv ?? {});
  if (profile.stationMode === "childhood") {
    if (!profile.franchises.length) throw new Error("Add your childhood show titles before building nostalgia recommendations; generic children's content is not used.");
  }
  const key = options.stationKey ?? "tv";
  if (!profile.playlistId || (!profile.interests.length && profile.stationMode !== "childhood")) throw new Error("Save a TV playlist and at least one interest first.");
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
    const queue = await listPlaylistItems(youtube, profile.playlistId, 500);
    const appendBatch = Boolean(options.appendCycleId);
    const capacity = appendBatch ? 500 : 40;
    const refresh = mode === "live" && options.appendLimit === undefined && !appendBatch ? await prepareStationRefresh(user.userId, key, queue, options.cycleId, Date.now(), options.forceRefresh) : undefined;
    if (refresh?.held) return { videos: [], candidateCount: 0, mode, warnings: [`Keeping your TV queue: ${refresh.gate?.watched} of ${refresh.gate?.total} videos qualify as watched. It can refresh once ${refresh.gate?.required} qualify or the queue is 48 hours old. Native YouTube progress is unavailable.`] };
    const existingItems = refresh?.items ?? queue;
    if (existingItems.length >= capacity) {
      if (refresh?.started) await finishStationRefresh(user.userId, key, refresh.token, youtube, refresh.retiring);
      if (mode === "dry-run") await ref.update({ tvPreviewHash: tvProfileHash(profile) });
      return { videos: [], candidateCount: 0, mode, warnings: ["The queue is at capacity; no more videos were added."] };
    }
    let priorBatchItems = existingItems;
    if (options.appendCycleId) {
      const batch = ref.collection("stationRuns").doc(options.appendCycleId);
      const baseline = (await batch.get()).data()?.baselineItemIds as string[] | undefined;
      if (!baseline) {
        await batch.update({ baselineItemIds: existingItems.flatMap(item => item.id ? [item.id] : []) });
        priorBatchItems = [];
      } else {
        const baselineIds = new Set(baseline);
        priorBatchItems = existingItems.filter(item => item.id && !baselineIds.has(item.id));
      }
    }
    const accountTaste = profile.useYouTubeLikes ? await getYouTubeAccountTaste(youtube) : null;
    const excluded = new Set([...queue.map(item => item.contentDetails?.videoId ?? ""), ...(user.tvHistory ?? []), ...Object.keys(user.tvFeedback ?? {})]);
    for (const id of accountTaste?.likedVideoIds ?? []) excluded.add(id);
    const blockedChannels = new Set(Object.values(user.tvFeedback ?? {}).filter((f) => f.action === "block-channel").map((f) => f.channelId));
    const warnings: string[] = [];
    const origins = new Map<string, { topic: string; discovery: boolean; subscribed?: boolean; officialTrailer?: boolean; officialNetwork?: boolean; officialChannelId?: string }>();
    const add = (id: string | null | undefined, topic: string, discovery = false, subscribed = false) => { if (id) { if (!origins.has(id)) origins.set(id, { topic, discovery, subscribed }); else if (subscribed) origins.get(id)!.subscribed = true; } };
    // Keep the same eight-call budget while covering twice as many topics.
    const day = Math.floor(Date.now() / 86400000);
    const cursor = key === "tv" ? user.tvSearchCursor ?? 0 : user.stationCursors?.[key] ?? 0;
    const topics = planTvSearches(profile, cursor);
    if (profile.useSubscriptions && accountTaste?.subscriptionTopics?.length && topics.some(topic => topic.discovery)) {
      const lastDiscovery = topics.map(topic => topic.discovery).lastIndexOf(true);
      topics[lastDiscovery] = { topic: accountTaste.subscriptionTopics[day % accountTaste.subscriptionTopics.length], discovery: true, archive: false, recentDays: 30 };
    }
    if (profile.preferredHandles.length || profile.studioHandles.length || profile.publisherSources.length || profile.mandatoryDaily || ["faith", "popculture", "lifeskills"].includes(profile.stationMode)) {
      const direct = await stationSources(user, profile);
      direct.origins.forEach((origin, id) => origins.set(id, origin)); warnings.push(...direct.warnings);
    }
    const owner = envValue("PERSONAL_STATION_EMAIL");
    const region = owner && user.email === owner ? "KE" : undefined;
    const searches = await Promise.all(topics.map(async ({ archive, recentDays, topic, videoDuration }, index) => youtube.search.list({
      part: ["snippet"], type: ["video"], q: topic, maxResults: profile.stationMode === "childhood" ? 10 : 20,
      regionCode: region,
      videoDuration,
      safeSearch: profile.sharedTv ? "strict" : "moderate",
      order: profile.stationMode !== "childhood" && !archive && (cursor + index) % 2 === 1 ? "viewCount" : "relevance",
      ...(archive ? { publishedBefore: new Date(Date.now() - 365 * 86400000).toISOString() }
        : { publishedAfter: new Date(Date.now() - recentDays * 86400000).toISOString() })
    })));
    searches.forEach((result, i) => {
      for (const item of result.data.items ?? []) add(item.id?.videoId, topics[i].topic, topics[i].discovery);
    });
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
    if (profile.useSubscriptions && key === "tv") {
      const subscribed = Array.from(await getSubscribedChannelIds(youtube));
      const chosen = Array.from({ length: Math.min(6, subscribed.length) }, (_, i) => subscribed[(day * 6 + i) % subscribed.length]);
      if (chosen.length) {
        const details = await youtube.channels.list({ part: ["contentDetails"], id: chosen });
        for (const channel of details.data.items ?? []) {
          const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
          if (!uploads) continue;
          const items = await readOptionalPlaylist(youtube, uploads, 50, warnings, "a subscribed channel’s uploads");
          for (const item of items.slice(0, 8)) add(item.contentDetails?.videoId, "Your subscriptions", false, true);
        }
      }
    }
    for (const id of await knownSeenIds(user.userId, [...origins.keys()])) excluded.add(id);
    const raw = await getVideos(youtube, Array.from(origins.keys()).filter((id) => !excluded.has(id)), profile.stationMode !== "childhood");
    let candidates: TvCandidate[] = raw.flatMap((video) => {
      if (!video.id || !video.snippet || video.snippet.liveBroadcastContent !== "none" || video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return [];
      const restriction = video.contentDetails?.regionRestriction;
      if (region && (restriction?.blocked?.includes(region) || (restriction?.allowed && !restriction.allowed.includes(region)))) return [];
      const origin = origins.get(video.id);
      const official = Boolean(origin?.officialChannelId && origin.officialChannelId === video.snippet.channelId);
      const rating = video.contentDetails?.contentRating;
      const candidate: TvCandidate = {
        videoId: video.id, title: video.snippet.title ?? "", description: video.snippet.description ?? "",
        channelId: video.snippet.channelId ?? "", channelTitle: video.snippet.channelTitle ?? "",
        topic: origins.get(video.id)?.topic ?? "Discovery", publishedAt: video.snippet.publishedAt ?? "",
        discovery: origins.get(video.id)?.discovery ?? false,
        subscribed: origins.get(video.id)?.subscribed ?? false,
        officialTrailer: official && Boolean(origin?.officialTrailer),
        officialNetwork: official && Boolean(origin?.officialNetwork),
        matureRating: ["mpaaR", "mpaaNc17", "mpaaX"].includes(rating?.mpaaRating ?? "") || ["tvpgMa", "tvpg14"].includes(rating?.tvpgRating ?? ""),
        durationSeconds: parseIsoDurationSeconds(video.contentDetails?.duration), score: 0.7,
        ...(video.statistics?.viewCount ? { viewCount: Number(video.statistics.viewCount) } : {}),
        reason: `Found via ${origins.get(video.id)?.topic}; metadata match, not a content review.`
      };
      candidate.category = categoryForVideo(candidate);
      if (candidate.subscribed) candidate.score += 0.05;
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (profile.preferredHandles.some(handle => normalize(candidate.channelTitle).includes(normalize(handle)))) candidate.score += 0.1;
      if (profile.preferredHandles.some(handle => /gameranx/i.test(handle)) && /\bgameranx\b/i.test(candidate.channelTitle)) candidate.score += /\bfalcon\b/i.test(`${candidate.title} ${candidate.description}`) ? 0.15 : 0.05;
      if (profile.allowClassicFootball && /\b201\d\b|\b2020\b/.test(candidate.title) && categoryForVideo(candidate) === "football") { candidate.score = Math.max(0.85, candidate.score); candidate.classicFootball = true; }
      return blockedChannels.has(candidate.channelId) || !passesMetadataFilter(candidate, profile) ? [] : [candidate];
    });
    if (profile.aiEnabled && candidates.length) {
      const likedIds = Object.entries(user.tvFeedback ?? {}).filter(([, f]) => f.action === "like").slice(-20).map(([id]) => id);
      const liked = await getVideos(youtube, likedIds);
      const now = Date.now();
      const requiredLane = (video: TvCandidate) => Number(profile.mandatoryDaily && ["trailers", "football"].includes(categoryForVideo(video)));
      if (profile.stationMode !== "childhood") candidates.sort((a, b) => requiredLane(b) - requiredLane(a) || tvRankingScore(b, profile, now) - tvRankingScore(a, profile, now));
      try {
        candidates = await rankTvCandidates(candidates.slice(0, 120), profile, [...(accountTaste?.likedTitles ?? []), ...liked.map((v) => v.snippet?.title ?? "")]);
      } catch (error) {
        if (!region) throw error;
        warnings.push("AI ranking was unavailable. This mix used your viewing rules and YouTube metadata.");
      }
    } else if (!profile.aiEnabled) {
      warnings.push("AI is off: selection uses search relevance, metadata filters and diversity rules, plus recent viewership outside Childhood Recaps.");
    }
    const categoryCounts = new Map<TvLane, number>();
    const channelCounts = new Map<string, number>();
    const queuedVideos = await getVideos(youtube, [...new Set(priorBatchItems.flatMap(item => item.contentDetails?.videoId ? [item.contentDetails.videoId] : []))]);
    for (const queued of queuedVideos) {
      const lane = categoryForVideo({ videoId: queued.id ?? "", title: queued.snippet?.title ?? "", channelTitle: queued.snippet?.channelTitle ?? "", channelId: queued.snippet?.channelId ?? "", description: queued.snippet?.description ?? "", topic: "Existing queue", durationSeconds: 0, publishedAt: "", score: 0, reason: "" });
      categoryCounts.set(lane, (categoryCounts.get(lane) ?? 0) + 1);
      const channelId = queued.snippet?.channelId ?? "";
      channelCounts.set(channelId, (channelCounts.get(channelId) ?? 0) + 1);
    }
    const recent = (user.tvRecent ?? []).filter((v) => Date.parse(v.at) > Date.now() - 31 * 86400000);
    const deliveredSeconds = appendBatch || refresh?.started ? queuedVideos.reduce((total, video) => total + parseIsoDurationSeconds(video.contentDetails?.duration), 0) : 0;
    let videos = selectTvMix(candidates, profile, excluded, Date.now(), { categoryCounts, channelCounts, deliveredSeconds, previousAppendSeconds: options.previousAppendSeconds,
      maxItems: Math.max(0, Math.min((options.appendLimit ?? 40) - ((appendBatch || refresh?.started) ? priorBatchItems.length : 0), capacity - existingItems.length)),
      recentLanes: recent.filter((v) => Date.parse(v.at) > Date.now() - 3 * 86400000).map((v) => v.category),
      monthlyMotorsportSeen: recent.some((v) => v.category === "motorsport")
      , classicFootballSeen: recent.some(v => v.classicFootball)
    });
    const orderQueue = profile.durationOrder && !(profile.strictComfort && key === "tv") && !appendBatch;
    if (profile.durationOrder && (orderQueue || (appendBatch && key !== "tv"))) videos = videos.sort((a, b) => a.durationSeconds - b.durationSeconds);
    if (profile.mandatoryDaily) for (const lane of ["trailers", "football"] as const) {
      if (!videos.some(v => categoryForVideo(v) === lane) && !(categoryCounts.get(lane) ?? 0)) warnings.push(`No suitable unseen ${lane} could be added today. Freshness, source checks, time limits and topic caps still apply.`);
    }
    if ([...categoryCounts.values()].some((count) => count > profile.maxPerTopic)) warnings.push("Your existing queue already has a topic above the new cap. No more of that topic will be added; manage older items in YouTube.");
    if (!videos.length) warnings.push(refresh?.retiring.length && !existingItems.length
      ? "No suitable replacement picks were found. Your current playlist is still in place."
      : "No new picks fit this mix. Check your topics, seen videos and duration limits.");
    const results: TvRun["videos"] = [];
    if (refresh?.token && !refresh.started && videos.length) await beginStationRefresh(user.userId, key, refresh.token, refresh.retiring);
    const queuedDurations = mode === "live" && orderQueue ? await orderExistingQueue(youtube, profile.playlistId, existingItems, queuedVideos) : [];
    for (const video of videos) {
      if (mode === "live") {
        await youtube.playlistItems.insert({ part: ["snippet"], requestBody: { snippet: {
          playlistId: profile.playlistId, ...(orderQueue ? { position: queuedDurations.filter(seconds => seconds <= video.durationSeconds).length } : {}), resourceId: { kind: "youtube#video", videoId: video.videoId }
        } } });
        if (orderQueue) queuedDurations.push(video.durationSeconds);
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
    if (refresh?.token && (videos.length || (refresh.started && existingItems.length))) {
      await finishStationRefresh(user.userId, key, refresh.token, youtube, refresh.retiring);
    }
    let appended: TvRun["appended"];
    if (appendBatch) {
      const confirmed = await listPlaylistItems(youtube, profile.playlistId, 500);
      const priorIds = new Set(priorBatchItems.map(item => item.id));
      const preserved = queue.filter(item => !priorIds.has(item.id));
      const baselineIds = new Set(preserved.map(item => item.id));
      const preservedAfter = confirmed.filter(item => baselineIds.has(item.id));
      const confirmedVideos = new Set(confirmed.map(item => item.contentDetails?.videoId));
      if (preservedAfter.length !== preserved.length || preservedAfter.some((item, index) => item.id !== preserved[index].id) || videos.some(video => !confirmedVideos.has(video.videoId))) {
        throw new Error("YouTube did not confirm the full append-only update.");
      }
      appended = { count: priorBatchItems.length + videos.length, seconds: deliveredSeconds + videos.reduce((total, video) => total + video.durationSeconds, 0), preserved: preserved.length,
        networks: [...new Set(videos.filter(video => video.officialNetwork).map(video => video.channelTitle))], previews: videos.filter(video => video.officialTrailer).length };
    }
    await ref.collection("logs").add({ userId: user.userId, level: "info", message: `${mode} TV run: ${results.length} selections`, createdAt: new Date().toISOString() });
    return { videos: results, candidateCount: candidates.length, warnings, mode, appended };
  } finally {
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.tvLock === lease) tx.update(ref, { tvLockUntil: 0, tvLock: "" });
    });
  }
}

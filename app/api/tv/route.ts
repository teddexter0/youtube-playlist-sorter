import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { parsePlaylistId } from "@/lib/playlist";
import { stationFilterSchema, tvProfileSchema } from "@/lib/tv-profile";
import { runTvForUser, tvProfileHash } from "@/lib/tv";
import { defaultTvProfile } from "@/lib/tv-profile";
import { getVideos, getYouTubeAccountTaste, listOwnPlaylistTitles, uniquePlaylistTitle, findOwnedStationPlaylist, youtubeForUser } from "@/lib/google";
import crypto from "crypto";
import { tvErrorDetails } from "@/lib/tv-error";
import { rememberSeen } from "@/lib/station-history";
import { enableStations, runStations } from "@/lib/stations";
import { searchPublishers, publisherFromChannel } from "@/lib/publishers";
import { parseIsoDurationSeconds } from "@/lib/playlist";
import { listPlaylistItems } from "@/lib/google";
import { recordPlayback } from "@/lib/station-refresh";
import { activeStationKeys } from "@/lib/station-rules";

export const maxDuration = 300;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search-publishers"), query: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("kickoff") }),
  z.object({ action: z.literal("save-weekly-filters"), station: z.enum(["faith", "childhood", "popculture", "lifeskills", "custom1", "custom2", "custom3"]), filters: stationFilterSchema }),
  z.object({ action: z.literal("save-stations"), stations: z.array(z.object({ key: z.enum(["tv", "childhood", "faith", "popculture", "lifeskills", "custom1", "custom2", "custom3"]), name: z.string().trim().min(1).max(80), interests: z.array(z.string().trim().min(2).max(400)).max(60) })).min(1).max(5) }),
  z.object({ action: z.literal("progress"), videoId: z.string().regex(/^[\w-]{11}$/), seconds: z.number().min(0).max(15), eventId: z.string().uuid() }),
  z.object({ action: z.literal("autopilot"), enabled: z.boolean() }),
  z.object({ action: z.literal("queue") }),
  z.object({ action: z.literal("import-watched"), videoIds: z.array(z.string().regex(/^[\w-]{11}$/)).max(1000) }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("import-taste") }),
  z.object({ action: z.literal("save"), profile: tvProfileSchema }),
  z.object({ action: z.literal("run"), mode: z.enum(["dry-run", "live"]) }),
  z.object({ action: z.literal("feedback"), videoId: z.string().regex(/^[\w-]{11}$/),
    feedback: z.enum(["like", "skip", "watched", "block-channel"]) })
]);

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Connect Google first." }, { status: 401 });
  let action = "parse";
  try {
    const body = actionSchema.parse(await request.json());
    action = body.action;
    const user = await getUserSettings(userId);
    if (!user) return NextResponse.json({ error: "Settings not found." }, { status: 404 });
    if (user.storageMigrating) throw new Error("Your app data is moving to dedicated storage. Please wait for the connection update.");
    if (body.action === "search-publishers") return NextResponse.json({ publishers: await searchPublishers(user, body.query) });
    if (body.action === "kickoff") {
      await enableStations(user, true);
      const current = await getUserSettings(userId);
      if (!current) throw new Error("Account not found.");
      const result = await runStations(current, "evening", new Date(), { trigger: "kickoff" });
      return NextResponse.json({ ok: true, profile: (await getUserSettings(userId))?.tv ?? current.tv, result });
    }
    if (body.action === "progress") return NextResponse.json({ ok: true, progress: await recordPlayback(userId, body.videoId, body.seconds, body.eventId) }, { headers: { "cache-control": "private, no-store" } });
    if (body.action === "autopilot") return NextResponse.json({ ok: true, profile: await enableStations(user, body.enabled), enabled: body.enabled });
    if (body.action === "import-watched") return NextResponse.json({ ok: true, imported: await rememberSeen(userId, body.videoIds, "watch-history-import") });
    if (body.action === "queue") {
      if (!user.tv?.playlistId) return NextResponse.json({ videos: [] });
      const yt = youtubeForUser(user);
      const items = await listPlaylistItems(yt, user.tv.playlistId, 40);
      const videos = await getVideos(yt, items.map(item => item.contentDetails?.videoId ?? "").filter(Boolean));
      return NextResponse.json({ videos: videos.filter(v => !["watched", "skip", "block-channel"].includes(user.tvFeedback?.[v.id ?? ""]?.action ?? "")).map(v => ({ videoId: v.id, title: v.snippet?.title ?? "", channelTitle: v.snippet?.channelTitle ?? "", durationSeconds: parseIsoDurationSeconds(v.contentDetails?.duration) })).sort((a,b) => a.durationSeconds-b.durationSeconds) }, { headers: { "cache-control": "private, no-store" } });
    }
    if (body.action === "run") return NextResponse.json(await runTvForUser(user, body.mode, { manual: body.mode === "live", appendLimit: 40 }));
    const ref = adminDb().collection("users").doc(userId);
    if (body.action === "save-weekly-filters") {
      const { station, filters } = body;
      if (filters.aiEnabled && !(await import("@/lib/tv-ai")).aiConfigured()) throw new Error("AI ranking is not configured on the server yet.");
      const profile = await adminDb().runTransaction(async tx => {
        const current = (await tx.get(ref)).data() as (typeof user & { tvLockUntil?: number }) | undefined;
        if (!current || !activeStationKeys(current).includes(station)) throw new Error("This station is no longer in your lineup.");
        if ((current.tvLockUntil ?? 0) > Date.now()) throw new Error("Wait for the current playlist build before saving filters.");
        const next = tvProfileSchema.parse({ ...current.stationProfiles?.[station], ...filters, stationMode: station.startsWith("custom") ? "tv" : station });
        tx.update(ref, { [`stationProfiles.${station}`]: next, updatedAt: new Date().toISOString() });
        return next;
      });
      return NextResponse.json({ ok: true, profile });
    }
    if (body.action === "save-stations") {
      const maximum = user.personalStationVersion ? Math.max(4, activeStationKeys(user).length) : 4;
      if (body.stations.length > maximum || new Set(body.stations.map(s => s.key)).size !== body.stations.length || !body.stations.some(s => s.key === "tv")) throw new Error("Choose your main TV playlist and up to three additional channels.");
      const profiles = { ...user.stationProfiles };
      for (const station of body.stations) {
        const prior = station.key === "tv" ? user.tv : profiles[station.key];
        if (station.key !== "tv" && !station.interests.length && !prior?.franchises?.length && station.key !== "faith") throw new Error(`Add interests for ${station.name}.`);
        profiles[station.key] = tvProfileSchema.parse({ ...prior, displayName: station.name, interests: station.interests,
          stationMode: station.key.startsWith("custom") ? "tv" : station.key, liveEnabled: false,
          ...(station.key.startsWith("custom") && !prior ? { lightViewing: false, durationOrder: true, rollingQueue: true } : {}) });
      }
      await adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("Wait for the current playlist build before changing channels.");
        tx.update(ref, { stationProfiles: profiles, tv: profiles.tv, enabledStations: body.stations.map(s => s.key), stationAutopilot: false, updatedAt: new Date().toISOString() });
      });
      return NextResponse.json({ ok: true, profile: profiles.tv, stations: profiles, enabledStations: body.stations.map(s => s.key) });
    }
    if (body.action === "import-taste" || body.action === "start") {
      let setup;
      const lease = crypto.randomUUID();
      await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("A TV action is already running. Try again shortly.");
        tx.update(ref, { tvLock: lease, tvLockUntil: Date.now() + 10 * 60000 });
      });
      try {
        const youtube = youtubeForUser(user);
        const taste = await getYouTubeAccountTaste(youtube);
        if (!taste.interests.length && !(body.action === "start" && user.tv?.interests.length)) throw new Error("This YouTube account has no usable likes/subscription topics yet. Add interests below or connect your usual account.");
        let playlistId = user.tv?.playlistId || user.playlistIds.tv;
        if (playlistId && !await findOwnedStationPlaylist(youtube, playlistId)) playlistId = "";
        if (!playlistId) {
          const titles = await listOwnPlaylistTitles(youtube);
          const created = await youtube.playlists.insert({ part: ["snippet", "status"], requestBody: {
            snippet: { title: uniquePlaylistTitle("TV", titles), description: "Your personal TV queue, curated from your YouTube tastes." },
            status: { privacyStatus: "private" }
          } });
          playlistId = created.data.id ?? "";
          if (!playlistId) throw new Error("YouTube did not return a TV playlist ID.");
        }
        const profile = { ...defaultTvProfile, ...user.tv, playlistId,
          interests: body.action === "start" && user.tv?.interests.length ? user.tv.interests : [...new Set([...(user.tv?.interests ?? []), ...taste.interests])].slice(0, 60),
          useSubscriptions: user.tv?.useSubscriptions ?? true, useYouTubeLikes: user.tv?.useYouTubeLikes ?? true };
        await ref.update({ tv: profile, "playlistIds.tv": playlistId, "stationProfiles.tv": profile, tvPreviewHash: tvProfileHash(profile), updatedAt: new Date().toISOString() });
        setup = { ok: true, profile, subscriptionCount: taste.subscriptionCount, likedCount: taste.likedCount };
      } finally {
        await adminDb().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.data()?.tvLock === lease) tx.update(ref, { tvLock: "", tvLockUntil: 0 });
        });
      }
      if (body.action === "start") {
        // Release setup's lease before the queue builder acquires its own lease.
        // Read again so playlist recovery and partial-success retries use saved data.
        try {
          const current = await getUserSettings(userId);
          if (!current) throw new Error("Reload and reconnect your Google account.");
          const run = await runTvForUser(current, "live", { manual: true, appendLimit: 40 });
          return NextResponse.json({ ...setup, run });
        } catch (error) {
          const details = tvErrorDetails(error);
          console.warn("TV fill failed", { action, code: details.code, status: details.status });
          return NextResponse.json({ ...setup, runError: details.error, errorCode: details.code });
        }
      }
      return NextResponse.json(setup);
    }
    if (body.action === "save") {
      const profile = { ...body.profile, playlistId: parsePlaylistId(body.profile.playlistId),
        seedPlaylistIds: body.profile.seedPlaylistIds.map(parsePlaylistId).filter(Boolean) };
      if (profile.publisherSources.length) {
        const actual = await youtubeForUser(user).channels.list({ part: ["id", "snippet"], id: profile.publisherSources.map(source => source.channelId) });
        if (actual.data.items?.length !== new Set(profile.publisherSources.map(source => source.channelId)).size) throw new Error("One of the selected publisher channels is unavailable.");
        profile.publisherSources = actual.data.items.map(publisherFromChannel);
      }
      if (profile.aiEnabled) {
        const { aiConfigured } = await import("@/lib/tv-ai");
        if (!aiConfigured()) throw new Error("AI ranking is not configured on the server yet.");
      }
      await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("Wait for the current TV run before editing preferences.");
        const wasLive = Boolean(snap.data()?.tv?.liveEnabled || snap.data()?.stationAutopilot);
        if (profile.liveEnabled && !wasLive && snap.data()?.tvPreviewHash !== tvProfileHash(profile)) throw new Error("Preview your preferences before turning on daily TV.");
        if (wasLive) profile.liveEnabled = true;
        const topicsChanged = JSON.stringify(snap.data()?.tv?.interests ?? []) !== JSON.stringify(profile.interests);
        tx.update(ref, { tv: profile, "stationProfiles.tv": profile, ...(wasLive ? { tvPreviewHash: tvProfileHash(profile) } : {}), ...(topicsChanged ? { tvSearchCursor: 0 } : {}), updatedAt: new Date().toISOString() });
      });
      return NextResponse.json({ ok: true, profile });
    }
    // Resolve channel from YouTube instead of trusting a client-supplied channel ID.
    const [video] = await getVideos(youtubeForUser(user), [body.videoId]);
    if (!video?.snippet?.channelId) throw new Error("Video is unavailable; could not record feedback.");
    const channelId = video.snippet.channelId;
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const feedback: NonNullable<import("@/lib/config").UserSettings["tvFeedback"]> = { ...(snap.data()?.tvFeedback ?? {}), [body.videoId]: {
        action: body.feedback, channelId, at: new Date().toISOString()
      } };
      if (Object.keys(feedback).length > 300) {
        const oldest = Object.entries(feedback).filter(([, value]) => value.action !== "block-channel").sort((a,b) => a[1].at.localeCompare(b[1].at));
        for (const [id] of oldest.slice(0, Object.keys(feedback).length - 300)) delete feedback[id];
      }
      tx.update(ref, { tvFeedback: feedback });
    });
    if (body.feedback === "skip" || body.feedback === "watched") {
      await rememberSeen(userId, [body.videoId], body.feedback);
      if (body.feedback === "watched") await recordPlayback(userId, body.videoId, 0, crypto.randomUUID(), true);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = tvErrorDetails(error);
    console.warn("TV request failed", { action, code: details.code, status: details.status });
    return NextResponse.json({ error: details.error, code: details.code }, { status: details.status });
  }
}

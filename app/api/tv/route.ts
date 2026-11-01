import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { parsePlaylistId } from "@/lib/playlist";
import { tvProfileSchema } from "@/lib/tv-profile";
import { runTvForUser, tvProfileHash } from "@/lib/tv";
import { defaultTvProfile } from "@/lib/tv-profile";
import { getVideos, getYouTubeAccountTaste, listOwnPlaylistTitles, uniquePlaylistTitle, validatePlaylist, youtubeForUser } from "@/lib/google";
import crypto from "crypto";
import { tvErrorDetails } from "@/lib/tv-error";
import { rememberSeen } from "@/lib/station-history";
import { enableStations } from "@/lib/stations";
import { parseIsoDurationSeconds } from "@/lib/playlist";
import { listPlaylistItems } from "@/lib/google";

export const maxDuration = 300;

const actionSchema = z.discriminatedUnion("action", [
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
    if (body.action === "autopilot") return NextResponse.json({ ok: true, profile: await enableStations(user, body.enabled), enabled: body.enabled });
    if (body.action === "import-watched") return NextResponse.json({ ok: true, imported: await rememberSeen(userId, body.videoIds, "watch-history-import") });
    if (body.action === "queue") {
      if (!user.tv?.playlistId) return NextResponse.json({ videos: [] });
      const yt = youtubeForUser(user);
      const items = await listPlaylistItems(yt, user.tv.playlistId, 40);
      const videos = await getVideos(yt, items.map(item => item.contentDetails?.videoId ?? "").filter(Boolean));
      return NextResponse.json({ videos: videos.map(v => ({ videoId: v.id, title: v.snippet?.title ?? "", channelTitle: v.snippet?.channelTitle ?? "", durationSeconds: parseIsoDurationSeconds(v.contentDetails?.duration) })).sort((a,b) => a.durationSeconds-b.durationSeconds) }, { headers: { "cache-control": "private, no-store" } });
    }
    if (body.action === "run") return NextResponse.json(await runTvForUser(user, body.mode, { manual: body.mode === "live" }));
    const ref = adminDb().collection("users").doc(userId);
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
        if (playlistId) {
          let playlist;
          try {
            playlist = await validatePlaylist(youtube, playlistId);
          } catch (error) {
            // Only a confirmed missing playlist warrants replacement; quota/auth
            // failures must not create a new empty playlist on every attempt.
            if ((error as { response?: { status?: number }; code?: number }).response?.status !== 404 && (error as { code?: number }).code !== 404) throw error;
          }
          if (!playlist) playlistId = "";
          else {
            const own = await youtube.channels.list({ part: ["id"], mine: true });
            if (!own.data.items?.some((channel) => channel.id === playlist.snippet?.channelId)) throw new Error("The saved TV playlist belongs to another YouTube channel. Connect its owner or clear the TV playlist field and save.");
          }
        }
        if (!playlistId) {
          const titles = await listOwnPlaylistTitles(youtube);
          const created = await youtube.playlists.insert({ part: ["snippet", "status"], requestBody: {
            snippet: { title: uniquePlaylistTitle("TV", titles), description: "Your personal TV queue, curated from your YouTube tastes." },
            status: { privacyStatus: "private" }
          } });
          playlistId = created.data.id ?? "";
          if (!playlistId) throw new Error("YouTube did not return a TV playlist ID.");
          await ref.update({ "playlistIds.tv": playlistId });
        }
        const profile = { ...defaultTvProfile, ...user.tv, playlistId,
          interests: body.action === "start" && user.tv?.interests.length ? user.tv.interests : [...new Set([...(user.tv?.interests ?? []), ...taste.interests])].slice(0, 60),
          useSubscriptions: user.tv?.useSubscriptions ?? true, useYouTubeLikes: user.tv?.useYouTubeLikes ?? true };
        await ref.update({ tv: profile, updatedAt: new Date().toISOString() });
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
          const run = await runTvForUser(current, "live", { manual: true });
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
      if (profile.aiEnabled) {
        const { aiConfigured } = await import("@/lib/tv-ai");
        if (!aiConfigured()) throw new Error("AI ranking is not configured on the server yet.");
      }
      await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("Wait for the current TV run before editing preferences.");
        if (profile.liveEnabled && snap.data()?.tvPreviewHash !== tvProfileHash(profile)) throw new Error("Save with daily TV off, preview these preferences, then enable daily TV.");
        const topicsChanged = JSON.stringify(snap.data()?.tv?.interests ?? []) !== JSON.stringify(profile.interests);
        tx.update(ref, { tv: profile, ...(topicsChanged ? { tvSearchCursor: 0 } : {}), ...(!profile.liveEnabled ? { stationAutopilot: false } : {}), updatedAt: new Date().toISOString() });
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
      const yt = youtubeForUser(user);
      if (user.tv?.playlistId) for (const item of await listPlaylistItems(yt, user.tv.playlistId, 40)) {
        if (item.contentDetails?.videoId === body.videoId && item.id) await yt.playlistItems.delete({ id: item.id });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = tvErrorDetails(error);
    console.warn("TV request failed", { action, code: details.code, status: details.status });
    return NextResponse.json({ error: details.error, code: details.code }, { status: details.status });
  }
}

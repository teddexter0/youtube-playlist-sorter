import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { parsePlaylistId } from "@/lib/playlist";
import { tvProfileSchema } from "@/lib/tv-profile";
import { runTvForUser, tvProfileHash } from "@/lib/tv";
import { defaultTvProfile } from "@/lib/tv-profile";
import { getVideos, getYouTubeAccountTaste, listOwnPlaylistTitles, uniquePlaylistTitle, youtubeForUser } from "@/lib/google";
import crypto from "crypto";

export const maxDuration = 300;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import-taste") }),
  z.object({ action: z.literal("save"), profile: tvProfileSchema }),
  z.object({ action: z.literal("run"), mode: z.enum(["dry-run", "live"]) }),
  z.object({ action: z.literal("feedback"), videoId: z.string().regex(/^[\w-]{11}$/),
    feedback: z.enum(["like", "skip", "watched", "block-channel"]) })
]);

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Connect Google first." }, { status: 401 });
  try {
    const body = actionSchema.parse(await request.json());
    const user = await getUserSettings(userId);
    if (!user) return NextResponse.json({ error: "Settings not found." }, { status: 404 });
    if (body.action === "run") return NextResponse.json(await runTvForUser(user, body.mode));
    const ref = adminDb().collection("users").doc(userId);
    if (body.action === "import-taste") {
      const lease = crypto.randomUUID();
      await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if ((snap.data()?.tvLockUntil ?? 0) > Date.now()) throw new Error("A TV action is already running. Try again shortly.");
        tx.update(ref, { tvLock: lease, tvLockUntil: Date.now() + 10 * 60000 });
      });
      try {
        const youtube = youtubeForUser(user);
        const taste = await getYouTubeAccountTaste(youtube);
        if (!taste.interests.length) throw new Error("This YouTube account has no usable likes/subscription topics yet. Add interests below or connect your usual account.");
        let playlistId = user.tv?.playlistId || user.playlistIds.tv;
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
        const profile = { ...defaultTvProfile, ...user.tv, playlistId, interests: taste.interests, useSubscriptions: true, useYouTubeLikes: true, liveEnabled: false };
        await ref.update({ tv: profile, updatedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true, profile, subscriptionCount: taste.subscriptionCount, likedCount: taste.likedCount });
      } finally {
        await adminDb().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.data()?.tvLock === lease) tx.update(ref, { tvLock: "", tvLockUntil: 0 });
        });
      }
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
        tx.update(ref, { tv: profile, updatedAt: new Date().toISOString() });
      });
      return NextResponse.json({ ok: true, profile });
    }
    // Resolve channel from YouTube instead of trusting a client-supplied channel ID.
    const [video] = await getVideos(youtubeForUser(user), [body.videoId]);
    if (!video?.snippet?.channelId) throw new Error("Video is unavailable; could not record feedback.");
    const channelId = video.snippet.channelId;
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const feedback = { ...(snap.data()?.tvFeedback ?? {}), [body.videoId]: {
        action: body.feedback, channelId, at: new Date().toISOString()
      } };
      if (Object.keys(feedback).length > 300) throw new Error("Feedback limit reached. Export or clear older feedback before adding more.");
      tx.update(ref, { tvFeedback: feedback });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid TV settings or action." : error instanceof Error ? error.message : "TV request failed." }, { status: 400 });
  }
}

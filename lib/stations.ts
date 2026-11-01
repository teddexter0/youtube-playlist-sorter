import type { UserSettings } from "./config";
import crypto from "crypto";
import { adminDb } from "./firebase";
import { validatePlaylist, youtubeForUser, getYouTubeAccountTaste } from "./google";
import { tvProfileSchema } from "./tv-profile";
import { runTvForUser, tvProfileHash } from "./tv";
import { dueStations, stationNames, type StationKey } from "./station-rules";
import { stationProfiles } from "./station-presets";
export async function enableStations(user: UserSettings, enabled: boolean) {
  if (enabled && !user.tv?.interests.length) {
    const taste = await getYouTubeAccountTaste(youtubeForUser(user));
    user = { ...user, tv: tvProfileSchema.parse({ ...user.tv, interests: taste.interests }) };
  }
  const profiles = stationProfiles(user);
  if (!profiles.tv.interests.length) profiles.tv.interests = ["new official movie trailers", "technology innovation", "nature wildlife", "comedy sketches"];
  const tv = { ...profiles.tv, liveEnabled: enabled };
  await adminDb().collection("users").doc(user.userId).update({ stationProfiles: { ...profiles, ...user.stationProfiles, tv }, tv, tvPreviewHash: tvProfileHash(tv), stationAutopilot: enabled });
  return tv;
}
async function ensurePlaylist(user: UserSettings, key: StationKey) {
  const profile = tvProfileSchema.parse(key === "tv" ? user.tv : user.stationProfiles?.[key]);
  const yt = youtubeForUser(user);
  let valid = false;
  if (profile.playlistId) {
    try {
      const saved = await validatePlaylist(yt, profile.playlistId);
      if (saved) {
        const own = await yt.channels.list({ part: ["id"], mine: true });
        if (!own.data.items?.some(c => c.id === saved.snippet?.channelId)) throw new Error("Station playlist belongs to another account.");
        valid = true;
      }
    } catch (error) { if ((error as { code?: number }).code !== 404 && (error as { response?: { status?: number } }).response?.status !== 404) throw error; }
  }
  if (!valid) {
    const own = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50 });
    const same = own.data.items?.find(p => p.snippet?.title?.toLowerCase() === stationNames[key].toLowerCase());
    profile.playlistId = same?.id ?? (await yt.playlists.insert({ part: ["snippet", "status"], requestBody: { snippet: { title: stationNames[key], description: "Your personal station. Shorter videos first." }, status: { privacyStatus: "private" } } })).data.id ?? "";
    if (!profile.playlistId) throw new Error("YouTube did not return a station playlist.");
    const patch = key === "tv" ? { tv: profile, "playlistIds.tv": profile.playlistId, tvPreviewHash: tvProfileHash(profile) } : { [`stationProfiles.${key}`]: profile };
    await adminDb().collection("users").doc(user.userId).update(patch);
  }
  return profile;
}
export async function runStations(user: UserSettings, slot: "evening" | "morning", now = new Date()) {
  const ref = adminDb().collection("users").doc(user.userId);
  const summaries: { station: StationKey; added?: number; error?: string }[] = [];
  const keys = user.stationAutopilot ? dueStations(slot, now) : slot === "evening" && user.tv?.liveEnabled ? ["tv" as const] : [];
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  for (const key of keys) {
    const claim = ref.collection("stationRuns").doc(`${date.replaceAll("/", "-")}--${slot}--${key}`);
    const lease = crypto.randomUUID();
    let claimed = false;
    await adminDb().runTransaction(async tx => {
      const prior = (await tx.get(claim)).data();
      if (prior?.complete || prior?.until > Date.now()) return;
      tx.set(claim, { lease, until: Date.now() + 10 * 60000 });
      claimed = true;
    });
    if (!claimed) continue;
    try {
      const profile = await ensurePlaylist(user, key);
      const result = await runTvForUser({ ...user, tv: profile }, "live", { manual: true, stationKey: key, cycleId: claim.id });
      await claim.set({ complete: true, added: result.videos.length, warnings: result.warnings, at: new Date().toISOString() });
      summaries.push({ station: key, added: result.videos.length });
    } catch (error) {
      await claim.set({ complete: false, until: 0, at: new Date().toISOString() });
      summaries.push({ station: key, error: error instanceof Error ? error.message : "Station build failed." });
    }
  }
  return summaries;
}

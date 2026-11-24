import type { UserSettings } from "./config";
import crypto from "crypto";
import { adminDb } from "./firebase";
import { findOwnedStationPlaylist, youtubeForUser, getYouTubeAccountTaste } from "./google";
import { defaultSessionMinutes, tvProfileSchema } from "./tv-profile";
import { runTvForUser, tvProfileHash } from "./tv";
import { activeStationKeys, dueStations, stationNames, type StationKey } from "./station-rules";
import { stationProfiles } from "./station-presets";
import { tvErrorDetails } from "./tv-error";
import { envValue } from "./runtime-config";
import { usTvNetworks } from "./tv-network-sources";
import { channelSourceKey } from "./channel-sources";
const nairobiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" });
const nairobiHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", hourCycle: "h23" });
const dayMs = 86400000;
const morningStations = new Set<StationKey>(["childhood", "popculture", "lifeskills"]);

export function hasDailyPersonalStations(user: UserSettings) {
  const owner = envValue("PERSONAL_STATION_EMAIL");
  return Boolean(owner && user.email === owner);
}

export async function upgradePersonalLineup(user: UserSettings) {
  if (!hasDailyPersonalStations(user) || user.tvLineupAppendStations || !user.tv) return user;
  const ref = adminDb().collection("users").doc(user.userId);
  return adminDb().runTransaction(async tx => {
    const saved = (await tx.get(ref)).data() as UserSettings & { tvLockUntil?: number };
    if (!saved?.tv || saved.tvLineupAppendStations || !hasDailyPersonalStations(saved)) return saved ?? user;
    if ((saved.tvLockUntil ?? 0) > Date.now()) throw new Error("A playlist update is already running. The TV changes will apply on the next run.");
    const handles = new Map([...usTvNetworks.map(source => source.handle), ...saved.tv.studioHandles].map(handle => [channelSourceKey(handle), handle]));
    const tv = tvProfileSchema.parse({ ...saved.tv, sessionMinutes: defaultSessionMinutes, strictComfort: true, lightViewing: true, sharedTv: true,
      excludeHorror: true, mandatoryDaily: true, studioHandles: [...handles.values()].slice(0, 40) });
    const enabled = activeStationKeys(saved);
    const stationProfiles = { ...saved.stationProfiles, tv };
    for (const key of enabled) {
      if (key !== "tv" && stationProfiles[key]) stationProfiles[key] = { ...stationProfiles[key]!, sessionMinutes: defaultSessionMinutes };
    }
    const patch = { tv, tvPreviewHash: tvProfileHash(tv), stationProfiles, tvLineupAppendStations: enabled };
    tx.update(ref, patch);
    return { ...saved, ...patch };
  });
}

function lastWeeklySlot(slot: "evening" | "morning", now: Date) {
  const cutoff = slot === "evening" ? 19 : 9;
  const mostRecentDay = now.getTime() - (Number(nairobiHour.format(now)) < cutoff ? dayMs : 0);
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(mostRecentDay - offset * dayMs);
    const keys = dueStations(slot, date).filter(key => key !== "tv");
    if (keys.length) return { date, keys };
  }
  return { date: now, keys: [] };
}
export async function enableStations(user: UserSettings, enabled: boolean) {
  if (enabled && !user.tv?.interests.length) {
    const taste = await getYouTubeAccountTaste(youtubeForUser(user));
    user = { ...user, tv: tvProfileSchema.parse({ ...user.tv, interests: taste.interests }) };
  }
  const profiles = stationProfiles(user);
  if (!profiles.tv.interests.length) throw new Error("Add what you enjoy watching, or import your YouTube taste, before enabling automatic playlists.");
  const tv = { ...profiles.tv, liveEnabled: enabled };
  await adminDb().collection("users").doc(user.userId).update({ stationProfiles: { ...profiles, ...user.stationProfiles, tv }, tv, tvPreviewHash: tvProfileHash(tv), stationAutopilot: enabled });
  return tv;
}
async function ensurePlaylist(user: UserSettings, key: StationKey) {
  const profile = tvProfileSchema.parse(key === "tv" ? user.tv : user.stationProfiles?.[key]);
  const yt = youtubeForUser(user);
  if (!await findOwnedStationPlaylist(yt, profile.playlistId)) {
    const own = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50 });
    const title = profile.displayName || stationNames[key];
    const same = own.data.items?.find(p => p.snippet?.title?.toLowerCase() === title.toLowerCase());
    const reusable = same?.id ? await findOwnedStationPlaylist(yt, same.id) : null;
    profile.playlistId = reusable?.id ?? (await yt.playlists.insert({ part: ["snippet", "status"], requestBody: { snippet: { title, description: "Your personal station. Shorter videos first." }, status: { privacyStatus: "private" } } })).data.id ?? "";
    if (!profile.playlistId) throw new Error("YouTube did not return a station playlist.");
    const patch = key === "tv" ? { tv: profile, "playlistIds.tv": profile.playlistId, "stationProfiles.tv": profile, tvPreviewHash: tvProfileHash(profile) } : { [`stationProfiles.${key}`]: profile };
    await adminDb().collection("users").doc(user.userId).update(patch);
  }
  return profile;
}
export async function runStations(user: UserSettings, slot: "evening" | "morning", now = new Date(), options: { trigger?: "scheduled" | "kickoff"; onlyTv?: boolean; lineupUpgrade?: boolean } = {}) {
  if (user.storageMigrating) return [];
  user = await upgradePersonalLineup(user);
  const ref = adminDb().collection("users").doc(user.userId);
  const summaries: { station: StationKey; added?: number; held?: boolean; warnings?: string[]; error?: string; code?: string; appended?: Awaited<ReturnType<typeof runTvForUser>>["appended"] }[] = [];
  const enabled = activeStationKeys(user);
  const trigger = options.trigger ?? "scheduled";
  const personalDaily = hasDailyPersonalStations(user);
  const dailyKeys = enabled.filter(key => key === "tv" ? user.stationAutopilot || user.tv?.liveEnabled : !options.onlyTv && user.stationAutopilot && key.startsWith("custom"));
  const jobs: { key: StationKey; date: Date; slot: "evening" | "morning"; daily: boolean }[] =
    slot === "evening" ? dailyKeys.map(key => ({ key, date: now, slot, daily: true })) : [];
  if (user.stationAutopilot && !options.onlyTv && personalDaily) {
    for (const key of enabled) {
      if (morningStations.has(key) && (slot === "morning" || trigger === "kickoff")) {
        jobs.push({ key, date: now, slot: "morning", daily: true });
      }
      if (key === "faith" && slot === "evening") jobs.push({ key, date: now, slot, daily: true });
    }
  } else if (user.stationAutopilot && !options.onlyTv) {
    const weeklySlots = slot === "evening" ? (["evening", "morning"] as const) : (["morning"] as const);
    for (const weeklySlot of weeklySlots) {
      const { date, keys } = lastWeeklySlot(weeklySlot, now);
      jobs.push(...keys.filter(key => enabled.includes(key)).map(key => ({ key, date, slot: weeklySlot, daily: false })));
    }
  }
  for (const job of jobs) {
    const { key, date } = job;
    const dateKey = nairobiDate.format(date).replaceAll("/", "-");
    const normalClaim = ref.collection("stationRuns").doc(`${dateKey}--${job.slot}--${key}`);
    const upgrade = ref.collection("stationRuns").doc(`tv-lineup-v1--${key}`);
    const eligibleForUpgrade = user.tvLineupAppendStations?.includes(key);
    const priorUpgrade = eligibleForUpgrade ? (await upgrade.get()).data() : undefined;
    if (options.lineupUpgrade && (!eligibleForUpgrade || priorUpgrade?.complete)) continue;
    if (priorUpgrade?.complete && priorUpgrade.dateKey === dateKey) continue;
    const appendUpgrade = eligibleForUpgrade && !priorUpgrade?.complete;
    const suffix = job.daily && trigger === "kickoff" && !personalDaily ? `--kickoff--${options.onlyTv ? "requested" : process.env.VERCEL_DEPLOYMENT_ID ?? "current"}` : "";
    const claim = appendUpgrade ? upgrade : suffix ? ref.collection("stationRuns").doc(normalClaim.id + suffix) : normalClaim;
    const lease = crypto.randomUUID();
    const claimed = await adminDb().runTransaction(async tx => {
      const prior = (await tx.get(claim)).data();
      if ((prior?.complete && !((personalDaily || trigger === "kickoff") && prior.held)) || prior?.until > Date.now()) return false;
      tx.set(claim, { lease, station: key, trigger, at: new Date().toISOString(), until: Date.now() + 10 * 60000 }, { merge: Boolean(appendUpgrade) });
      return true;
    });
    if (!claimed) continue;
    try {
      const profile = appendUpgrade ? tvProfileSchema.parse(key === "tv" ? user.tv : user.stationProfiles?.[key]) : await ensurePlaylist(user, key);
      if (appendUpgrade && !profile.playlistId) throw new Error("Connect the station's existing playlist before adding a lineup.");
      const result = await runTvForUser({ ...user, tv: profile }, "live", { manual: true, stationKey: key, cycleId: claim.id, forceRefresh: personalDaily, appendCycleId: appendUpgrade ? claim.id : undefined });
      const held = result.warnings.some(warning => warning.startsWith("Keeping your TV queue"));
      const completed = { complete: true, station: key, trigger, held, added: result.appended?.count ?? result.videos.length, warnings: result.warnings, at: new Date().toISOString(), ...(result.appended ? { appended: result.appended } : {}) };
      if (appendUpgrade) {
        await claim.set({ ...completed, dateKey });
        if (!(await normalClaim.get()).exists) await normalClaim.set(completed);
      } else await claim.set(completed);
      await ref.collection("logs").add({ userId: user.userId, level: "info", message: `${trigger === "kickoff" ? "Started" : "Scheduled"} ${profile.displayName || stationNames[key]} hunt: ${held ? "queue held by the watch and age checks" : `${result.videos.length} selections`}`, data: { station: key, trigger, held, warnings: result.warnings }, createdAt: new Date().toISOString() });
      summaries.push({ station: key, added: completed.added, held, warnings: result.warnings, appended: result.appended });
    } catch (error) {
      const { error: message, code } = tvErrorDetails(error);
      await claim.set({ complete: false, station: key, trigger, error: message, until: 0, at: new Date().toISOString() }, { merge: Boolean(appendUpgrade) });
      await ref.collection("logs").add({ userId: user.userId, level: "error", message: `Automatic ${stationNames[key]} hunt failed: ${message}`, createdAt: new Date().toISOString() });
      summaries.push({ station: key, error: message, code });
    }
  }
  return summaries;
}

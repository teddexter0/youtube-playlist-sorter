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
// A full daily replacement spends two 50-unit writes per item. Leave room for discovery and verification.
const personalQueueLimits: Record<StationKey, number> = { tv: 44, faith: 9, childhood: 9, popculture: 14, lifeskills: 18, custom1: 14, custom2: 14, custom3: 14 };

export function hasDailyPersonalStations(user: UserSettings) {
  const owner = envValue("PERSONAL_STATION_EMAIL");
  return Boolean(owner && user.email === owner);
}

async function raisePersonalLineupDuration(user: UserSettings) {
  if (!hasDailyPersonalStations(user) || user.personalLineupDurationRaised) return user;
  const ref = adminDb().collection("users").doc(user.userId);
  return adminDb().runTransaction(async tx => {
    const saved = (await tx.get(ref)).data() as UserSettings & { tvLockUntil?: number };
    if (!saved || saved.personalLineupDurationRaised || !hasDailyPersonalStations(saved)) return saved ?? user;
    if ((saved.tvLockUntil ?? 0) > Date.now()) throw new Error("A playlist update is already running. The new duration will apply on the next run.");
    const profiles = { ...saved.stationProfiles };
    const raise = (profile?: UserSettings["tv"]) => tvProfileSchema.parse({
      ...profile, sessionMinutes: Math.min(720, (profile?.sessionMinutes ?? defaultSessionMinutes) + 180)
    });
    const tv = raise(saved.tv);
    profiles.tv = tv;
    for (const key of activeStationKeys(saved)) {
      if (key !== "tv") profiles[key] = raise(profiles[key]);
    }
    const patch = { tv, tvPreviewHash: tvProfileHash(tv), stationProfiles: profiles, personalLineupDurationRaised: true };
    tx.update(ref, patch);
    return { ...saved, ...patch };
  });
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
  const saved = key === "tv" ? user.tv : user.stationProfiles?.[key];
  const stationMode = key.startsWith("custom") ? "tv" : key;
  const legacyPlaylist = key === "tv" ? user.playlistIds.tv : key === "faith" ? user.playlistIds.newNj : "";
  const profile = tvProfileSchema.parse({ ...saved, stationMode, playlistId: saved?.playlistId || legacyPlaylist || "" });
  const yt = youtubeForUser(user);
  if (!await findOwnedStationPlaylist(yt, profile.playlistId)) {
    const title = profile.displayName || stationNames[key];
    let same;
    let pageToken: string | undefined;
    do {
      const own = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
      same = own.data.items?.find(p => p.snippet?.title?.toLowerCase() === title.toLowerCase());
      pageToken = own.data.nextPageToken ?? undefined;
    } while (!same && pageToken);
    const reusable = same?.id ? await findOwnedStationPlaylist(yt, same.id) : null;
    profile.playlistId = reusable?.id ?? (await yt.playlists.insert({ part: ["snippet", "status"], requestBody: { snippet: { title, description: "Your personal station. Shorter videos first." }, status: { privacyStatus: "private" } } })).data.id ?? "";
    if (!profile.playlistId) throw new Error("YouTube did not return a station playlist.");
  }
  if (saved?.playlistId !== profile.playlistId || saved.stationMode !== profile.stationMode) {
    const patch = key === "tv" ? { tv: profile, "playlistIds.tv": profile.playlistId, "stationProfiles.tv": profile, tvPreviewHash: tvProfileHash(profile) } : { [`stationProfiles.${key}`]: profile };
    await adminDb().collection("users").doc(user.userId).update(patch);
  }
  return profile;
}
export async function runStations(user: UserSettings, slot: "evening" | "morning", now = new Date(), options: { trigger?: "scheduled" | "kickoff"; onlyTv?: boolean; replaceToday?: boolean; lineupUpgrade?: boolean; lineupRetry?: true | "popculture" } = {}) {
  if (user.storageMigrating) return [];
  const legacyAppend = options.lineupUpgrade || options.lineupRetry;
  user = legacyAppend ? await upgradePersonalLineup(user) : await raisePersonalLineupDuration(user);
  const ref = adminDb().collection("users").doc(user.userId);
  const summaries: { station: StationKey; added?: number; held?: boolean; warnings?: string[]; error?: string; code?: string; replacement?: Awaited<ReturnType<typeof runTvForUser>>["replacement"]; appended?: Awaited<ReturnType<typeof runTvForUser>>["appended"] }[] = [];
  const enabled = activeStationKeys(user);
  const trigger = options.trigger ?? "scheduled";
  const personalDaily = hasDailyPersonalStations(user);
  const dailyKeys = enabled.filter(key => key === "tv" ? user.stationAutopilot || user.tv?.liveEnabled : !options.onlyTv && user.stationAutopilot && key.startsWith("custom"));
  const jobs: { key: StationKey; date: Date; slot: "evening" | "morning"; daily: boolean }[] =
    slot === "evening" ? dailyKeys.map(key => ({ key, date: now, slot, daily: true })) : [];
  if (user.stationAutopilot && !options.onlyTv && personalDaily) {
    for (const key of enabled) {
      if (morningStations.has(key)) {
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
    const replacementClaim = ref.collection("stationRuns").doc(normalClaim.id + "--replacement");
    const upgrade = ref.collection("stationRuns").doc(`tv-lineup-v1--${key}`);
    const eligibleForUpgrade = legacyAppend && user.tvLineupAppendStations?.includes(key);
    const priorUpgrade = eligibleForUpgrade ? (await upgrade.get()).data() : undefined;
    const popCultureFill = options.lineupRetry === "popculture";
    if (popCultureFill && key !== "popculture") continue;
    const previousRetry = popCultureFill ? (await ref.collection("stationRuns").doc(upgrade.id + "--retry").get()).data() : undefined;
    const priorAppendSeconds = Number(priorUpgrade?.appended?.seconds ?? 0) + Number(previousRetry?.appended?.seconds ?? 0);
    const retry = options.lineupRetry && morningStations.has(key) && priorUpgrade?.complete && priorUpgrade.dateKey === dateKey &&
      (!popCultureFill || (previousRetry?.complete && previousRetry.dateKey === dateKey)) && priorAppendSeconds < 100 * 60;
    if (options.lineupRetry && !retry) continue;
    if (options.lineupUpgrade && (!eligibleForUpgrade || priorUpgrade?.complete)) continue;
    if (!retry && priorUpgrade?.complete && priorUpgrade.dateKey === dateKey) continue;
    const appendUpgrade = retry || (eligibleForUpgrade && !priorUpgrade?.complete);
    const suffix = job.daily && trigger === "kickoff" && !personalDaily ? `--kickoff--${options.onlyTv ? "requested" : process.env.VERCEL_DEPLOYMENT_ID ?? "current"}` : "";
    const claim = options.replaceToday ? replacementClaim : retry ? ref.collection("stationRuns").doc(upgrade.id + (popCultureFill ? "--popculture-fill" : "--retry")) : appendUpgrade ? upgrade : suffix ? ref.collection("stationRuns").doc(normalClaim.id + suffix) : normalClaim;
    const lease = crypto.randomUUID();
    const claimed = await adminDb().runTransaction(async tx => {
      const prior = (await tx.get(claim)).data();
      if (!options.replaceToday && !legacyAppend) {
        const replacement = (await tx.get(replacementClaim)).data();
        if (replacement?.complete || replacement?.until > Date.now()) return false;
      }
      if ((prior?.complete && !((personalDaily || trigger === "kickoff") && prior.held)) || prior?.until > Date.now()) return false;
      tx.set(claim, { lease, station: key, trigger, at: new Date().toISOString(), until: Date.now() + 10 * 60000 }, { merge: Boolean(appendUpgrade) });
      return true;
    });
    if (!claimed) continue;
    try {
      const profile = appendUpgrade ? tvProfileSchema.parse(key === "tv" ? user.tv : user.stationProfiles?.[key]) : await ensurePlaylist(user, key);
      if (appendUpgrade && !profile.playlistId) throw new Error("Connect the station's existing playlist before adding a lineup.");
      const result = await runTvForUser({ ...user, tv: profile }, "live", { manual: true, stationKey: key, cycleId: claim.id, forceRefresh: personalDaily || options.replaceToday, maxItems: personalDaily && !appendUpgrade ? personalQueueLimits[key] : undefined, appendCycleId: appendUpgrade ? claim.id : undefined, previousAppendSeconds: retry ? priorAppendSeconds : undefined });
      const held = result.warnings.some(warning => warning.startsWith("Keeping your TV queue"));
      if (!held && !result.replacement && !result.appended && !result.videos.length) throw new Error(result.warnings.at(-1) ?? "No suitable picks were found.");
      const completed = { complete: true, station: key, trigger, held, added: result.replacement?.count ?? result.appended?.count ?? result.videos.length, warnings: result.warnings, at: new Date().toISOString(), ...(result.appended ? { appended: result.appended } : {}), ...(result.replacement ? { replacement: result.replacement } : {}) };
      if (appendUpgrade) {
        await claim.set({ ...completed, dateKey });
        if (!(await normalClaim.get()).exists) await normalClaim.set(completed);
      } else await claim.set(completed);
      await ref.collection("logs").add({ userId: user.userId, level: "info", message: `${trigger === "kickoff" ? "Started" : "Scheduled"} ${profile.displayName || stationNames[key]} hunt: ${held ? "queue held by the watch and age checks" : `${completed.added} selections`}`, data: { station: key, trigger, held, warnings: result.warnings }, createdAt: new Date().toISOString() });
      summaries.push({ station: key, added: completed.added, held, warnings: result.warnings, appended: result.appended, replacement: result.replacement });
    } catch (error) {
      const { error: message, code } = tvErrorDetails(error);
      await claim.set({ complete: false, station: key, trigger, error: message, code, until: 0, at: new Date().toISOString() }, { merge: Boolean(appendUpgrade) });
      await ref.collection("logs").add({ userId: user.userId, level: "error", message: `Automatic ${stationNames[key]} hunt failed: ${message}`, createdAt: new Date().toISOString() });
      summaries.push({ station: key, error: message, code });
    }
  }
  return summaries;
}

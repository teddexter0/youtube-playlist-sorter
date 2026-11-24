import type { TvCandidate, TvProfile } from "./tv-profile";
import { isNostalgiaVideo } from "./childhood";
export const stationNames = { tv: "TV", childhood: "New Childhood Recaps", faith: "NEW NJ", popculture: "NEW POP CULTURE", lifeskills: "New life skills", custom1: "My channel 2", custom2: "My channel 3", custom3: "My channel 4" } as const;
const faithTopics = /\b(sermons?|bible|biblical|jesus|christian|gospel|scripture|prayer|church|worship|theology|devotionals?|testimon(?:y|ies))\b/i;
const lifeSkillsTopics = /\b(life skills|first aid|cpr|swimming|water safety|survival|nutrition|cookery|cooking|meal prep|etiquette|insurance|grooming|hygiene|skin care|skincare|therapy|sleep|hormones?|bone health|bone growth|practical philosophy|life advice)\b/i;
const popCultureTopics = /\b(celebrity|celebrities|pop culture|entertainment news|red carpet|met gala|fashion|awards|oscars?|emmys?|grammys?|golden globes?|movie cast)\b/i;
export type StationKey = keyof typeof stationNames;
export function activeStationKeys(user: import("./config").UserSettings): StationKey[] {
  if (user.enabledStations) return [...new Set(user.enabledStations)];
  // Existing playlists stay visible. New accounts inherit no personal station bundle.
  return ["tv", ...(Object.keys(stationNames) as StationKey[]).filter(key => key !== "tv" && Boolean(user.stationProfiles?.[key]?.playlistId))];
}
export function routeForVideo(v: TvCandidate): StationKey {
  const text = `${v.title} ${v.channelTitle}`;
  if (faithTopics.test(text)) return "faith";
  if (/\b(disney channel|hannah montana|suite life|good luck charlie|wizards of waverly|victorious|icarly|childhood recap|childhood show|ben 10|generator rex|ultimate spider.man)\b/i.test(text)) return "childhood";
  if (/\b(celebrity news|entertainment news|pop culture|celebrity gossip|celebrity drama)\b/i.test(text)) return "popculture";
  if (!/\b(snl|sketch|movie|film|game|celebrity|tonight show|cooking show)\b/i.test(text) &&
    lifeSkillsTopics.test(text) && (/\b(first aid|cpr|life skills|etiquette|insurance|hygiene|skincare|skin care|therapy|bone health|bone growth|practical philosophy|life advice)\b/i.test(text) ||
    /\b(how to|guide|tutorial|explained|tips|technique|demonstration|practical|mistakes|training)\b/i.test(text))) return "lifeskills";
  return "tv";
}
export function fitsStation(v: TvCandidate, p: TvProfile) {
  if (p.stationMode === "childhood") return isNostalgiaVideo(v, p.franchises);
  const target = routeForVideo(v);
  const metadata = `${v.title} ${v.channelTitle} ${v.description.slice(0, 300)}`;
  if (p.stationMode === "faith") return Boolean(v.subscribed) && faithTopics.test(metadata);
  if (p.stationMode === "popculture") return popCultureTopics.test(metadata) && !["faith", "childhood"].includes(target);
  if (p.stationMode === "lifeskills") return target === "lifeskills" ||
    (target === "tv" && lifeSkillsTopics.test(metadata) && /\b(how to|guide|tutorial|explained|tips|technique|demonstration|practical|mistakes|training)\b/i.test(v.title));
  return target === p.stationMode || (target === "childhood" && (v.officialTrailer || v.officialNetwork));
}
export function dueStations(slot: "evening" | "morning", date = new Date()): StationKey[] {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Nairobi", weekday: "short" }).format(date);
  return slot === "morning" ? day === "Sat" ? ["childhood", "popculture", "lifeskills"] : [] : ["tv", ...(day === "Fri" ? ["faith" as const] : [])];
}
export function sortedVideoOrder<T extends { durationSeconds: number }>(videos: T[]) { return [...videos].sort((a, b) => a.durationSeconds - b.durationSeconds); }

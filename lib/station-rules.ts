import type { TvCandidate, TvProfile } from "./tv-profile";
export const stationNames = { tv: "TV", childhood: "New Childhood Recaps", faith: "NEW NJ", popculture: "NEW POP CULTURE", lifeskills: "New life skills" } as const;
export type StationKey = keyof typeof stationNames;
export function routeForVideo(v: TvCandidate): StationKey {
  const text = `${v.title} ${v.channelTitle}`;
  if (/\b(sermon|bible|jesus|christian|gospel|scripture|prayer|church|worship|theology|devotional)\b/i.test(text)) return "faith";
  if (/\b(disney channel|hannah montana|suite life|good luck charlie|wizards of waverly|victorious|icarly|childhood recap|childhood show|ben 10|generator rex|ultimate spider.man)\b/i.test(text)) return "childhood";
  if (!/\b(snl|sketch|movie|film|game|celebrity|tonight show)\b/i.test(text) && /\b(life skills|first aid|cpr|swimming|survival|nutrition|cookery|etiquette|insurance|grooming|hygiene|skin care|skincare|therapy|sleep|hormones|bone growth|practical philosophy|life advice)\b/i.test(text)) return "lifeskills";
  if (/\b(celebrity news|pop culture|celebrity gossip|celebrity drama)\b/i.test(text)) return "popculture";
  return "tv";
}
export function fitsStation(v: TvCandidate, p: TvProfile) {
  const target = routeForVideo(v);
  if (p.stationMode === "faith") return target === "faith" && Boolean(v.subscribed);
  if (p.stationMode === "popculture") return target === "popculture" || /\b(celebrity|red carpet|met gala|fashion|awards|interview|pop culture)\b/i.test(`${v.title} ${v.channelTitle} ${v.topic}`);
  return target === p.stationMode;
}
export function dueStations(slot: "evening" | "morning", date = new Date()): StationKey[] {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Nairobi", weekday: "short" }).format(date);
  return slot === "morning" ? day === "Sat" ? ["popculture", "lifeskills"] : [] : ["tv", "childhood", ...(day === "Fri" ? ["faith" as const] : [])];
}
export function sortedVideoOrder<T extends { durationSeconds: number }>(videos: T[]) { return [...videos].sort((a, b) => a.durationSeconds - b.durationSeconds); }

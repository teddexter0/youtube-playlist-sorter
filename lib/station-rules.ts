import type { TvCandidate, TvProfile } from "./tv-profile";
import { isNostalgiaVideo } from "./childhood";
import { channelSourceKey, lifeSkillsPublishers, popCulturePublishers } from "./channel-sources";
export const stationNames = { tv: "TV", childhood: "New Childhood Recaps", faith: "NEW NJ", popculture: "NEW POP CULTURE", lifeskills: "New life skills", custom1: "My channel 2", custom2: "My channel 3", custom3: "My channel 4" } as const;
const faithTopics = /\b(sermons?|bible|biblical|jesus|christian|gospel|scripture|prayer|church|worship|theology|devotionals?|testimon(?:y|ies))\b/i;
const practicalTopics = {
  sleep: /\b(sleep(?:ing)?|circadian|insomnia|melatonin|dreaming|jet lag|naps?)\b/i,
  safety: /\b(first aid|cpr|swimming|water safety|survival|emergency kit|preparedness|choking|aed|wound care|severe bleeding|fire safety)\b/i,
  health: /\b(nutrition|hormones?|bone health|bone growth|exercise|muscles?|hydration|caffeine|skin care|skincare|hygiene|immune system)\b/i,
  kitchen: /\b(food safety|cookery|cooking|meal prep|food storage|kitchen science)\b/i,
  learning: /\b(study skills|studying|memory|learning|focus|attention|procrastination|habit formation|spaced repetition|decision.making|cognitive bias)\b/i,
  daily: /\b(life skills|life hacks?|etiquette|budgeting|insurance|grooming|cleaning|household|laundry|tool safety|diy repairs?)\b/i,
};
const evidenceFormat = /\b(science|evidence|research|experiment|biology|neuroscience|how (?:to|does|do|your|we)|why|guide|tutorial|explained|what happens|tips|technique|demonstration|practical|training|basics|checklist)\b/i;
const lifeSkillsBlocked = /\b(therapy|therapist|psychotherapy|counsel(?:l)?ing|trauma healing|yoga|ayurveda|chakras?|reiki|spiritual(?:ity)?|religion|religious|sermons?|prayers?|scripture|bible|quran|worship|faith healing|manifest(?:ing|ation|ed|s)?|law of attraction|law of assumption|affirmations?|subliminals?|astrology|horoscopes?|energy healing|robert greene|48 laws of power|miracle cure|detox cure)\b/i;
const generalScience = /\b(science|biology|physics|chemistry|neuroscience|anatomy|human body|brain|experiments?|scientists?|what happens|how (?:it|your|the .+?) works)\b/i;
const popCultureTopics = /\b(celebrity|celebrities|pop culture|entertainment news|red carpet|met gala|fashion|awards|oscars?|emmys?|grammys?|golden globes?|movie cast|cast interview|cast reunion|actors? roundtables?)\b/i;
export type StationKey = keyof typeof stationNames;
const stationPublishers = {
  popculture: new Set<string>(popCulturePublishers.map(channelSourceKey)),
  lifeskills: new Set<string>(lifeSkillsPublishers.map(channelSourceKey))
};
export function isStationPublisher(mode: TvProfile["stationMode"], channelId: string) {
  return (mode === "popculture" || mode === "lifeskills") && stationPublishers[mode].has(channelId);
}
export function lifeSkillsTopic(video: TvCandidate) {
  const title = Object.entries(practicalTopics).find(([, pattern]) => pattern.test(video.title));
  if (title) return title[0];
  if (generalScience.test(video.title)) return "science";
  return Object.entries(practicalTopics).find(([, pattern]) => pattern.test(video.description.slice(0, 300)))?.[0] ?? "science";
}

function fitsLifeSkills(video: TvCandidate) {
  const headline = `${video.title} ${video.channelTitle}`;
  const synopsis = video.description.trim().split(/\n\s*\n|\b(?:subscribe|we offer online|check out our)\b/i)[0].slice(0, 450);
  const metadata = `${headline} ${synopsis}`;
  if (faithTopics.test(headline) || lifeSkillsBlocked.test(metadata)) return false;
  if (video.audioLanguage && !/^en(?:[-_]|$)/i.test(video.audioLanguage)) return false;
  const publisher = isStationPublisher("lifeskills", video.channelId) || lifeSkillsPublishers.some(handle =>
    handle.toLowerCase().replace(/(?:tv|official)$/, "") === video.channelTitle.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const practical = Object.values(practicalTopics).some(pattern => pattern.test(video.title));
  const topic = lifeSkillsTopic(video);
  if (practical && (publisher || evidenceFormat.test(video.title) || topic === "safety")) return true;
  return publisher && generalScience.test(video.title) && !/\b(quiz|riddles?|trivia test|personality test)\b/i.test(video.title);
}
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
    (/\b(first aid|cpr|therapy|skincare)\b/i.test(text) ||
      (Object.values(practicalTopics).some(pattern => pattern.test(text)) && evidenceFormat.test(v.title)))) return "lifeskills";
  return "tv";
}
export function fitsStation(v: TvCandidate, p: TvProfile) {
  if (p.stationMode === "childhood") return isNostalgiaVideo(v, p.franchises);
  const target = routeForVideo(v);
  const metadata = `${v.title} ${v.channelTitle} ${v.description.slice(0, 300)}`;
  if (p.stationMode === "faith") return Boolean(v.subscribed) && (faithTopics.test(metadata) || Boolean(v.faithPublisher && /\b(message|teaching|service|devotion|homily|pastor|parable|discipleship|faith|god)\b/i.test(v.title)));
  if (p.stationMode === "popculture") return (isStationPublisher(p.stationMode, v.channelId) || popCultureTopics.test(metadata)) && !["faith", "childhood"].includes(target);
  if (p.stationMode === "lifeskills") return fitsLifeSkills(v);
  return target === p.stationMode || (target === "childhood" && (v.officialTrailer || v.officialNetwork));
}
export function dueStations(slot: "evening" | "morning", date = new Date()): StationKey[] {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Nairobi", weekday: "short" }).format(date);
  return slot === "morning" ? day === "Sat" ? ["childhood", "popculture", "lifeskills"] : [] : ["tv", ...(day === "Fri" ? ["faith" as const] : [])];
}
export function sortedVideoOrder<T extends { durationSeconds: number }>(videos: T[]) { return [...videos].sort((a, b) => a.durationSeconds - b.durationSeconds); }

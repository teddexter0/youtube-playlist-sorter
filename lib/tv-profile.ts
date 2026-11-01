import { z } from "zod";

export const tvProfileSchema = z.object({
  playlistId: z.string().max(200).default(""),
  interests: z.array(z.string().trim().min(2).max(100)).max(12).default([]),
  seedPlaylistIds: z.array(z.string().max(200)).max(3).default([]),
  avoid: z.array(z.string().trim().min(2).max(100)).max(30).default([]),
  useSubscriptions: z.boolean().default(true),
  useYouTubeLikes: z.boolean().default(true),
  aiEnabled: z.boolean().default(false),
  sharedTv: z.boolean().default(true),
  lightViewing: z.boolean().default(true),
  maxPerTopic: z.number().int().min(1).max(4).default(4),
  discoveryPercent: z.number().int().min(0).max(60).default(25),
  footballFocus: z.enum(["all", "european-world-cup"]).default("all"),
  monthlyMotorsport: z.boolean().default(false),
  sessionMinutes: z.number().int().min(15).max(240).default(90),
  maxVideoMinutes: z.number().int().min(2).max(120).default(40),
  archivePercent: z.number().int().min(0).max(100).default(30),
  liveEnabled: z.boolean().default(false)
});
export type TvProfile = z.infer<typeof tvProfileSchema>;
export const defaultTvProfile = tvProfileSchema.parse({});

// Only loaded after the owner explicitly chooses this example in their own profile.
export const exampleInterests = [
  "European football match highlights", "FIFA World Cup highlights",
  "new technology inventions demonstrations", "travel destinations city walks",
  "movie practical effects behind the scenes", "story driven video game gameplay",
  "wildlife short documentaries", "live saxophone music performances",
  "Formula 1 monthly race recap", "Kenya local news technology headlines"
];

export const discoveryInterests = [
  "extraordinary wildlife short documentary", "incredible inventions demonstration",
  "beautiful cities travel short film", "movie practical effects behind the scenes",
  "street food cooking around the world", "live instrumental music performance",
  "space discoveries short documentary", "architecture extraordinary homes tour"
];

export const tvLanes = ["football", "motorsport", "technology", "news", "travel", "gaming", "film", "music", "nature", "food", "science", "other"] as const;
export type TvLane = (typeof tvLanes)[number];
export const laneLabels: Record<TvLane, string> = { football: "Match day", motorsport: "Fast lane", technology: "Tomorrow, today", news: "The short version", travel: "Somewhere else", gaming: "Press play", film: "Movie magic", music: "Good sounds", nature: "Wild world", food: "Good taste", science: "Little wonders", other: "A wild card" };

export type TvCandidate = {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  topic: string;
  durationSeconds: number;
  publishedAt: string;
  score: number;
  reason: string;
  category?: TvLane;
  discovery?: boolean;
};

const lanePatterns: [TvLane, RegExp][] = [
  ["motorsport", /\b(formula\s*(?:one|1)|f1|grand prix|motogp|nascar|race recap)\b/i],
  ["football", /\b(football|soccer|premier league|champions league|la liga|bundesliga|serie a|world cup|fifa|uefa|arsenal|chelsea|liverpool|barcelona|real madrid|manchester)\b/i],
  ["technology", /\b(technology|tech|invention|robot|robotics|artificial intelligence|\bAI\b|gadget|smartphone|innovation|computer)\b/i],
  ["news", /\b(news|headlines|citizen tv|ntv kenya|ktn news|breaking news)\b/i],
  ["gaming", /\b(gaming|video game|gameplay|playstation|xbox|nintendo|uncharted|hitman|minecraft)\b/i],
  ["film", /\b(movie|film|cinema|vfx|practical effects|behind.the.scenes|animation|cartoon)\b/i],
  ["music", /\b(music|concert|saxophone|piano|jazz|orchestra|instrumental|performance|song)\b/i],
  ["nature", /\b(wildlife|nature|ocean|animal|safari|bird|forest|underwater)\b/i],
  ["food", /\b(food|cooking|chef|recipe|cuisine|baking|street food)\b/i],
  ["travel", /\b(travel|destination|city walk|cities|architecture|tour|beach|mountain|journey)\b/i],
  ["science", /\b(science|space|astronomy|universe|physics|planet|discovery)\b/i]
];

export function categoryForVideo(video: TvCandidate): TvLane {
  if (video.category) return video.category;
  if (/\b(citizen tv|ntv kenya|ktn news)\b/i.test(video.channelTitle) || /\b(headlines|breaking news)\b/i.test(video.title)) return "news";
  for (const text of [video.title, video.topic, `${video.channelTitle} ${video.description.slice(0, 240)}`]) {
    const match = lanePatterns.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
  }
  return "other";
}

export function isArchive(video: TvCandidate, now = Date.now()) {
  return Date.parse(video.publishedAt) < now - 365 * 86400000;
}

// A conservative metadata screen; it cannot certify the contents of a video.
export function passesMetadataFilter(video: TvCandidate, profile: TvProfile, now = Date.now()) {
  const text = `${video.title} ${video.description} ${video.channelTitle}`.toLowerCase();
  if (profile.avoid.some((term) => text.includes(term.toLowerCase()))) return false;
  if (profile.sharedTv && /\b(porn|nude|nudity|nsfw|gore|racial slur|hate speech|sex tape|fuck|shit)\b/i.test(text)) return false;
  if (profile.lightViewing) {
    const format = `${video.title} ${video.channelTitle}`;
    if (/\b(podcast|lecture|lectures|philosophy|philosophical|existential|debate|dating advice|relationship advice|parenting advice|raising (?:kids|children)|red pill|manosphere|wild\s*['’]?[n&]['’]?\s*out|jordan (?:b\.? )?peterson|jbp|joe rogan|lex fridman|huberman lab|diary of a ceo|modern wisdom|fresh.?and.?fit|sex talk|body count)\b/i.test(format)) return false;
    if (/\b(dating|hook.?up|pick.?up|smash or pass|blind date|speed date|raunchy)\b/i.test(format)) return false;
    if (categoryForVideo(video) === "news" && video.durationSeconds > 8 * 60) return false;
    if (categoryForVideo(video) === "news" && Date.parse(video.publishedAt) < now - 7 * 86400000) return false;
    if (/\b(interview|conversation|panel discussion|roundtable|talk show)\b/i.test(format) && categoryForVideo(video) !== "football") return false;
  }
  if (profile.footballFocus === "european-world-cup" && categoryForVideo(video) === "football" && /\b(nfl|super bowl|american football|college football|mls|saudi pro league)\b/i.test(video.title)) return false;
  if (profile.monthlyMotorsport && categoryForVideo(video) === "motorsport" && Date.parse(video.publishedAt) < now - 31 * 86400000) return false;
  return video.durationSeconds >= 120 && video.durationSeconds <= profile.maxVideoMinutes * 60;
}

export type MixContext = { categoryCounts?: Map<TvLane, number>; channelCounts?: Map<string, number>; recentLanes?: TvLane[]; monthlyMotorsportSeen?: boolean };

export function selectTvMix(candidates: TvCandidate[], profile: TvProfile, excluded: Set<string>, now = Date.now(), context: MixContext = {}) {
  const available = candidates.filter((v) => !excluded.has(v.videoId) && passesMetadataFilter(v, profile, now))
    .sort((a, b) => b.score - a.score);
  const selected: TvCandidate[] = [];
  const seen = new Set(excluded);
  const channels = new Map(context.channelCounts);
  const topics = new Map(context.categoryCounts);
  let seconds = 0;
  while (selected.length < 12) {
    const wantArchive = (selected.filter((v) => isArchive(v, now)).length / (selected.length + 1)) * 100 < profile.archivePercent;
    const eligible = available.filter((v) => {
      const lane = categoryForVideo(v);
      const cap = lane === "motorsport" && profile.monthlyMotorsport ? 1 : Math.min(4, profile.maxPerTopic ?? 4);
      return !seen.has(v.videoId) && (channels.get(v.channelId) ?? 0) < 2 && (topics.get(lane) ?? 0) < cap &&
        !(lane === "motorsport" && profile.monthlyMotorsport && context.monthlyMotorsportSeen) && seconds + v.durationSeconds <= profile.sessionMinutes * 60;
    });
    const lastLane = selected.length ? categoryForVideo(selected[selected.length - 1]) : undefined;
    const wantDiscovery = selected.filter((v) => v.discovery).length / (selected.length + 1) * 100 < (profile.discoveryPercent ?? 25);
    eligible.sort((a, b) =>
      Number(categoryForVideo(a) === lastLane) - Number(categoryForVideo(b) === lastLane) ||
      (topics.get(categoryForVideo(a)) ?? 0) - (topics.get(categoryForVideo(b)) ?? 0) ||
      Number(Boolean(b.discovery) === wantDiscovery) - Number(Boolean(a.discovery) === wantDiscovery) ||
      (context.recentLanes?.filter((lane) => lane === categoryForVideo(a)).length ?? 0) - (context.recentLanes?.filter((lane) => lane === categoryForVideo(b)).length ?? 0) ||
      Number(isArchive(b, now) === wantArchive) - Number(isArchive(a, now) === wantArchive) || b.score - a.score);
    const next = eligible[0];
    if (!next) break;
    selected.push(next);
    seen.add(next.videoId);
    channels.set(next.channelId, (channels.get(next.channelId) ?? 0) + 1);
    const lane = categoryForVideo(next);
    topics.set(lane, (topics.get(lane) ?? 0) + 1);
    seconds += next.durationSeconds;
  }
  return selected;
}

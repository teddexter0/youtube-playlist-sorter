import { z } from "zod";
import { fitsStation, isStationPublisher } from "./station-rules";
import { isLongFormVideo } from "./video-format";
import { sports } from "./sports";
import { previewTitle, tvClipTitle } from "./tv-network-sources";

export const defaultSessionMinutes = 120;

export const tvProfileSchema = z.object({
  playlistId: z.string().max(200).default(""),
  interests: z.array(z.string().trim().min(2).max(400)).max(60).default([]),
  displayName: z.string().trim().max(80).default(""),
  footballLeagues: z.array(z.string().trim().min(2).max(120)).max(60).default([]),
  footballExtras: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
  publisherSources: z.array(z.object({ channelId: z.string().regex(/^UC[\w-]{22}$/), title: z.string().min(1).max(150), handle: z.string().max(80).default(""), description: z.string().max(500).default(""), thumbnail: z.string().url().max(1000).refine(value => { const u = new URL(value); return u.protocol === "https:" && /(^|\.)(ggpht\.com|googleusercontent\.com|ytimg\.com)$/.test(u.hostname); }).optional() })).max(40).default([]),
  selectedSports: z.array(z.enum(sports.map(s => s.id) as [typeof sports[number]["id"], ...typeof sports[number]["id"][]])).max(40).default([]),
  celebrityDiscoveryPercent: z.number().int().min(0).max(100).default(25),
  favoriteCelebrities: z.array(z.string().trim().min(2).max(80)).max(500).default([]),
  stationMode: z.enum(["tv", "childhood", "faith", "popculture", "lifeskills"]).default("tv"),
  preferredHandles: z.array(z.string().regex(/^[a-zA-Z0-9_.-]{2,60}$/)).max(40).default([]),
  studioHandles: z.array(z.string().regex(/^[a-zA-Z0-9_.-]{2,60}$/)).max(40).default([]),
  franchises: z.array(z.string().trim().min(2).max(100)).max(200).default([]),
  referenceUrls: z.array(z.string().url().max(500)).max(10).default([]),
  excludeHorror: z.boolean().default(false),
  strictComfort: z.boolean().default(false),
  mandatoryDaily: z.boolean().default(false),
  durationOrder: z.boolean().default(false),
  rollingQueue: z.boolean().default(false),
  allowClassicFootball: z.boolean().default(false),
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
  sessionMinutes: z.number().int().min(15).max(720).default(defaultSessionMinutes),
  maxVideoMinutes: z.number().int().min(2).max(480).default(40),
  archivePercent: z.number().int().min(0).max(100).default(30),
  liveEnabled: z.boolean().default(false)
});
export type TvProfile = z.infer<typeof tvProfileSchema>;
export const defaultTvProfile = tvProfileSchema.parse({});
export const stationFilterSchema = tvProfileSchema.pick({
  lightViewing: true, sharedTv: true, excludeHorror: true, useYouTubeLikes: true,
  aiEnabled: true, avoid: true, sessionMinutes: true, maxVideoMinutes: true, maxPerTopic: true
}).required();
export type StationFilters = z.infer<typeof stationFilterSchema>;

// Only loaded after the owner explicitly chooses this example in their own profile.
export const exampleInterests = [
  "new official movie trailers", "Saturday Night Live comedy sketches",
  "Premier League official match highlights", "Gameranx Falcon new games commentary",
  "physical hardware inventions hands on reviews", "chess brilliant games explained",
  "Paris fashion week runway best looks", "wildlife short documentaries",
  "Champions League official highlights", "Oscars Golden Globes funny opening monologue",
  "useful new software apps tools demonstrations", "film practical effects behind the scenes",
  "WWE official weekly highlights", "art painting creative process",
  "celebrity late night interview funny clips", "nutrition science short animated explainer",
  "La Liga official match highlights", "new television series official trailers",
  "Met Gala red carpet fashion looks", "Spanish language everyday culture short videos",
  "Bundesliga official highlights", "technology innovation TechCrunch demonstrations",
  "live saxophone jazz music performance", "fun creative skill challenges",
  "Serie A official match highlights", "Tony Awards musical performances",
  "video game culture making of games", "travel destinations city walks",
  "Ligue 1 official match highlights", "Victoria Secret fashion show runway",
  "book adaptations author studio short features", "Emmy BET Awards best performances",
  "FIFA World Cup highlights", "robotics 3D printing manufacturing demonstrations",
  "celebrity movie cast games funny moments", "space discoveries visual short film",
  "sports spectacular skills highlights", "street food cooking around the world",
  "Ballon dOr ceremony best moments", "Formula 1 monthly race recap",
  "Kenya local news brief headlines", "new official movie trailers upcoming releases",
  "animation short films", "architecture extraordinary homes tour",
  "live dance ballet hip hop African performance", "consumer gadgets teardown repair review"
];

export const discoveryInterests = [
  "extraordinary wildlife short documentary", "incredible inventions demonstration",
  "beautiful cities travel short film", "movie practical effects behind the scenes",
  "street food cooking around the world", "live instrumental music performance",
  "space discoveries short documentary", "architecture extraordinary homes tour",
  "chess spectacular games explained", "art restoration painting process",
  "fashion runway craftsmanship", "creative skill challenges",
  "sports extraordinary skills", "Spanish street culture short film",
  "nutrition science animated explainer", "movie trailers official",
  "comedy sketch Saturday Night Live", "video game design behind the scenes"
];

export const tvLanes = ["football", "motorsport", "sports", "technology", "news", "travel", "gaming", "film", "trailers", "comedy", "celebrity", "awards", "fashion", "chess", "health", "arts", "books", "language", "challenges", "music", "nature", "food", "science", "other"] as const;
export type TvLane = (typeof tvLanes)[number];
export const laneLabels: Record<TvLane, string> = { football: "Match day", motorsport: "Fast lane", sports: "The highlight reel", technology: "Tomorrow, today", news: "The short version", travel: "Somewhere else", gaming: "Press play", film: "Movie magic", trailers: "Coming soon", comedy: "A good laugh", celebrity: "On the couch", awards: "And the winner is", fashion: "The runway", chess: "Your next move", health: "Feeling good", arts: "Made by hand", books: "One more page", language: "Hola, mundo", challenges: "Challenge accepted", music: "Good sounds", nature: "Wild world", food: "Good taste", science: "Little wonders", other: "A wild card" };

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
  viewCount?: number;
  category?: TvLane;
  discovery?: boolean;
  classicFootball?: boolean;
  subscribed?: boolean;
  officialTrailer?: boolean;
  officialNetwork?: boolean;
  matureRating?: boolean;
};

const lanePatterns: [TvLane, RegExp][] = [
  ["trailers", /\b(trailer|trailers|teaser)\b/i],
  ["chess", /\b(chess|checkmate|gambit|magnus carlsen|hikaru)\b/i],
  ["fashion", /\b(fashion|runway|met gala|red carpet|victoria.?s? secret|couture)\b/i],
  ["awards", /\b(awards?|oscars?|emmys?|ballon d.?or|golden globes?|tony awards|bet awards)\b/i],
  ["comedy", /\b(comedy|humou?r|snl|saturday night live|sketch|monologue)\b/i],
  ["celebrity", /\b(celebrity|celebrities|late night|tonight show|jimmy fallon|jimmy kimmel|seth meyers|stephen colbert|graham norton|movie cast)\b/i],
  ["health", /\b(health|nutrition|metabolism|exercise|fitness)\b/i],
  ["arts", /\b(painting|art restoration|sculpture|craftsmanship|artist|art studio)\b/i],
  ["books", /\b(books?|author|novel|literature)\b/i],
  ["language", /\b(spanish|español|language learning)\b/i],
  ["challenges", /\b(challenge|challenges|obstacle course|trick shots)\b/i],
  ["motorsport", /\b(formula\s*(?:one|1)|f1|grand prix|motogp|nascar|race recap)\b/i],
  ["football", /\b(football|soccer|epl|ucl|premier league|champions league|la\s?liga|bundesliga|serie\s?a|ligue\s?1|world cup|fifa|uefa|arsenal|chelsea|liverpool|barcelona|real madrid|manchester)\b/i],
  ["sports", /\b(sports?|wwe|wrestling|nba|basketball|tennis|athletics|olympics|rugby|cricket)\b/i],
  ["technology", /\b(technology|tech|hardware|software|apps?|tools?|cpu|gpu|laptop|cars?|automotive|tesla|inventions?|robots?|robotics|artificial intelligence|\bAI\b|gadgets?|smartphone|innovation|computer)\b/i],
  ["news", /\b(news|headlines|citizen tv|ntv kenya|ktn news|breaking news)\b/i],
  ["gaming", /\b(gameranx|gaming|video game|gameplay|playstation|xbox|nintendo|uncharted|hitman|minecraft)\b/i],
  ["film", /\b(movie|film|cinema|vfx|practical effects|behind.the.scenes|animation|cartoon)\b/i],
  ["music", /\b(music|concert|saxophone|piano|jazz|orchestra|instrumental|performance|song)\b/i],
  ["nature", /\b(wildlife|nature|ocean|animal|safari|bird|forest|underwater)\b/i],
  ["food", /\b(food|cooking|chef|recipe|cuisine|baking|street food)\b/i],
  ["travel", /\b(travel|destination|city walk|cities|architecture|tour|beach|mountain|journey)\b/i],
  ["science", /\b(science|space|astronomy|universe|physics|planet|discovery)\b/i]
];

export function categoryForVideo(video: TvCandidate): TvLane {
  if (video.category) return video.category;
  if (video.officialTrailer && previewTitle.test(video.title)) return "trailers";
  if (/\b(citizen tv|ntv kenya|ktn news)\b/i.test(video.channelTitle) || /\b(headlines|breaking news)\b/i.test(video.title)) return "news";
  for (const text of [video.title, video.topic, `${video.channelTitle} ${video.description.slice(0, 240)}`]) {
    const match = lanePatterns.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
    if (text === video.title && video.officialNetwork) return "film";
  }
  return "other";
}

export function isArchive(video: TvCandidate, now = Date.now()) {
  return Date.parse(video.publishedAt) < now - 365 * 86400000;
}

export function tvRankingScore(video: TvCandidate, profile: TvProfile, now: number) {
  const ageDays = (now - Date.parse(video.publishedAt)) / 86400000;
  if (profile.stationMode === "childhood" || !Number.isFinite(ageDays) || ageDays > 90) return video.score;
  // Lifetime views divided by days since publication approximates momentum for recent uploads.
  // Floor the divisor so very new uploads don't get an outsized boost from a few views.
  const viewsPerDay = (video.viewCount ?? 0) / Math.max(1, ageDays);
  return video.score + Math.min(0.35, Math.log10(1 + viewsPerDay) * 0.07) + 0.08 * Math.max(0, 1 - ageDays / 30);
}

// Eight search calls cover eight topics, rather than four topics searched twice.
// Cursor is user-scoped and advances only after a successful live discovery run.
type TvSearch = { topic: string; discovery: boolean; archive: boolean; recentDays: number; videoDuration?: "long" | "medium" };
export function planTvSearches(profile: TvProfile, cursor: number): TvSearch[] {
  if (profile.stationMode === "faith") return [];
  if (profile.stationMode === "childhood") {
    const formats = ["full story recap", "retrospective review", "best moments compilation", "cast reunion"];
    const titles = profile.franchises;
    return Array.from({ length: Math.min(8, titles.length) }, (_, i) => ({
      topic: `${titles[(cursor + i) % titles.length]} ${formats[Math.floor(cursor / Math.max(1, titles.length)) % formats.length]}`,
      discovery: false, archive: false, recentDays: 365
    }));
  }
  if (profile.stationMode !== "tv") {
    const saved = Array.from({ length: Math.min(4, profile.interests.length) }, (_, i) =>
      profile.interests[(cursor + i) % profile.interests.length]);
    if (profile.stationMode === "popculture") {
      const formats = ["Hollywood Reporter actors roundtable interview", "Entertainment Tonight extended movie cast interview", "Vanity Fair celebrity career retrospective interview", "movie cast reunion behind the scenes", "Access Hollywood celebrity interview extended", "celebrity red carpet special backstage interview"];
      const recent = [...new Set([...saved, "celebrity news this week recap", "entertainment news red carpet highlights"])].slice(0, 4)
        .map(topic => ({ topic, discovery: false, archive: false, recentDays: 14 }));
      const features: TvSearch[] = Array.from({ length: 8 - recent.length }, (_, i) => ({
        topic: formats[(cursor + i) % formats.length], discovery: false, archive: false, recentDays: 120,
        videoDuration: i % 2 === 0 ? "long" : "medium"
      }));
      return [...recent, ...features];
    }
    const formats = ["first aid wound care how to Red Cross", "emergency preparedness kit checklist Red Cross", "food safety kitchen basics", "beginner swim water safety tips", "etiquette guide practical tips", "sleep hygiene tips Mayo Clinic", "meal prep tips for beginners", "how to make a budget basics"];
    const rotated = Array.from({ length: 4 }, (_, i) => formats[(cursor + i) % formats.length]);
    return [...new Set([...saved, ...rotated])].map(topic => ({
      topic, discovery: false, archive: false, recentDays: 365
    }));
  }
  const personalCount = profile.discoveryPercent > 0 ? 6 : 8;
  const personal = Array.from({ length: Math.min(personalCount, profile.interests.length) }, (_, i) => ({
    topic: profile.interests[(cursor + i) % profile.interests.length], discovery: false
  }));
  const topics = [...personal];
  // Add a rotating sport within the existing search budget; never rewrite interests.
  const leagues = [...(profile.footballLeagues ?? []), ...(profile.footballExtras ?? [])];
  const chosenSports = sports.filter(s => profile.selectedSports?.includes(s.id));
  if (chosenSports.length) topics.splice(Math.max(0, topics.length - 2), topics.length ? 1 : 0,
    { topic: chosenSports[Math.floor(cursor / 6) % chosenSports.length].query, discovery: false });
  const people = profile.favoriteCelebrities ?? [];
  if (people.length) topics.splice(topics.length < 6 ? topics.length : topics.length - 1, topics.length < 6 ? 0 : 1,
    { topic: `${people[Math.floor(cursor / 6) % people.length]} short interview cast games`, discovery: false });
  if (leagues.length && !profile.mandatoryDaily) topics.splice(topics.length < 6 ? topics.length : 0, topics.length < 6 ? 0 : 1,
    { topic: `${leagues[Math.floor(cursor / 6) % leagues.length]} football match highlights`, discovery: false });
  if (profile.mandatoryDaily) {
    const choices = leagues.length ? leagues : ["Premier League", "Champions League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
    const league = choices[Math.floor(cursor / 6) % choices.length];
    topics.splice(0, 2, { topic: "new official Hollywood movie trailer", discovery: false }, { topic: `${league} official short match highlights`, discovery: false });
  }
  if (profile.discoveryPercent > 0) for (let i = 0, added = 0; i < discoveryInterests.length && added < 2; i++) {
    const topic = discoveryInterests[(cursor + i) % discoveryInterests.length];
    if (topics.some((entry) => entry.topic.toLowerCase() === topic.toLowerCase())) continue;
    topics.push({ topic, discovery: true }); added++;
  }
  const entertainmentTaste = people.length || profile.franchises.length || profile.interests.some(topic => /film|movie|cinema|cast|celebr|actor|actress|television|sitcom|comedy|talk show/i.test(topic));
  if (entertainmentTaste && profile.celebrityDiscoveryPercent > 0 && Math.floor(cursor / 6) % Math.max(1, Math.round(100 / profile.celebrityDiscoveryPercent)) === 0) {
    const topic = profile.franchises.length
      ? `${profile.franchises[Math.floor(cursor / 6) % profile.franchises.length]} cast interview funny moments`
      : "film television cast interview funny moments";
    if (topics.length < 8) topics.push({ topic, discovery: true });
    else topics[topics.length - 1] = { topic, discovery: true };
  }
  if (profile.mandatoryDaily && cursor > 0 && Math.floor(cursor / 6) % 30 === 0) topics[topics.length - 1] = { topic: "Premier League Champions League 2010 2020 classic match highlights", discovery: true };
  else if (profile.mandatoryDaily && cursor > 0 && Math.floor(cursor / 6) % 7 === 0) topics[topics.length - 1] = { topic: "Saturday Night Live classic funny sketch", discovery: true };
  let archiveSlots = Math.round(topics.length * profile.archivePercent / 100);
  return topics.map((entry) => {
    const lane = categoryForVideo({ title: entry.topic, topic: "", channelTitle: "", description: "" } as TvCandidate);
    const weekly = ["football", "sports", "news"].includes(lane);
    const current = weekly || ["trailers", "technology", "awards", "fashion", "motorsport"].includes(lane) || (lane === "gaming" && /new|latest|news|review|features/i.test(entry.topic));
    const classic = /classic (?:match|funny)/i.test(entry.topic);
    const archive = classic || (!current && archiveSlots-- > 0);
    return { ...entry, archive, recentDays: weekly ? 7 : 30 };
  });
}

// A conservative metadata screen; it cannot certify the contents of a video.
export function passesMetadataFilter(video: TvCandidate, profile: TvProfile, now = Date.now()) {
  const verifiedPreview = video.officialTrailer && previewTitle.test(video.title);
  const verifiedClip = video.officialNetwork && tvClipTitle.test(video.title);
  const specialistClip = isStationPublisher(profile.stationMode, video.channelId);
  const markedShort = /(?:#shorts?\b|\byoutube shorts\b|\bvertical (?:trailer|teaser|promo)\b)/i.test(`${video.title} ${video.description}`);
  if (markedShort || (!(verifiedPreview || verifiedClip || specialistClip) && !isLongFormVideo(video))) return false;
  if ((profile.sharedTv || profile.strictComfort) && video.matureRating) return false;
  const text = `${video.title} ${video.description} ${video.channelTitle}`.toLowerCase();
  if (profile.excludeHorror && /\b(horror|terror|terrifying|nightmare|slasher|gore|gory|haunted|possession|possessed|exorcis[mt]|satanic|demonic|occult|conjuring|annabelle|insidious|evil dead|the nun|saw\s*(?:[ivx]+|\d+)|five nights at freddy|fnaf)\b/i.test(`${video.title} ${video.description.slice(0, 1200)}`)) return false;
  if ((profile.strictComfort || profile.stationMode !== "tv") && !fitsStation(video, profile)) return false;
  const age = now - Date.parse(video.publishedAt);
  if (profile.stationMode === "popculture") {
    const feature = video.durationSeconds >= 6 * 60 && /\b(interviews?|roundtables?|cast reunion|career retrospective|behind the scenes|red carpet special|career timeline|looks back)\b/i.test(video.title) &&
      !/\b(breaking news|gossip|weekly recap|this week)\b/i.test(video.title);
    if (!Number.isFinite(age) || age > (feature ? 120 : specialistClip ? 30 : 14) * 86400000) return false;
  }
  if (profile.stationMode === "faith" && (!Number.isFinite(age) || age > 30 * 86400000)) return false;
  if (profile.strictComfort && /\b(occult(?:ic|ism)?|demons?|demonic|satan(?:ic)?|witchcraft|sorcery|gothic|dark fantasy|horror|conjuring|annabelle|exorcist|erotic|sexual|sex scene|raunchy|striptease|culture war|political rant|anti.woke rant)\b/i.test(`${video.title} ${video.channelTitle} ${video.description.slice(0, 400)}`)) return false;
  if (profile.strictComfort && profile.stationMode === "tv") {
    const headline = `${video.title} ${video.channelTitle}`;
    const synopsis = `${headline} ${video.description.slice(0, 1200)}`;
    if (/\b(sexy|lingerie|bikini haul|strip club|nudity|uncensored|explicit lyrics|strong language|profanity|red band|tv.ma|f[\W_]*[u*][\W_]*[c*][\W_]*k\w*|sh[i*]t\w*|bullshit|bitch\w*|motherf\w*|asshole\w*|true crime|gore|graphic violence|bodycam)\b/i.test(synopsis)) return false;
    if (/\b(sermons?|bible study|scripture reading|religious (?:service|education)|worship (?:service|music)|prayer (?:service|meeting)|christian (?:ministry|preaching)|sunday service|quran|khutbah|dharmic teachings|religious debate|gospel music|church service|devotional|jesus christ|allah|islamic lecture|god.s word|faith testimony)\b/i.test(synopsis)) return false;
    if (/\b(lecture|masterclass|deep dive|documentary series|seminar|webinar|full episode|full documentary|quantum mechanics|particle physics|molecular biology|advanced calculus|theoretical physics|phd thesis)\b/i.test(headline)) return false;
    if (categoryForVideo(video) === "science" && video.durationSeconds > 8 * 60) return false;
  }
  if (profile.strictComfort && categoryForVideo(video) === "gaming" && /\b(horror|occult|gothic|diablo|elden ring|bloodborne|dark souls|baldur.?s gate|silent hill|resident evil|doom|outlast)\b/i.test(`${video.title} ${video.description.slice(0, 400)}`)) return false;
  if (profile.avoid.some((term) => text.includes(term.toLowerCase()))) return false;
  if (profile.sharedTv && /\b(porn|nude|nudity|nsfw|gore|racial slur|hate speech|sex tape|fuck|shit)\b/i.test(text)) return false;
  if (profile.lightViewing) {
    const format = `${video.title} ${video.channelTitle}`;
    const lane = categoryForVideo(video);
    if (/\b(podcast|lecture|lectures|philosophy|philosophical|existential|debate|dating advice|relationship advice|parenting advice|raising (?:kids|children)|red pill|manosphere|wild\s*['’]?[n&]['’]?\s*out|jordan (?:b\.? )?peterson|jbp|joe rogan|lex fridman|huberman lab|diary of a ceo|modern wisdom|fresh.?and.?fit|sex talk|body count)\b/i.test(format)) return false;
    if (/\b(dating|hook.?up|pick.?up|smash or pass|blind date|speed date|raunchy)\b/i.test(format)) return false;
    if (categoryForVideo(video) === "news" && video.durationSeconds > 8 * 60) return false;
    if (categoryForVideo(video) === "news" && Date.parse(video.publishedAt) < now - 7 * 86400000) return false;
    const interview = /\b(interview|conversation|panel discussion|roundtable|talk show)\b/i.test(format) || lane === "celebrity";
    const favourite = [...(profile.favoriteCelebrities ?? []), ...(profile.franchises ?? [])].some((name) => `${format} ${video.description.slice(0, 240)}`.toLowerCase().includes(name.toLowerCase()));
    // Explicit affinity works without AI; marked discovery candidates can bring new guests.
    const discoveryGuest = profile.celebrityDiscoveryPercent > 0 && video.discovery;
    if (interview && lane !== "football" && !(video.durationSeconds <= 15 * 60 && (favourite || specialistClip || (["celebrity", "film", "comedy", "awards"].includes(lane) && (profile.aiEnabled || discoveryGuest || verifiedClip))))) return false;
    if (["football", "sports"].includes(lane) && /\b(highlights?|recap)\b/i.test(video.title) && Date.parse(video.publishedAt) < now - 7 * 86400000 && !(lane === "football" && profile.allowClassicFootball && /\b201\d\b|\b2020\b/.test(video.title) && video.score >= 0.8)) return false;
    if (lane === "trailers" && Date.parse(video.publishedAt) < now - 30 * 86400000) return false;
    if (profile.mandatoryDaily && lane === "trailers" && !video.officialTrailer) return false;
    if (profile.strictComfort && lane === "awards" && !/\b(recap|roundup|round.up|highlights|full ceremony|full show|monologue)\b/i.test(video.title)) return false;
  }
  if ((categoryForVideo(video) === "health" || profile.stationMode === "lifeskills") && /\b(miracle cure|cures? cancer|detox cure|lose \d+ pounds in|stop your medication)\b/i.test(video.title)) return false;
  if (profile.footballFocus === "european-world-cup" && categoryForVideo(video) === "football" && /\b(nfl|super bowl|american football|college football|mls|saudi pro league)\b/i.test(video.title) && !(profile.selectedSports?.includes("american-football") && /\b(nfl|super bowl|american football|college football)\b/i.test(video.title))) return false;
  if (profile.monthlyMotorsport && categoryForVideo(video) === "motorsport" && Date.parse(video.publishedAt) < now - 31 * 86400000) return false;
  const minimum = verifiedPreview ? 45 : verifiedClip || specialistClip ? 90 : 120;
  const maximum = profile.strictComfort && profile.stationMode === "tv" ? Math.min(profile.maxVideoMinutes, 18) : profile.maxVideoMinutes;
  return Number.isFinite(video.durationSeconds) && video.durationSeconds >= minimum && video.durationSeconds <= maximum * 60;
}

export type MixContext = { categoryCounts?: Map<TvLane, number>; channelCounts?: Map<string, number>; recentLanes?: TvLane[]; monthlyMotorsportSeen?: boolean; classicFootballSeen?: boolean; maxItems?: number; deliveredSeconds?: number; previousAppendSeconds?: number };

export function selectTvMix(candidates: TvCandidate[], profile: TvProfile, excluded: Set<string>, now = Date.now(), context: MixContext = {}) {
  const available = candidates.filter((v) => !excluded.has(v.videoId) && passesMetadataFilter(v, profile, now));
  const selected: TvCandidate[] = [];
  const seen = new Set(excluded);
  const channels = new Map(context.channelCounts);
  const topics = new Map(context.categoryCounts);
  const compact = profile.strictComfort && profile.stationMode === "tv";
  const targetSeconds = profile.sessionMinutes * 60 - (context.previousAppendSeconds ?? 0);
  const targetCount = compact ? Math.ceil(profile.sessionMinutes / 7) : 0;
  const coveredNetworks = new Set<string>();
  const networkTarget = compact ? Math.min(4, Math.ceil(profile.sessionMinutes / 35)) : 0;
  let seconds = context.deliveredSeconds ?? 0;
  while (selected.length < (context.maxItems ?? 40)) {
    const wantArchive = (profile.stationMode === "tv" || profile.stationMode === "childhood") &&
      (selected.filter((v) => isArchive(v, now)).length / (selected.length + 1)) * 100 < profile.archivePercent;
    const eligible = available.filter((v) => {
      const lane = categoryForVideo(v);
      const cap = (lane === "motorsport" && profile.monthlyMotorsport) || (compact && lane === "science") ? 1 : Math.min(4, profile.maxPerTopic ?? 4);
      return !seen.has(v.videoId) && (channels.get(v.channelId) ?? 0) < 2 && (topics.get(lane) ?? 0) < cap &&
        !(v.classicFootball && (context.classicFootballSeen || selected.some(item => item.classicFootball))) &&
        !(lane === "motorsport" && profile.monthlyMotorsport && context.monthlyMotorsportSeen) && seconds + v.durationSeconds <= targetSeconds;
    });
    const lastLane = selected.length ? categoryForVideo(selected[selected.length - 1]) : undefined;
    const wantDiscovery = selected.filter((v) => v.discovery).length / (selected.length + 1) * 100 < (profile.discoveryPercent ?? 25);
    const missingRequired = profile.mandatoryDaily ? ["trailers", "football"].filter((lane) => !selected.some((v) => categoryForVideo(v) === lane)) : [];
    const boostNetwork = (video: TvCandidate) => Number(coveredNetworks.size < networkTarget && video.officialNetwork && !coveredNetworks.has(video.channelId));
    const pace = Math.max(180, (targetSeconds - seconds) / Math.max(1, targetCount - selected.length));
    eligible.sort((a, b) =>
      Number(missingRequired.includes(categoryForVideo(b))) - Number(missingRequired.includes(categoryForVideo(a))) ||
      Number(categoryForVideo(a) === lastLane) - Number(categoryForVideo(b) === lastLane) ||
      boostNetwork(b) - boostNetwork(a) ||
      (topics.get(categoryForVideo(a)) ?? 0) - (topics.get(categoryForVideo(b)) ?? 0) ||
      Number(Boolean(b.discovery) === wantDiscovery) - Number(Boolean(a.discovery) === wantDiscovery) ||
      (context.recentLanes?.filter((lane) => lane === categoryForVideo(a)).length ?? 0) - (context.recentLanes?.filter((lane) => lane === categoryForVideo(b)).length ?? 0) ||
      Number(isArchive(b, now) === wantArchive) - Number(isArchive(a, now) === wantArchive) ||
      tvRankingScore(b, profile, now) - tvRankingScore(a, profile, now) +
        (compact ? (Math.abs(a.durationSeconds - pace) - Math.abs(b.durationSeconds - pace)) / 1000 : 0) +
        (profile.stationMode === "popculture" ? (Math.min(1200, b.durationSeconds) - Math.min(1200, a.durationSeconds)) / 2400 : 0));
    const next = eligible[0];
    if (!next) break;
    const lane = categoryForVideo(next);
    const gap = compact && lane === lastLane ? selected.findIndex((video, index) =>
      index > 1 && categoryForVideo(video) !== lane && categoryForVideo(selected[index - 1]) !== lane) : -1;
    if (gap >= 0) selected.splice(gap, 0, next);
    else selected.push(next);
    if (next.officialNetwork) coveredNetworks.add(next.channelId);
    seen.add(next.videoId);
    channels.set(next.channelId, (channels.get(next.channelId) ?? 0) + 1);
    topics.set(lane, (topics.get(lane) ?? 0) + 1);
    seconds += next.durationSeconds;
  }
  return selected;
}

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
  sessionMinutes: z.number().int().min(15).max(240).default(90),
  maxVideoMinutes: z.number().int().min(2).max(120).default(40),
  archivePercent: z.number().int().min(0).max(100).default(30),
  liveEnabled: z.boolean().default(false)
});
export type TvProfile = z.infer<typeof tvProfileSchema>;
export const defaultTvProfile = tvProfileSchema.parse({});

// Only loaded after the owner explicitly chooses this example in their own profile.
export const exampleInterests = [
  "football analysis", "story driven video games", "science and technology explainers",
  "Christian faith", "travel and architecture", "film and television behind the scenes",
  "entrepreneurship", "saxophone performances"
];

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
};

export function isArchive(video: TvCandidate, now = Date.now()) {
  return Date.parse(video.publishedAt) < now - 365 * 86400000;
}

// A conservative metadata screen; it cannot certify the contents of a video.
export function passesMetadataFilter(video: TvCandidate, profile: TvProfile) {
  const text = `${video.title} ${video.description} ${video.channelTitle}`.toLowerCase();
  if (profile.avoid.some((term) => text.includes(term.toLowerCase()))) return false;
  if (profile.sharedTv && /\b(porn|nude|nudity|nsfw|gore|racial slur|hate speech|sex tape|fuck|shit)\b/i.test(text)) return false;
  return video.durationSeconds >= 120 && video.durationSeconds <= profile.maxVideoMinutes * 60;
}

export function selectTvMix(candidates: TvCandidate[], profile: TvProfile, excluded: Set<string>, now = Date.now()) {
  const available = candidates.filter((v) => !excluded.has(v.videoId) && passesMetadataFilter(v, profile))
    .sort((a, b) => b.score - a.score);
  const selected: TvCandidate[] = [];
  const seen = new Set(excluded);
  const channels = new Map<string, number>();
  const topics = new Map<string, number>();
  let seconds = 0;
  while (selected.length < 12) {
    const wantArchive = (selected.filter((v) => isArchive(v, now)).length / (selected.length + 1)) * 100 < profile.archivePercent;
    const eligible = available.filter((v) => !seen.has(v.videoId) && (channels.get(v.channelId) ?? 0) < 2 && seconds + v.durationSeconds <= profile.sessionMinutes * 60);
    eligible.sort((a, b) =>
      (topics.get(a.topic) ?? 0) - (topics.get(b.topic) ?? 0) ||
      Number(isArchive(b, now) === wantArchive) - Number(isArchive(a, now) === wantArchive) || b.score - a.score);
    const next = eligible[0];
    if (!next) break;
    selected.push(next);
    seen.add(next.videoId);
    channels.set(next.channelId, (channels.get(next.channelId) ?? 0) + 1);
    topics.set(next.topic, (topics.get(next.topic) ?? 0) + 1);
    seconds += next.durationSeconds;
  }
  return selected;
}

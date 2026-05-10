import { playlistLabels, type PlaylistKey } from "@/lib/config";

export type VideoForClassification = {
  title: string;
  description?: string;
  channelTitle?: string;
  channelId?: string;
  tags?: string[];
  commentTexts?: string[];
  categoryId?: string;
  durationSeconds: number;
  isSubscribedChannel?: boolean;
};

export type Classification = {
  targetKey?: PlaylistKey;
  targetPlaylistName?: string;
  reason: string;
  confidence: number;
  keepInInbox?: boolean;
};

const ruleSets: Array<{
  key: PlaylistKey;
  confidence: number;
  terms: RegExp[];
  maxSeconds?: number;
  subscribedBoost?: number;
}> = [
  {
    key: "newNj",
    confidence: 0.96,
    terms: [
      /\b(god|jesus|bible|christian|sermon|worship|theology|gospel|apologetics|prayer|church|scripture|holy spirit|testimony|cross|crucifixion|resurrection|salvation|repentance|discipleship|faith)\b/i
    ]
  },
  {
    key: "games",
    confidence: 0.9,
    terms: [
      /\b(video games?|gaming|gameplay|game review|console|playstation|ps5|xbox|nintendo|steam|pc gaming|walkthrough|speedrun|rpg|fps)\b/i
    ]
  },
  {
    key: "football",
    confidence: 0.9,
    terms: [
      /\b(football|soccer|sports?|tactics|highlights?|critique|past seasons?|teams?|players?|matches?|epl|premier league|ucl|champions league|fifa|uefa|arsenal|chelsea|liverpool|man united|manchester united|barcelona|real madrid|formations?|pressing|transition|counter[- ]attack)\b/i
    ]
  },
  {
    key: "richReminders",
    confidence: 0.86,
    terms: [
      /\b(money|wealth|rich|investing|investment|business|startup|side hustle|income|finance|financial freedom|millionaire|entrepreneurship)\b/i
    ]
  },
  {
    key: "lateNightShows",
    confidence: 0.82,
    maxSeconds: 1800,
    terms: [
      /\b(movie|movies|actor|actors|artist|music|talk show|late[- ]night|interview|entertainment|clip|snl|jimmy fallon|kimmel|colbert|daily show|seth meyers)\b/i
    ]
  },
  {
    key: "next",
    confidence: 0.88,
    terms: [
      /\b(dynamic perspective|philosophy|philosophical|atheis[mt]|theis[mt]|ethics|morality|metaphysics|epistemology|free will|consciousness|debate|alex o'?connor|cosmic skeptic|case stud(?:y|ies)|society|science|psychology|systems|history|economics|technology|culture analysis|analysis|documentary|explained|homosexuality)\b/i
    ]
  },
  {
    key: "news",
    confidence: 0.76,
    terms: [
      /\b(tabloid|celebrity drama|trend commentary|megyn kelly|celeb news|online drama|breaking news|politics|scandal|controversy)\b/i
    ]
  },
  {
    key: "podcasts",
    confidence: 0.72,
    terms: [
      /\b(podcast|full episode|longform|conversation|uncut|livestream|stream replay)\b/i
    ],
    subscribedBoost: 0.08
  }
];

const channelAffinity: Array<{
  key: PlaylistKey;
  confidence: number;
  channelTerms: RegExp[];
  contentTerms: RegExp[];
  exclusionTerms?: RegExp[];
}> = [
  {
    key: "next",
    confidence: 0.9,
    channelTerms: [/\b(alex o'?connor|cosmic skeptic)\b/i],
    contentTerms: [
      /\b(philosophy|philosophical|atheis[mt]|theis[mt]|ethics|morality|religion|christianity|islam|god|debate|argument|consciousness|free will|homosexuality|meaning|truth|logic|reason)\b/i
    ],
    exclusionTerms: [
      /\b(song|singing|cover|music video|live performance|college band|guitar|piano|album|single|lyrics)\b/i
    ]
  }
];

export function classifyVideo(video: VideoForClassification): Classification {
  const haystack = [
    video.title,
    video.description ?? "",
    video.channelTitle ?? "",
    ...(video.tags ?? []),
    ...(video.commentTexts ?? [])
  ].join(" ");

  for (const affinity of channelAffinity) {
    const channelMatches = affinity.channelTerms.some((term) => term.test(video.channelTitle ?? ""));
    const contentMatches = affinity.contentTerms.some((term) => term.test(haystack));
    const excluded = affinity.exclusionTerms?.some((term) => term.test(haystack)) ?? false;
    if (channelMatches && contentMatches && !excluded) {
      return {
        targetKey: affinity.key,
        targetPlaylistName: playlistLabels[affinity.key],
        reason: `Matched channel affinity plus content evidence for ${playlistLabels[affinity.key]}`,
        confidence: affinity.confidence
      };
    }
  }

  for (const rule of ruleSets) {
    if (rule.maxSeconds && video.durationSeconds >= rule.maxSeconds) continue;
    if (rule.terms.some((term) => term.test(haystack))) {
      const confidence = Math.min(0.99, rule.confidence + (video.isSubscribedChannel ? rule.subscribedBoost ?? 0.03 : 0));
      return {
        targetKey: rule.key,
        targetPlaylistName: playlistLabels[rule.key],
        reason: `Matched deterministic ${playlistLabels[rule.key]} rule${video.isSubscribedChannel ? " with subscribed-channel signal" : ""}`,
        confidence
      };
    }
  }

  if (video.durationSeconds > 1800) {
    return {
      targetKey: "podcasts",
      targetPlaylistName: playlistLabels.podcasts,
      reason: "Duration is over 30 minutes and no higher-priority rule matched",
      confidence: video.isSubscribedChannel ? 0.74 : 0.68
    };
  }

  if (video.durationSeconds < 360) {
    return {
      reason: "Under 6 minutes and no higher-priority rule matched",
      confidence: 0.6,
      keepInInbox: true
    };
  }

  return {
    targetKey: "next",
    targetPlaylistName: playlistLabels.next,
    reason: "Fallback to Next because no specific rule matched",
    confidence: 0.45
  };
}

export const requiredPlaylistKeys = [
  "inbox",
  "next",
  "lateNightShows",
  "newNj",
  "podcasts",
  "news",
  "games",
  "football"
] as const;

export const optionalPlaylistKeys = ["done", "richReminders", "tv"] as const;

export const allPlaylistKeys = [...requiredPlaylistKeys, ...optionalPlaylistKeys] as const;

export type PlaylistKey = (typeof allPlaylistKeys)[number];

export const playlistLabels: Record<PlaylistKey, string> = {
  inbox: "Inbox",
  next: "Next",
  lateNightShows: "late night shows",
  newNj: "new nj",
  podcasts: "podcasts",
  news: "News",
  games: "games",
  football: "football",
  tv: "TV",
  done: "Done",
  richReminders: "how to get rich reminders"
};

export type PlaylistIds = Partial<Record<PlaylistKey, string>>;

export type UserSettings = {
  userId: string;
  email?: string;
  playlistIds: PlaylistIds;
  liveSortingEnabled: boolean;
  sortingDryRunCompletedAt?: string;
  cleanupEnabled: boolean;
  cleanupDryRunCompletedAt?: string;
  cleanupMode: "age" | "done";
  excludedCleanupPlaylistKeys: PlaylistKey[];
  lastCleanupAt?: string;
  createdAt: string;
  updatedAt: string;
  tv?: import("./tv-profile").TvProfile;
  tvPreviewHash?: string;
  tvSearchCursor?: number;
  tvHistory?: string[];
  tvRecent?: { videoId: string; category: import("./tv-profile").TvLane; channelId: string; at: string }[];
  tvFeedback?: Record<string, { action: "like" | "skip" | "watched" | "block-channel"; channelId: string; at: string }>;
};

export type ProcessedStatus = "processed" | "kept" | "skipped" | "removed" | "error";

export type ProcessedVideo = {
  videoId: string;
  sourcePlaylistId: string;
  targetPlaylistId?: string;
  targetPlaylistName?: string;
  playlistItemIdInTarget?: string;
  classifiedAt: string;
  addedToTargetAt?: string;
  reason: string;
  confidence: number;
  status: ProcessedStatus;
  title?: string;
  channelTitle?: string;
  error?: string;
};

export type LogLevel = "info" | "warn" | "error";

export type AppLog = {
  id?: string;
  userId: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
};

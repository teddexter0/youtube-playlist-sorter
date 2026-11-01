import { google, youtube_v3 } from "googleapis";
import { decryptSecret } from "@/lib/crypto";
import type { UserSettings } from "@/lib/config";
import { envValue, missingGoogleConfig } from "@/lib/runtime-config";
import { deriveTasteTopics } from "@/lib/taste-topics";

export async function getYouTubeAccountTaste(youtube: youtube_v3.Youtube) {
  const [likes, subscriptions] = await Promise.all([
    youtube.videos.list({ part: ["snippet", "topicDetails"], myRating: "like", maxResults: 50 }),
    youtube.subscriptions.list({ part: ["snippet"], mine: true, maxResults: 50 })
  ]);
  const channelIds = [...new Set((subscriptions.data.items ?? []).map((item) => item.snippet?.resourceId?.channelId).filter((id): id is string => Boolean(id)))];
  const channels = channelIds.length ? (await youtube.channels.list({ part: ["snippet", "topicDetails"], id: channelIds })).data.items ?? [] : [];
  const likedVideos = likes.data.items ?? [];
  const names = channels.map((channel) => channel.snippet?.title ?? "");
  return {
    interests: deriveTasteTopics([...likedVideos, ...channels], names),
    likedTitles: likedVideos.map((video) => video.snippet?.title ?? "").filter(Boolean),
    likedVideoIds: likedVideos.map((video) => video.id ?? "").filter(Boolean),
    subscriptionCount: channelIds.length,
    likedCount: likedVideos.length
  };
}

export function oauthClient() {
  if (missingGoogleConfig().length) throw new Error("Google sign-in is not configured. See the setup page.");
  return new google.auth.OAuth2(
    envValue("GOOGLE_CLIENT_ID"),
    envValue("GOOGLE_CLIENT_SECRET"),
    envValue("GOOGLE_REDIRECT_URI")
  );
}

export function googleAuthUrl(state: string) {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    state,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube"
    ]
  });
}

export function youtubeForUser(user: UserSettings & { encryptedRefreshToken?: string }) {
  if (!user.encryptedRefreshToken) throw new Error("User has not connected Google");
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptSecret(user.encryptedRefreshToken) });
  return google.youtube({ version: "v3", auth: client });
}

export async function listPlaylistItems(
  youtube: youtube_v3.Youtube,
  playlistId: string,
  maxItems = 200
) {
  const items: youtube_v3.Schema$PlaylistItem[] = [];
  let pageToken: string | undefined;

  do {
    const res = await youtube.playlistItems.list({
      part: ["id", "snippet", "contentDetails"],
      playlistId,
      maxResults: 50,
      pageToken
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && items.length < maxItems);

  return items;
}

export async function getVideos(youtube: youtube_v3.Youtube, videoIds: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
  const videos: youtube_v3.Schema$Video[] = [];

  for (const chunk of chunks) {
    const res = await youtube.videos.list({
      part: ["snippet", "contentDetails"],
      id: chunk
    });
    videos.push(...(res.data.items ?? []));
  }

  return videos;
}

export async function getSubscribedChannelIds(youtube: youtube_v3.Youtube, maxItems = 500) {
  const channelIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const res = await youtube.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken
    });
    for (const item of res.data.items ?? []) {
      const channelId = item.snippet?.resourceId?.channelId;
      if (channelId) channelIds.add(channelId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && channelIds.size < maxItems);

  return channelIds;
}

export async function getTopCommentTexts(
  youtube: youtube_v3.Youtube,
  videoId: string,
  maxResults = 20
) {
  const res = await youtube.commentThreads.list({
    part: ["snippet"],
    videoId,
    maxResults,
    order: "relevance",
    textFormat: "plainText"
  });

  return (res.data.items ?? [])
    .map((item) => item.snippet?.topLevelComment?.snippet?.textDisplay?.trim())
    .filter((text): text is string => Boolean(text));
}

export async function validatePlaylist(youtube: youtube_v3.Youtube, playlistId: string) {
  const res = await youtube.playlists.list({
    part: ["id", "snippet"],
    id: [playlistId],
    maxResults: 1
  });
  return res.data.items?.[0] ?? null;
}

export async function listOwnPlaylistTitles(youtube: youtube_v3.Youtube, maxItems = 500) {
  const titles = new Set<string>();
  let pageToken: string | undefined;

  do {
    const res = await youtube.playlists.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken
    });
    for (const item of res.data.items ?? []) {
      const title = item.snippet?.title?.trim();
      if (title) titles.add(title.toLowerCase());
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && titles.size < maxItems);

  return titles;
}

export function uniquePlaylistTitle(baseTitle: string, existingTitles: Set<string>) {
  if (!existingTitles.has(baseTitle.toLowerCase())) return baseTitle;

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${baseTitle} (${index})`;
    if (!existingTitles.has(candidate.toLowerCase())) return candidate;
  }

  let suffix = "w";
  while (existingTitles.has(`${baseTitle}${suffix}`.toLowerCase())) suffix += "w";
  return `${baseTitle}${suffix}`;
}

export async function playlistVideoIds(youtube: youtube_v3.Youtube, playlistId: string) {
  const items = await listPlaylistItems(youtube, playlistId, 500);
  return items
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
}

export async function playlistVideoRefs(youtube: youtube_v3.Youtube, playlistId: string) {
  const items = await listPlaylistItems(youtube, playlistId, 500);
  return items
    .map((item) => ({
      playlistItemId: item.id ?? "",
      videoId: item.contentDetails?.videoId ?? "",
      position: item.snippet?.position ?? 0
    }))
    .filter((item) => item.videoId);
}

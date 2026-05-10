import { google, youtube_v3 } from "googleapis";
import { decryptSecret } from "@/lib/crypto";
import type { UserSettings } from "@/lib/config";

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function googleAuthUrl() {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
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
    mine: false,
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

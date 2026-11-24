import { adminDb } from "./firebase";
import { youtubeForUser } from "./google";
import { studioSources } from "./studio-sources";
import { channelLookup } from "./channel-sources";
import type { UserSettings } from "./config";
import type { youtube_v3 } from "googleapis";
export function publisherFromChannel(channel: youtube_v3.Schema$Channel) {
  const snippet = channel.snippet;
  return { channelId: channel.id!, title: (snippet?.title ?? "YouTube channel").slice(0, 150), handle: (snippet?.customUrl ?? "").slice(0, 80), description: (snippet?.description ?? "").slice(0, 500),
    ...(snippet?.thumbnails?.default?.url ? { thumbnail: snippet.thumbnails.default.url } : {}) };
}
export async function searchPublishers(user: UserSettings, query: string) {
  const day = new Date().toISOString().slice(0, 10);
  const limit = adminDb().collection("users").doc(user.userId).collection("searchUsage").doc(day);
  await adminDb().runTransaction(async tx => { const data = (await tx.get(limit)).data(); if ((data?.publisherSearches ?? 0) >= 20) throw new Error("Publisher search has reached today's limit. Try again tomorrow."); tx.set(limit, { publisherSearches: (data?.publisherSearches ?? 0) + 1 }, { merge: true }); });
  const yt = youtubeForUser(user);
  const input = query.trim().replace(/^@/, "");
  const known = studioSources.find(source => source.name.toLowerCase() === input.toLowerCase() || source.handle.toLowerCase() === input.toLowerCase());
  if (known || /^[\w.-]{2,60}$/.test(input)) {
    const direct = await yt.channels.list({ part: ["id", "snippet"], ...channelLookup(known?.handle ?? input) });
    if (direct.data.items?.length) return direct.data.items.map(publisherFromChannel);
  }
  const found = await yt.search.list({ part: ["snippet"], type: ["channel"], q: query, maxResults: 6 });
  const ids = found.data.items?.map(item => item.id?.channelId ?? "").filter(Boolean) ?? [];
  if (!ids.length) return [];
  const channels = await yt.channels.list({ part: ["id", "snippet"], id: ids });
  return (channels.data.items ?? []).map(publisherFromChannel);
}

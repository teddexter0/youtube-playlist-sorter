import type { UserSettings } from "./config";
import type { TvProfile } from "./tv-profile";
import { adminDb } from "./firebase";
import { getSubscribedChannelIds, listPlaylistItems, youtubeForUser } from "./google";
const studios = ["WarnerBrosPictures", "UniversalPictures", "SonyPictures", "ParamountPictures", "WaltDisneyStudios", "20thCenturyStudios", "Netflix", "PrimeVideo", "AppleTV"];
export async function stationSources(user: UserSettings, profile: TvProfile) {
  const yt = youtubeForUser(user);
  const origins = new Map<string, { topic: string; discovery: boolean; subscribed?: boolean; officialTrailer?: boolean }>();
  const warnings: string[] = [];
  const handles = [...new Set([...(profile.preferredHandles ?? []), ...(profile.mandatoryDaily ? studios : [])])];
  await Promise.all(handles.map(async (handle) => {
    const cache = adminDb().collection("publicChannelCache").doc(handle.toLowerCase());
    let cached = (await cache.get()).data();
    if (!cached || cached.at < Date.now() - 7 * 86400000) {
      const result = await yt.channels.list({ part: ["id", "snippet", "contentDetails"], forHandle: handle });
      const channel = result.data.items?.[0];
      if (!channel?.id || !channel.contentDetails?.relatedPlaylists?.uploads) { warnings.push(`Channel @${handle} could not be resolved; no substitute was guessed.`); return; }
      cached = { id: channel.id, title: channel.snippet?.title ?? handle, uploads: channel.contentDetails.relatedPlaylists.uploads, at: Date.now() };
      await cache.set(cached);
    }
    for (const item of await listPlaylistItems(yt, cached.uploads, 12)) {
      const id = item.contentDetails?.videoId;
      if (id) origins.set(id, { topic: cached.title, discovery: false, officialTrailer: studios.includes(handle) });
    }
  }));
  if (profile.stationMode === "faith") {
    const subscriptions = [...await getSubscribedChannelIds(yt)];
    for (let i = 0; i < subscriptions.length; i += 50) {
      const channels = await yt.channels.list({ part: ["snippet", "contentDetails", "topicDetails"], id: subscriptions.slice(i, i + 50) });
      for (const channel of channels.data.items ?? []) {
        const meta = `${channel.snippet?.title} ${(channel.topicDetails?.topicCategories ?? []).join(" ")}`;
        if (!/christian|religion|bible|church|gospel|sermon|ministr|worship|jesus/i.test(meta)) continue;
        const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsId) continue;
        for (const item of await listPlaylistItems(yt, uploadsId, 15)) {
          const id = item.contentDetails?.videoId;
          if (id) origins.set(id, { topic: "Your subscribed faith channels", discovery: false, subscribed: true });
        }
      }
    }
  }
  return { origins, warnings };
}

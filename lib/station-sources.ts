import type { UserSettings } from "./config";
import type { TvProfile } from "./tv-profile";
import type { youtube_v3 } from "googleapis";
import { adminDb } from "./firebase";
import { getSubscribedChannelIds, readOptionalPlaylist, youtubeForUser } from "./google";
import { channelLookup, channelSourceKey } from "./channel-sources";
import { isStudioHandle } from "./studio-sources";
import { previewTitle, tvClipTitle, usTvNetworks } from "./tv-network-sources";

async function channelUploads(yt: youtube_v3.Youtube, channelId: string, uploads: string | null, label: string, warnings: string[]) {
  if (uploads) {
    const playlistWarnings: string[] = [];
    const items = await readOptionalPlaylist(yt, uploads, 30, playlistWarnings, label);
    if (!playlistWarnings.length && items.length) return items;
  }

  const result = await yt.search.list({ part: ["snippet"], channelId, type: ["video"], order: "date", maxResults: 24 });
  const items = (result.data.items ?? []).flatMap(item =>
    item.id?.videoId && item.snippet?.channelId === channelId
      ? [{ contentDetails: { videoId: item.id.videoId }, snippet: { title: item.snippet.title } }]
      : []
  );
  if (!items.length) warnings.push(`YouTube could not open ${label} and returned no public videos from that channel.`);
  return items;
}

export async function stationSources(user: UserSettings, profile: TvProfile) {
  const yt = youtubeForUser(user);
  const origins = new Map<string, { topic: string; discovery: boolean; subscribed?: boolean; officialTrailer?: boolean; officialNetwork?: boolean; officialChannelId?: string }>();
  const warnings: string[] = [];
  const selectedStudios = new Set((profile.studioHandles ?? []).map(channelSourceKey));
  const networks = new Set(usTvNetworks.map(source => channelSourceKey(source.handle)));
  const handles = new Map([...(profile.preferredHandles ?? []), ...(profile.studioHandles ?? [])].map(handle => [channelSourceKey(handle), handle]));
  const collect = async ([key, handle]: [string, string]) => {
    const cache = adminDb().collection("publicChannelCache").doc(key);
    let cached = (await cache.get()).data();
    if (!cached || cached.at < Date.now() - 7 * 86400000) {
      const result = await yt.channels.list({ part: ["id", "snippet", "contentDetails"], ...channelLookup(handle) });
      const channel = result.data.items?.[0];
      if (!channel?.id) { warnings.push(`YouTube could not find channel @${handle}.`); return; }
      cached = { id: channel.id, title: channel.snippet?.title ?? handle, uploads: channel.contentDetails?.relatedPlaylists?.uploads ?? null, at: Date.now() };
      await cache.set(cached);
    }
    for (const item of await channelUploads(yt, cached.id, cached.uploads, `uploads from @${handle}`, warnings)) {
      const id = item.contentDetails?.videoId;
      const selectedStudio = selectedStudios.has(key);
      const title = item.snippet?.title ?? "";
      if (id && (!selectedStudio || previewTitle.test(title) || tvClipTitle.test(title))) {
        const official = isStudioHandle(handle);
        origins.set(id, { topic: cached.title, discovery: false, officialTrailer: official && previewTitle.test(title), officialNetwork: networks.has(key), officialChannelId: official ? cached.id : undefined });
      }
    }
    if (selectedStudios.has(key) && isStudioHandle(handle)) {
      // Read publisher-owned production/trailer collections as well as uploads.
      // No fan-made playlist can acquire studio provenance through this path.
      let playlists = cached.productionPlaylists as { id: string; title: string }[] | undefined;
      if (!playlists || cached.previewPlaylistVersion !== 2 || (cached.playlistsAt ?? 0) < Date.now() - 7 * 86400000) {
        const result = await yt.playlists.list({ part: ["snippet"], channelId: cached.id, maxResults: 50 });
        playlists = (result.data.items ?? []).filter(item => item.id && item.snippet?.channelId === cached.id && /trailer|teaser|promo|preview|sneak peek|coming soon|new releases?|originals|upcoming/i.test(item.snippet?.title ?? ""))
          .sort((a, b) => Number(previewTitle.test(b.snippet?.title ?? "")) - Number(previewTitle.test(a.snippet?.title ?? "")))
          .slice(0, 2).map(item => ({ id: item.id!, title: item.snippet?.title ?? "" }));
        await cache.set({ productionPlaylists: playlists, playlistsAt: Date.now(), previewPlaylistVersion: 2 }, { merge: true });
      }
      for (const playlist of playlists) for (const item of await readOptionalPlaylist(yt, playlist.id, 12, warnings, `${cached.title}: ${playlist.title}`)) {
        const id = item.contentDetails?.videoId;
        const title = item.snippet?.title ?? "";
        if (id && item.snippet?.videoOwnerChannelId === cached.id && (previewTitle.test(title) || tvClipTitle.test(title))) origins.set(id, { topic: `${cached.title}: ${playlist.title}`, discovery: false, officialTrailer: previewTitle.test(title), officialNetwork: networks.has(key), officialChannelId: cached.id });
      }
    }
  };
  const selected = [...handles];
  for (let i = 0; i < selected.length; i += 8) {
    await Promise.all(selected.slice(i, i + 8).map(collect));
  }
  for (const source of profile.publisherSources ?? []) {
    const cache = adminDb().collection("publicChannelCache").doc(source.channelId);
    let channel = (await cache.get()).data();
    if (!channel?.id || channel.at < Date.now() - 7 * 86400000) {
      const response = await yt.channels.list({ part: ["id", "snippet", "contentDetails"], id: [source.channelId] });
      const actual = response.data.items?.[0];
      if (!actual?.id) { warnings.push(`The selected channel ${source.title} is unavailable.`); continue; }
      channel = { id: actual.id, title: actual.snippet?.title ?? source.title, uploads: actual.contentDetails?.relatedPlaylists?.uploads ?? null, at: Date.now() };
      await cache.set(channel);
    }
    for (const item of await channelUploads(yt, channel.id, channel.uploads, `uploads from ${source.title}`, warnings)) {
      const id = item.contentDetails?.videoId;
      const studio = isStudioHandle(source.channelId) || isStudioHandle(source.handle);
      const title = item.snippet?.title ?? "";
      if (id && (!studio || previewTitle.test(title) || tvClipTitle.test(title)) && !origins.has(id)) origins.set(id, { topic: channel.title, discovery: false, officialTrailer: studio && previewTitle.test(title), officialNetwork: networks.has(channel.id) || networks.has(channelSourceKey(source.handle)), officialChannelId: studio ? channel.id : undefined });
    }
  }
  if (profile.stationMode === "faith") {
    const subscriptions = [...await getSubscribedChannelIds(yt)];
    for (let i = 0; i < subscriptions.length; i += 50) {
      const channels = await yt.channels.list({ part: ["snippet", "contentDetails", "topicDetails"], id: subscriptions.slice(i, i + 50) });
      for (const channel of channels.data.items ?? []) {
        const meta = `${channel.snippet?.title} ${channel.snippet?.description?.slice(0, 500) ?? ""} ${(channel.topicDetails?.topicCategories ?? []).join(" ")}`;
        if (!/christian|bible|church|gospel|sermon|ministr|worship|jesus/i.test(meta)) continue;
        const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsId) continue;
        for (const item of await readOptionalPlaylist(yt, uploadsId, 15, warnings, "a subscribed faith channel's uploads")) {
          const id = item.contentDetails?.videoId;
          if (id) origins.set(id, { topic: "Your subscribed faith channels", discovery: false, subscribed: true });
        }
      }
    }
  }
  return { origins, warnings };
}

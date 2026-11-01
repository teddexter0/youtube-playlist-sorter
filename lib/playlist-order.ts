import { getVideos, listPlaylistItems, youtubeForUser } from "./google";
import { parseIsoDurationSeconds } from "./playlist";
export async function orderExistingQueue(yt: ReturnType<typeof youtubeForUser>, playlistId: string, items: Awaited<ReturnType<typeof listPlaylistItems>>, raw: Awaited<ReturnType<typeof getVideos>>) {
  const durations = new Map(raw.map((v) => [v.id, parseIsoDurationSeconds(v.contentDetails?.duration)]));
  const order = items.filter((item) => item.id && item.contentDetails?.videoId).map((item) => ({ id: item.id!, videoId: item.contentDetails!.videoId!, seconds: durations.get(item.contentDetails!.videoId!) ?? Number.MAX_SAFE_INTEGER }));
  const sorted = [...order].sort((a, b) => a.seconds - b.seconds);
  for (let i = 0; i < sorted.length; i++) {
    const current = order.findIndex((v) => v.id === sorted[i].id);
    if (current === i) continue;
    await yt.playlistItems.update({ part: ["snippet"], requestBody: { id: sorted[i].id, snippet: { playlistId, position: i, resourceId: { kind: "youtube#video", videoId: sorted[i].videoId } } } });
    order.splice(i, 0, ...order.splice(current, 1));
  }
  return [...durations.values()].sort((a, b) => a - b);
}


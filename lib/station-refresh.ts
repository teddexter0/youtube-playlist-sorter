import crypto from "crypto";
import { adminDb } from "./firebase";
import { youtubeForUser, listPlaylistItems } from "./google";
import type { StationKey } from "./station-rules";
import { rememberSeen } from "./station-history";
export type Playback = { seconds?: number; completed?: boolean };
type Queue = Awaited<ReturnType<typeof listPlaylistItems>>;
const maxTvQueueAge = 48 * 60 * 60000;
export function tvWatchGate(ids: string[], playback: Map<string, Playback>) {
  const unique = [...new Set(ids.filter(Boolean))];
  const watched = unique.filter(id => { const p = playback.get(id); return p?.completed || (p?.seconds ?? 0) >= 120; }).length;
  const required = Math.ceil(unique.length / 2);
  return { total: unique.length, watched, required, eligible: unique.length === 0 || watched >= required };
}
export async function recordPlayback(userId: string, videoId: string, seconds: number, eventId: string, completed = false) {
  const ref = adminDb().collection("users").doc(userId).collection("playback").doc(videoId);
  let result: Playback = {};
  await adminDb().runTransaction(async tx => {
    const prior = (await tx.get(ref)).data() ?? {};
    if ((prior.events ?? []).includes(eventId)) { result = prior; return; }
    result = { seconds: Math.min(86400, (prior.seconds ?? 0) + seconds), completed: Boolean(prior.completed || completed) };
    tx.set(ref, { ...result, events: [...(prior.events ?? []), eventId].slice(-30), at: new Date().toISOString() });
  });
  if (result.completed || (result.seconds ?? 0) >= 120) await rememberSeen(userId, [videoId], "playback");
  return result;
}
export async function prepareStationRefresh(userId: string, key: StationKey, items: Queue, cycleId?: string, now = Date.now(), forceRefresh = false) {
  const userRef = adminDb().collection("users").doc(userId);
  const marker = userRef.collection("stationRefresh").doc(key);
  const previous = (await marker.get()).data();
  const token = cycleId ?? crypto.randomUUID();
  if (previous?.phase === "filling") {
    const retiring = items.filter(item => previous.retiring?.includes(item.id));
    return { items: items.filter(item => !retiring.includes(item)), held: false, token: previous.cycleId as string, retiring, started: true };
  }
  if ((previous?.phase === "complete" && previous.cycleId === token) || (key !== "tv" && !cycleId)) {
    return { items, held: false, token: "", retiring: [], started: false };
  }
  const lastFilledAt = Math.max(previous?.at ?? 0, ...items.map(item => Date.parse(item.snippet?.publishedAt ?? "") || 0));
  const stale = lastFilledAt > 0 && now - lastFilledAt >= maxTvQueueAge;
  if (key === "tv" && items.length && previous?.phase !== "clearing" && !stale && !forceRefresh) {
    const ids = [...new Set(items.map(item => item.contentDetails?.videoId ?? "").filter(Boolean))];
    const [playback, watched] = await Promise.all([
      ids.length ? adminDb().getAll(...ids.map(id => userRef.collection("playback").doc(id))) : [],
      ids.length ? adminDb().getAll(...ids.map(id => userRef.collection("watched").doc(id))) : []
    ]);
    const states = new Map<string, Playback>(playback.map(doc => [doc.id, doc.data() ?? {}]));
    for (const doc of watched) if (doc.data()?.qualifiedWatch || doc.data()?.source === "watched") states.set(doc.id, { completed: true });
    const gate = tvWatchGate(ids, states);
    if (!gate.eligible) return { items, held: true, token: "", retiring: [], started: false, gate };
  }
  return { items: [], held: false, token, retiring: items, started: false };
}
export async function beginStationRefresh(userId: string, key: StationKey, token: string, retiring: Queue) {
  const ref = adminDb().collection("users").doc(userId).collection("stationRefresh").doc(key);
  await ref.set({ cycleId: token, phase: "filling", at: Date.now(), retiring: retiring.flatMap(item => item.id ? [item.id] : []) });
}
export async function finishStationRefresh(userId: string, key: StationKey, token: string, yt: ReturnType<typeof youtubeForUser>, retiring: Queue) {
  // Retire the prior entries only after the replacement has reached YouTube.
  for (const item of retiring) {
    if (!item.id) continue;
    try { await yt.playlistItems.delete({ id: item.id }); }
    catch (error) {
      const status = (error as { response?: { status?: number }; code?: number }).response?.status ?? (error as { code?: number }).code;
      if (status !== 404) throw error;
    }
  }
  const ref = adminDb().collection("users").doc(userId).collection("stationRefresh").doc(key);
  await adminDb().runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.cycleId === token) tx.set(ref, { cycleId: token, phase: "complete", at: Date.now() });
  });
}

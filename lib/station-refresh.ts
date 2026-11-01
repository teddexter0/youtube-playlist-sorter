import crypto from "crypto";
import { adminDb } from "./firebase";
import { youtubeForUser, listPlaylistItems } from "./google";
import type { StationKey } from "./station-rules";
import { rememberSeen } from "./station-history";
export type Playback = { seconds?: number; completed?: boolean };
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
export async function prepareStationRefresh(userId: string, key: StationKey, yt: ReturnType<typeof youtubeForUser>, items: Awaited<ReturnType<typeof listPlaylistItems>>, cycleId?: string) {
  const userRef = adminDb().collection("users").doc(userId);
  const marker = userRef.collection("stationRefresh").doc(key);
  const previous = (await marker.get()).data();
  const token = cycleId ?? (previous?.phase === "filling" && previous?.at > Date.now() - 10 * 60000 ? previous.cycleId : crypto.randomUUID());
  if (key === "tv" && previous?.phase === "filling") return { items, held: false, token: previous.cycleId as string };
  if (previous && previous.cycleId === token && ["filling", "complete"].includes(previous.phase)) return { items, held: false, token };
  if (key !== "tv" && !cycleId) return { items, held: false, token: "" };
  if (key === "tv" && items.length && previous?.phase !== "clearing") {
    const ids = [...new Set(items.map(item => item.contentDetails?.videoId ?? "").filter(Boolean))];
    const [playback, watched] = await Promise.all([
      ids.length ? adminDb().getAll(...ids.map(id => userRef.collection("playback").doc(id))) : [],
      ids.length ? adminDb().getAll(...ids.map(id => userRef.collection("watched").doc(id))) : []
    ]);
    const states = new Map<string, Playback>(playback.map(doc => [doc.id, doc.data() ?? {}]));
    for (const doc of watched) if (doc.data()?.qualifiedWatch || doc.data()?.source === "watched") states.set(doc.id, { completed: true });
    const gate = tvWatchGate(ids, states);
    if (!gate.eligible) return { items, held: true, token: "", gate };
  }
  await marker.set({ cycleId: token, phase: "clearing", at: Date.now() });
  // Keep the playlist identity/link; replace all its entries only at an authorized reset.
  for (const item of items) if (item.id) await yt.playlistItems.delete({ id: item.id });
  await marker.set({ cycleId: token, phase: "filling", at: Date.now() });
  return { items: [], held: false, token };
}
export async function finishStationRefresh(userId: string, key: StationKey, token: string) {
  if (!token) return;
  const ref = adminDb().collection("users").doc(userId).collection("stationRefresh").doc(key);
  await adminDb().runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.cycleId === token) tx.set(ref, { phase: "complete" }, { merge: true });
  });
}

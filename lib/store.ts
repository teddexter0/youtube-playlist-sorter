import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase";
import type { AppLog, ProcessedVideo, UserSettings } from "@/lib/config";

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const snap = await adminDb().collection("users").doc(userId).get();
  return snap.exists ? (snap.data() as UserSettings) : null;
}

export async function upsertUserSettings(userId: string, patch: Partial<UserSettings>) {
  const now = new Date().toISOString();
  const ref = adminDb().collection("users").doc(userId);
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    tx.set(ref, {
      ...(!existing.exists ? {
        userId,
        playlistIds: {},
        liveSortingEnabled: false,
        cleanupEnabled: false,
        cleanupMode: "age",
        excludedCleanupPlaylistKeys: ["newNj"],
        createdAt: now
      } : {}),
        ...patch,
        updatedAt: now
      },
      { merge: true });
  });
}

// Only these settings are safe to serialize into browser props/API responses.
export function publicUserSettings(user: UserSettings): UserSettings {
  return {
    userId: user.userId, email: user.email, playlistIds: user.playlistIds,
    liveSortingEnabled: user.liveSortingEnabled, sortingDryRunCompletedAt: user.sortingDryRunCompletedAt,
    cleanupEnabled: user.cleanupEnabled, cleanupDryRunCompletedAt: user.cleanupDryRunCompletedAt,
    cleanupMode: user.cleanupMode, excludedCleanupPlaylistKeys: user.excludedCleanupPlaylistKeys,
    lastCleanupAt: user.lastCleanupAt, createdAt: user.createdAt, updatedAt: user.updatedAt,
    tv: user.tv
  };
}

export async function storeRefreshToken(userId: string, encryptedRefreshToken: string) {
  await adminDb()
    .collection("users")
    .doc(userId)
    .set({ encryptedRefreshToken, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function getAllUsersForSorting(): Promise<UserSettings[]> {
  const snap = await adminDb().collection("users").where("liveSortingEnabled", "==", true).get();
  return snap.docs.map((doc) => doc.data() as UserSettings);
}

export async function getAllUsersForCleanup(): Promise<UserSettings[]> {
  const snap = await adminDb().collection("users").where("cleanupEnabled", "==", true).get();
  return snap.docs.map((doc) => doc.data() as UserSettings);
}

export async function getProcessedVideo(userId: string, videoId: string) {
  const snap = await adminDb()
    .collection("users")
    .doc(userId)
    .collection("processedVideos")
    .doc(videoId)
    .get();
  return snap.exists ? (snap.data() as ProcessedVideo) : null;
}

export async function saveProcessedVideo(userId: string, video: ProcessedVideo) {
  await adminDb()
    .collection("users")
    .doc(userId)
    .collection("processedVideos")
    .doc(video.videoId)
    .set(video, { merge: true });
}

export async function getProcessedForCleanup(userId: string, cutoffIso: string) {
  const snap = await adminDb()
    .collection("users")
    .doc(userId)
    .collection("processedVideos")
    .where("status", "==", "processed")
    .where("addedToTargetAt", "<=", cutoffIso)
    .get();
  return snap.docs.map((doc) => doc.data() as ProcessedVideo);
}

export async function appendLog(log: AppLog) {
  await adminDb()
    .collection("users")
    .doc(log.userId)
    .collection("logs")
    .add(log);
}

export async function getLogs(userId: string, limit = 100) {
  const snap = await adminDb()
    .collection("users")
    .doc(userId)
    .collection("logs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as AppLog) }));
}

export async function getProcessedList(userId: string, limit = 100) {
  const snap = await adminDb()
    .collection("users")
    .doc(userId)
    .collection("processedVideos")
    .orderBy("classifiedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((doc) => doc.data() as ProcessedVideo);
}

export async function cacheTargetPlaylist(userId: string, playlistId: string, videoIds: string[]) {
  await adminDb()
    .collection("users")
    .doc(userId)
    .collection("targetPlaylistCache")
    .doc(playlistId)
    .set({
      playlistId,
      videoIds,
      lastFetchedAt: new Date().toISOString(),
      count: videoIds.length
    });
}

export async function touchCleanup(userId: string) {
  await adminDb().collection("users").doc(userId).update({
    lastCleanupAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp()
  });
}

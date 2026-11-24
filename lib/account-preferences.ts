import crypto from "crypto";
import type { UserSettings } from "./config";
import { personalVersion, stationProfiles } from "./station-presets";
import type { TvProfile } from "./tv-profile";

// A one-time, non-destructive account-settings repair. No YouTube API calls,
// playlist creation, playback or refresh is performed by this function.
export function accountPreferencesPatch(user: UserSettings, ownerEmail: string, raw: string): Partial<UserSettings> | null {
  if (!ownerEmail || !raw || user.email?.toLowerCase() !== ownerEmail.toLowerCase() || (user.personalStationVersion ?? 0) >= personalVersion) return null;
  let profiles: ReturnType<typeof stationProfiles>;
  try {
    const preferences = JSON.parse(raw) as Partial<TvProfile> & { childhood?: Partial<TvProfile> };
    profiles = stationProfiles(user, true, preferences);
  } catch {
    // Optional personalisation must never prevent Google login.
    console.warn("Account preferences were not applied: invalid configuration.");
    return null;
  }
  const tv = { ...profiles.tv, liveEnabled: user.tv?.liveEnabled ?? false };
  profiles.tv = tv;
  const { liveEnabled: _live, ...settings } = tv;
  return {
    schemaVersion: 1,
    tv, stationProfiles: profiles, personalStationVersion: personalVersion,
    tvPreviewHash: crypto.createHash("sha256").update(JSON.stringify(settings)).digest("hex"),
    updatedAt: new Date().toISOString()
  };
}

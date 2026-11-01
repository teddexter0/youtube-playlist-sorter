import { tvProfileSchema, type TvProfile } from "./tv-profile";
import type { UserSettings } from "./config";
import type { StationKey } from "./station-rules";
export const personalVersion = 3;
export function stationProfiles(user: UserSettings, owner = false, preferences: Partial<TvProfile> = {}): Record<StationKey, TvProfile> {
  const personal = tvProfileSchema.parse(preferences);
  const tv = tvProfileSchema.parse({ ...user.tv, ...(owner ? { interests: personal.interests, preferredHandles: personal.preferredHandles, favoriteCelebrities: [...new Set([...(user.tv?.favoriteCelebrities ?? []), ...personal.favoriteCelebrities])], franchises: personal.franchises, mandatoryDaily: true, allowClassicFootball: true, footballFocus: "european-world-cup", monthlyMotorsport: true, archivePercent: 10 } : {}), strictComfort: true, durationOrder: true, rollingQueue: true, liveEnabled: true });
  const side = (key: StationKey, interests: string[], handles: string[] = []) => tvProfileSchema.parse({ stationMode: key, playlistId: user.stationProfiles?.[key]?.playlistId ?? (key === "faith" ? user.playlistIds.newNj : "") ?? "", interests, preferredHandles: handles, durationOrder: true, rollingQueue: true, lightViewing: false, sharedTv: true, maxVideoMinutes: key === "faith" || key === "lifeskills" ? 90 : 40, sessionMinutes: 120, discoveryPercent: 0, liveEnabled: true });
  return {
    tv,
    childhood: side("childhood", ["Disney Channel childhood shows cast recaps", "Nickelodeon childhood shows cast recaps"]),
    faith: side("faith", ["Christian sermons from subscriptions"]),
    popculture: side("popculture", ["celebrity pop culture weekly recap", "fashion red carpet awards weekly recap"]),
    lifeskills: side("lifeskills", ["first aid swimming survival practical skills evidence explained", "sleep nutrition cooking hygiene practical evidence explained", "etiquette insurance therapy practical philosophy life skills", "skin care hormones bone health evidence explained"], ["MayoClinic", "ClevelandClinic", "AmericanRedCross", "TEDEd"])
  };
}

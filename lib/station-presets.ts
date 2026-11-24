import { defaultSessionMinutes, tvProfileSchema, type TvProfile } from "./tv-profile";
import type { UserSettings } from "./config";
import type { StationKey } from "./station-rules";
import { studioSources } from "./studio-sources";
export const personalVersion = 5;
export function stationProfiles(user: UserSettings, owner = false, preferences: Partial<TvProfile> & { childhood?: Partial<TvProfile> } = {}): Record<StationKey, TvProfile> {
  const personal = tvProfileSchema.parse(preferences);
  const tv = tvProfileSchema.parse({ ...user.tv, ...(owner ? {
    interests: [...new Set([...(user.tv?.interests ?? []), ...personal.interests])].slice(0, 60),
    preferredHandles: [...new Set([...(user.tv?.preferredHandles ?? []), ...personal.preferredHandles])].slice(0, 40),
    studioHandles: [...new Set([...(user.tv?.studioHandles ?? []), ...studioSources.map(source => source.handle)])].slice(0, 40),
    favoriteCelebrities: [...new Set([...(user.tv?.favoriteCelebrities ?? []), ...personal.favoriteCelebrities])].slice(0, 500),
    franchises: [...new Set([...(user.tv?.franchises ?? []), ...personal.franchises])].slice(0, 200),
    excludeHorror: true, mandatoryDaily: true, allowClassicFootball: true, footballFocus: "european-world-cup", monthlyMotorsport: true
  } : {}), strictComfort: owner ? true : user.tv?.strictComfort ?? false, durationOrder: true, rollingQueue: true, liveEnabled: true });
  const side = (key: StationKey, interests: string[], handles: string[] = []) => tvProfileSchema.parse({ stationMode: key, playlistId: user.stationProfiles?.[key]?.playlistId ?? (key === "faith" ? user.playlistIds.newNj : "") ?? "", interests, preferredHandles: handles, durationOrder: true, rollingQueue: true, lightViewing: false, sharedTv: true, maxVideoMinutes: key === "faith" || key === "lifeskills" ? 90 : 40, sessionMinutes: 120, discoveryPercent: 0, liveEnabled: true });
  return {
    tv,
    childhood: tvProfileSchema.parse({ ...side("childhood", []), ...(owner ? preferences.childhood : {}), sessionMinutes: defaultSessionMinutes, maxVideoMinutes: 480, ...user.stationProfiles?.childhood, stationMode: "childhood", lightViewing: false, durationOrder: true, rollingQueue: true, liveEnabled: true }),
    faith: tvProfileSchema.parse({ ...side("faith", owner ? ["Christian sermons from subscriptions"] : []), ...user.stationProfiles?.faith }),
    popculture: tvProfileSchema.parse({ ...side("popculture", owner ? ["celebrity pop culture weekly recap", "fashion red carpet awards weekly recap"] : []), ...user.stationProfiles?.popculture }),
    lifeskills: tvProfileSchema.parse({ ...side("lifeskills", owner ? ["first aid swimming survival practical skills evidence explained", "sleep nutrition cooking hygiene practical evidence explained", "etiquette insurance therapy practical philosophy life skills", "skin care hormones bone health evidence explained"] : [], owner ? ["MayoClinic", "ClevelandClinic", "AmericanRedCross", "TEDEd"] : []), ...user.stationProfiles?.lifeskills }),
    ...Object.fromEntries((["custom1", "custom2", "custom3"] as const).map(key => [key, tvProfileSchema.parse({ ...user.stationProfiles?.[key], stationMode: "tv", durationOrder: true, rollingQueue: true })])) as Record<"custom1" | "custom2" | "custom3", TvProfile>
  };
}

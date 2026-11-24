import { channelSourceKey } from "./channel-sources";
import { usTvNetworks } from "./tv-network-sources";

// Keep these selection keys compatible with saved studio preferences.
export const studioSources = [
  { name: "HBO", handle: "HBO" },
  { name: "HBO Max", handle: "hbomax" },
  { name: "Paramount Pictures", handle: "ParamountPictures" },
  { name: "Paramount+", handle: "paramountplus" },
  { name: "Apple TV", handle: "AppleTV" },
  { name: "Hulu", handle: "hulu" },
  { name: "Disney+", handle: "DisneyPlus" },
  { name: "Walt Disney Studios", handle: "WaltDisneyStudios" },
  { name: "Universal Pictures", handle: "UniversalPictures" },
  { name: "Netflix", handle: "Netflix" },
  { name: "DreamWorks Animation", handle: "Dreamworks" },
  { name: "Warner Bros. Pictures", handle: "WarnerBrosPictures" },
  { name: "Sky TV", handle: "SkyTV" },
  { name: "Prime Video", handle: "PrimeVideo" },
  { name: "Sony Pictures", handle: "SonyPictures" },
  { name: "20th Century Studios", handle: "20thCenturyStudios" },
  { name: "Lionsgate", handle: "LionsgateMovies" },
  { name: "A24", handle: "A24" },
  { name: "Pixar", handle: "pixar" },
  { name: "Peacock", handle: "peacock" },
  ...usTvNetworks
] as const;

export function isStudioHandle(handle: string) {
  const key = channelSourceKey(handle);
  return studioSources.some(source => channelSourceKey(source.handle) === key);
}
export const studioDomains: Record<string, string> = {
  HBO: "hbo.com", hbomax: "hbomax.com", ParamountPictures: "paramountpictures.com", paramountplus: "paramountplus.com",
  AppleTV: "tv.apple.com", hulu: "hulu.com", DisneyPlus: "disneyplus.com", WaltDisneyStudios: "disney.com",
  UniversalPictures: "universalpictures.com", Netflix: "netflix.com", Dreamworks: "dreamworks.com", WarnerBrosPictures: "warnerbros.com",
  SkyTV: "sky.com", PrimeVideo: "primevideo.com", SonyPictures: "sonypictures.com", "20thCenturyStudios": "20thcenturystudios.com",
  LionsgateMovies: "lionsgate.com", A24: "a24films.com", pixar: "pixar.com", peacock: "peacocktv.com"
};

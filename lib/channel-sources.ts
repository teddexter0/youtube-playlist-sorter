import { usTvNetworks } from "./tv-network-sources";

// Public channel IDs keep existing station settings working when handles change.
const channelSources = [
  ...usTvNetworks.flatMap(source => "id" in source ? [{ id: source.id, handles: [source.handle.toLowerCase()] }] : []),
  { id: "UC415bOPUcGSamy543abLmRA", handles: ["cleoabram"] },
  { id: "UCY1kMZp36IQSyNx_9h4mpCg", handles: ["markrober"] },
  { id: "UCRijo3ddMTht_IHyNSNXpNQ", handles: ["dudeperfect"] },
  { id: "UC6107grRI4m0o2-emgoDnAA", handles: ["smartereveryday"] },
  { id: "UCUHW94eEFW7hkUMVaZz4eDg", handles: ["theslowmoguys"] },
  { id: "UCj1VqrHhDte54oLgPG4xpuQ", handles: ["stuffmadehere"] },
  { id: "UCsooa4yRKGN_zEE8iknghZA", handles: ["teded"] },
  { id: "UCAuUUnT6oDeKwE6v1NGQxug", handles: ["ted"] },
  { id: "UCZYTClx2T1of7BRZ86-8fow", handles: ["scishow"] },
  { id: "UC7IcJI8PUf5Z3zKxnZvTBog", handles: ["theschooloflifetv", "theschooloflife"] },
  { id: "UC-RKpEc4eE9PwJaupN91xYQ", handles: ["sprouts"] },
  { id: "UC0aMPje3ZACnQPKM_qzY0vw", handles: ["americanredcross", "redcross"] },
  { id: "UC8fQzKHIhSoZeSq3bwQx4mw", handles: ["mayoclinic"] },
  { id: "UCjDsbbzHgTrGc4Ff26TJtsA", handles: ["enews"] },
  { id: "UCGbQJy-531_5vfphay-rChQ", handles: ["people"] },
  { id: "UCdtXPiqI2cLorKaPrfpKc4g", handles: ["entertainmenttonight"] },
  { id: "UCiKGMZZmZXK-RpbKJGXgH3Q", handles: ["accesshollywood"] },
  { id: "UCZ8Sxmkweh65HetaZfR8YuA", handles: ["hollywoodreporter"] },
  { id: "UCIsbLox_y9dCIMLd8tdC6qg", handles: ["vanityfair"] },
  { id: "UC_5niPa-d35gg88HaS7RrIw", handles: ["waltdisneystudios", "disneymovietrailers", "disney"] },
  { id: "UCcvM7fNSMn9Qm3BZnKTK8oQ", handles: ["wrestlinggifs", "wrestlingifs"] },
  { id: "UCqBJ47FjJcl61fmSbcadAVg", handles: ["ntvkenya", "ntvkenyaonline"] },
  { id: "UCKVsdeoHExltrWMuK0hOWmg", handles: ["ktnnewskenya", "ktnnews_kenya"] },
  { id: "UCjmJDM5pRKbUlVIzDYYWb6g", handles: ["warnerbrospictures", "warnerbros"] },
  { id: "UCia2_wzvSZrQBzbopXT1Fcg", handles: ["dreamworks", "dreamworksanimationstudio"] }
];

export const popCulturePublishers = ["ENews", "People", "EntertainmentTonight", "AccessHollywood", "HollywoodReporter", "VanityFair"] as const;
export const lifeSkillsPublishers = ["RedCross", "MayoClinic", "ClevelandClinic", "TEDEd", "TED", "SciShow", "AsapSCIENCE", "Sprouts", "TheSchoolOfLifeTV", "BrightSideOfficial"] as const;
export const tvFavoriteCreators = ["CleoAbram", "MarkRober", "DudePerfect"] as const;
export const tvDiscoveryCreators = ["SmarterEveryDay", "TheSlowMoGuys", "StuffMadeHere", "SimoneGiertz", "TomScottGo", "Tested", "JetLagTheGame", "HowRidiculous"] as const;
export const localNewsPublishers = ["NTVKenya", "KTNNewsKenya", "CitizenTVKenya", "KBCChannel1", "K24TV", "TV47Kenya", "KenyansCoKe"] as const;

export function channelSourceKey(handle: string) {
  const input = handle.trim().replace(/^@/, "");
  if (/^UC[\w-]{22}$/.test(input)) return input;
  const normalized = input.toLowerCase();
  return channelSources.find(source => source.handles.includes(normalized))?.id ?? normalized;
}

export function channelLookup(handle: string) {
  const key = channelSourceKey(handle);
  return /^UC[\w-]{22}$/.test(key) ? { id: [key] } : { forHandle: handle.trim().replace(/^@/, "") };
}

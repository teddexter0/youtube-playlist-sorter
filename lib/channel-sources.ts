import { usTvNetworks } from "./tv-network-sources";

// Public channel IDs keep existing station settings working when handles change.
const channelSources = [
  ...usTvNetworks.flatMap(source => "id" in source ? [{ id: source.id, handles: [source.handle.toLowerCase()] }] : []),
  { id: "UC_5niPa-d35gg88HaS7RrIw", handles: ["waltdisneystudios", "disneymovietrailers", "disney"] },
  { id: "UCcvM7fNSMn9Qm3BZnKTK8oQ", handles: ["wrestlinggifs", "wrestlingifs"] },
  { id: "UCqBJ47FjJcl61fmSbcadAVg", handles: ["ntvkenya", "ntvkenyaonline"] },
  { id: "UCKVsdeoHExltrWMuK0hOWmg", handles: ["ktnnewskenya", "ktnnews_kenya"] },
  { id: "UCjmJDM5pRKbUlVIzDYYWb6g", handles: ["warnerbrospictures", "warnerbros"] },
  { id: "UCia2_wzvSZrQBzbopXT1Fcg", handles: ["dreamworks", "dreamworksanimationstudio"] }
];

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

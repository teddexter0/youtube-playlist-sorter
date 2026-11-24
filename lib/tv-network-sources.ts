export const usTvNetworks = [
  { name: "ABC", handle: "ABCNetwork", id: "UC_IpSl6O_-IRAA6fiNs05Gg" },
  { name: "NBC", handle: "NBC", id: "UCccjdJEay2hpb5scz61zY6Q" },
  { name: "CBS", handle: "CBS", id: "UClzCn8DxRSCuMFv_WfzkcrQ" },
  { name: "FOX", handle: "FOXTV", id: "UCDiPds0v60wueil5B8w3fPQ" },
  { name: "The CW", handle: "TheCW", id: "UCPWQWav6BpPvtanCtloXkiw" },
  { name: "FX", handle: "FXNetworks", id: "UC2dIDJBf9W88PxGm-uHZPaQ" },
  { name: "PBS", handle: "PBS", id: "UCgyeJxD05YnoDquRMNBfBqw" },
  { name: "TBS", handle: "TBS" },
  { name: "TNT", handle: "TNT", id: "UC1DZpQ2DDExws9Zvl7UcSkg" },
  { name: "USA Network", handle: "USANetwork", id: "UCelOndCT8F0OmX1Hsph5vnQ" },
  { name: "Comedy Central", handle: "ComedyCentral", id: "UCUsN5ZwHx2kILm84-jPDeXw" },
  { name: "HGTV", handle: "HGTV", id: "UCBiuljj5uaUVHbnTAzfvutg" },
  { name: "Food Network", handle: "FoodNetwork", id: "UC8Y-jrV8oR3s2Ix4viDkZtA" },
  { name: "HISTORY", handle: "HISTORY", id: "UC9MAhZQQd9egwWCxrwSIsJQ" },
  { name: "Nickelodeon", handle: "Nickelodeon" },
  { name: "Cartoon Network", handle: "CartoonNetwork" },
  { name: "Disney Channel", handle: "DisneyChannel", id: "UCktaw9L-f65LzUUdjmCFkbQ" },
] as const;

export const previewTitle = /\b(trailers?|teasers?|promos?|first look|sneak peek|official preview|season preview|series preview|next episode|coming soon)\b/i;
export const tvClipTitle = /\b(official clip|movie clip|full scene|best moments|throwback|highlights?|behind the scenes|cast interview|cold open|monologue|performance|top \d+)\b/i;

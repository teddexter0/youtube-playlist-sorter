export function publisherTheme(identity: string) {
  const key = identity.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known: [RegExp, string, string][] = [
    [/netflix|lionsgate/, "#ffe1e3", "#ffb8c1"], [/hbo|max|peacock/, "#e8e0ff", "#c6b3fa"],
    [/paramount|disney|warner|sky/, "#dfeaff", "#accfff"], [/hulu/, "#dcfce8", "#a9ebbd"],
    [/apple|a24|sony/, "#e5e7ec", "#c6d1dc"], [/universal|prime|dreamworks|pixar/, "#dcf5f7", "#9edce6"]
  ];
  const match = known.find(([pattern]) => pattern.test(key));
  if (match) return { "--publisher-bg": match[1], "--publisher-hover": match[2] };
  const hue = [...key].reduce((n, char) => (n * 31 + char.charCodeAt(0)) % 360, 0);
  return { "--publisher-bg": `hsl(${hue} 55% 92%)`, "--publisher-hover": `hsl(${hue} 60% 80%)` };
}

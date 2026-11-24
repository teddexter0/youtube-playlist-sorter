// Match the user's own title catalogue, never a broad "children's videos" label.
export function normaliseTitle(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function matchesChildhoodTitle(title: string, catalogue: string[]) {
  const text = ` ${normaliseTitle(title)} `;
  return catalogue.some(name => {
    const normal = normaliseTitle(name);
    return normal.length >= 3 && text.includes(` ${normal} `);
  });
}

export function isNostalgiaVideo(video: { title: string; channelTitle: string }, catalogue: string[]) {
  if (!matchesChildhoodTitle(video.title, catalogue)) return false;
  // Retrospectives about a listed childhood show are distinct from nursery
  // programmes, preschool lessons and unrelated algorithmic kids compilations.
  if (/\b(nursery rhymes?|learn (?:the )?(?:abc|alphabet|numbers|colou?rs)|for toddlers|for babies|preschool learning|cocomelon|baby shark)\b/i.test(video.title)) return false;
  return /\b(recaps?|retrospective|entire story|full story|complete story|timeline|explained|lore|history|remember|nostalgia|throwback|rise|fall|review|reunion|cast|best moments|funny moments|iconic moments|full scene|official clip|compilation|deep dive|iceberg|cancelled|canceled|ibinged)\b|\b(?:beginning|start)\b.*\bend\b|\bwhat was\b|\bwas\b.*\b(weird|insane|crazy|craziest|dumb|disaster)\b/i.test(video.title);
}

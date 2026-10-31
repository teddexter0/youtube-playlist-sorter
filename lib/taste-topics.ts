type TopicSource = { topicDetails?: { topicCategories?: string[] | null } | null };

// YouTube supplies topic-category URLs; no page fetching or profile guessing.
export function deriveTasteTopics(sources: TopicSource[], channelNames: string[] = []) {
  const scores = new Map<string, number>();
  for (const source of sources) {
    for (const category of source.topicDetails?.topicCategories ?? []) {
      try {
        const url = new URL(category);
        if (url.hostname !== "en.wikipedia.org" || !url.pathname.startsWith("/wiki/")) continue;
        const topic = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ").trim();
        if (topic.length >= 2 && topic.length <= 100) scores.set(topic, (scores.get(topic) ?? 0) + 1);
      } catch { /* Ignore malformed metadata. */ }
    }
  }
  const broad = new Set(["Entertainment", "Lifestyle (sociology)", "Society", "Knowledge"]);
  const topics = [...scores].sort((a, b) => Number(broad.has(a[0])) - Number(broad.has(b[0])) || b[1] - a[1]).map(([topic]) => topic);
  if (!topics.length) topics.push(...channelNames.map((name) => name.trim()).filter((name) => name.length >= 2 && name.length <= 100));
  return [...new Set(topics)].slice(0, 12);
}

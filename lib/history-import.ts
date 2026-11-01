// Read only YouTube video IDs; original Takeout file contents never leave the browser.
export function watchedIdsFromExport(text: string) {
  const ids = new Set<string>();
  for (const match of text.matchAll(/(?:youtube\.com\/watch\?(?:[^\s"<>]*?&(?:amp;)?)?v=|youtu\.be\/)([\w-]{11})/g)) ids.add(match[1]);
  return [...ids];
}
export function namesFromImdbCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quote = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i] ?? "\n";
    if (char === '"' && text[i+1] === '"' && quote) { cell += '"'; i++; }
    else if (char === '"') quote = !quote;
    else if ((char === "," || char === "\n") && !quote) { row.push(cell.replace(/\r$/, "")); cell = ""; if (char === "\n") { rows.push(row); row = []; } }
    else cell += char;
  }
  const column = rows[0]?.findIndex(value => /^(name|primary name|title)$/i.test(value.trim().replace(/^\uFEFF/,""))) ?? -1;
  if (column < 0) return [];
  return [...new Set(rows.slice(1).map(row => row[column]?.trim()).filter((name): name is string => Boolean(name && name.length >= 2 && name.length <= 80)))].slice(0, 100);
}

"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import type { TvProfile } from "@/lib/tv-profile";
import { publisherTheme } from "@/lib/publisher-theme";
import StudioLogo from "./StudioLogo";
type Publisher = TvProfile["publisherSources"][number];
export default function PublisherPicker({ selected, onChange, legacy = [], onRemoveLegacy }: { selected: Publisher[]; onChange: (value: Publisher[]) => void; legacy?: { name: string; handle: string }[]; onRemoveLegacy: (handle: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Publisher[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function search() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({action:"search-publishers",query}) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Search failed."); setResults(data.publishers); if (!data.publishers.length) setMessage("No channel found. Try the exact YouTube handle or another name."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Search failed."); } finally { setBusy(false); }
  }
  return <details id="publisher-picker" className="studio-picker"><summary>My publishers &amp; channels</summary><p>Which publishers would you like in your mix? Type a name or YouTube handle. Your selected sources supply trailers and scene clips; your other interests still contribute.</p>
    <div className="toolbar"><label>Find a publisher<input maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a publisher, studio or YouTube handle" /></label><button className="secondary" disabled={busy || query.trim().length < 2} onClick={search}>{busy ? "Searching." : "Find channels"}</button></div>
    <p role="status">{message}</p>
    {results.length ? <p>Check the channel identity before choosing. A search result is not a verification badge.</p> : null}
    <div className="publisher-results">{results.map(source => <article className="publisher-card" key={source.channelId} style={publisherTheme(source.handle || source.title) as CSSProperties}>{source.thumbnail ? <Image src={source.thumbnail} width={56} height={56} unoptimized alt="" /> : null}<h3>{source.title}</h3><p>{source.handle}</p><p>{source.description.slice(0, 220)}</p><a href={`https://www.youtube.com/channel/${source.channelId}`} target="_blank" rel="noreferrer">Inspect channel ?</a><button className="secondary" disabled={selected.some(s => s.channelId === source.channelId) || selected.length >= 40} onClick={() => onChange([...selected, source])}>{selected.some(s => s.channelId === source.channelId) ? "Selected" : "Choose this source"}</button></article>)}</div>
    {selected.length ? <><h3>Your sources</h3><div className="publisher-results">{selected.map(source => <article className="publisher-card" key={source.channelId} style={publisherTheme(source.handle || source.title) as CSSProperties}>{source.thumbnail ? <Image src={source.thumbnail} width={48} height={48} unoptimized alt="" /> : null}<h3>{source.title}</h3><p>{source.description.slice(0, 140)}</p><button className="text-button" onClick={() => onChange(selected.filter(s => s.channelId !== source.channelId))}>Remove source</button></article>)}</div></> : !legacy.length ? <p>No publishers selected. This list starts empty for each new account.</p> : null}
    {legacy.length ? <><h3>Your existing saved publishers</h3><div className="publisher-results">{legacy.map(source => <article className="publisher-card" key={source.handle} style={publisherTheme(source.handle) as CSSProperties}><StudioLogo handle={source.handle} name={source.name} /><button className="text-button" onClick={() => onRemoveLegacy(source.handle)}>Remove source</button></article>)}</div></> : null}
    <small>Save your house rules to keep these choices. Search runs only when you press Find channels.</small>
  </details>;
}

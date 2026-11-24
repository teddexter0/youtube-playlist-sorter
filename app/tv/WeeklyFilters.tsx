"use client";

import { useState } from "react";
import { stationFilterSchema, type StationFilters, type TvProfile } from "@/lib/tv-profile";
import ViewingToggles from "./ViewingToggles";

export default function WeeklyFilters({ name, profile, aiAvailable, busy, onSave }: {
  name: string; profile: TvProfile; aiAvailable: boolean; busy: boolean;
  onSave: (filters: StationFilters) => Promise<boolean>;
}) {
  const [filters, setFilters] = useState(() => stationFilterSchema.parse(profile));
  const [avoid, setAvoid] = useState(profile.avoid.join("\n"));
  const [status, setStatus] = useState("");
  const patch = (value: Partial<StationFilters>) => { setFilters(current => ({ ...current, ...value })); setStatus(""); };

  async function save() {
    const parsed = stationFilterSchema.safeParse({ ...filters, avoid: avoid.split("\n").map(line => line.trim()).filter(Boolean) });
    if (!parsed.success) { setStatus("Check the limits and use up to 30 hard passes of 2-100 characters each."); return; }
    if (await onSave(parsed.data)) setStatus("Saved for this playlist's next hunt.");
  }

  return <details className="tuning-drawer">
    <summary>{name} filters</summary>
    <fieldset disabled={busy}>
      <legend>Viewing criteria</legend>
      <ViewingToggles filters={filters} aiAvailable={aiAvailable} onChange={patch} />
      <div className="grid">
        <label>Time per update <input type="range" min={15} max={720} step={15} value={filters.sessionMinutes} onChange={event => patch({ sessionMinutes: Number(event.target.value) })} /><strong>{filters.sessionMinutes} minutes</strong></label>
        <label>Longest video in minutes<input type="number" min={2} max={480} value={filters.maxVideoMinutes} onChange={event => patch({ maxVideoMinutes: Number(event.target.value) })} /></label>
        <label>Max per topic<input type="number" min={1} max={4} value={filters.maxPerTopic} onChange={event => patch({ maxPerTopic: Number(event.target.value) })} /></label>
      </div>
      <label>Hard passes<textarea rows={3} value={avoid} onChange={event => { setAvoid(event.target.value); setStatus(""); }} /><small>One phrase per line. Matches in video metadata are excluded.</small></label>
      <p className="fineprint">AI is optional. If enabled, it sends your interests, filters and candidate metadata to the configured AI provider and may incur provider charges.</p>
      <button className="secondary" onClick={() => void save()}>Save {name} filters</button>
      <p role="status">{status}</p>
    </fieldset>
  </details>;
}

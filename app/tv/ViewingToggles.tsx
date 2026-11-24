"use client";

import type { StationFilters } from "@/lib/tv-profile";

const toggles = [
  ["lightViewing", "Keep it light"],
  ["sharedTv", "Shared-room screening"],
  ["excludeHorror", "Exclude horror"],
  ["useYouTubeLikes", "Learn from my likes"],
  ["aiEnabled", "Optional AI taste check"]
] as const;
type Toggle = (typeof toggles)[number][0];

export default function ViewingToggles({ filters, aiAvailable, onChange }: {
  filters: Pick<StationFilters, Toggle>; aiAvailable: boolean; onChange: (patch: Partial<StationFilters>) => void;
}) {
  return <div className="toggle-grid">{toggles.map(([key, label]) => (
    <label className="checkbox" key={key}>
      <input type="checkbox" checked={filters[key]}
        disabled={key === "aiEnabled" && !aiAvailable && !filters[key]}
        onChange={event => onChange({ [key]: event.target.checked })} />
      {label}{key === "aiEnabled" && !aiAvailable ? " (unavailable)" : ""}
    </label>
  ))}</div>;
}

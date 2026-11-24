"use client";
import { useState } from "react";
import { footballLeagues } from "@/lib/football-leagues";
export default function FootballPicker({ selected, extra, onChange }: { selected: string[]; extra: string[]; onChange: (selected: string[], extra: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState(extra.join("\n"));
  return <details id="league-options" className="league-picker"><summary>Football leagues &amp; competitions <span>{selected.length} selected</span></summary><p>Choose any combination. Add an unlisted competition, national team or club below. Selections rotate between hunts; existing interests still contribute.</p>
    <label>Find a league<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leagues and competitions" /></label>
    {footballLeagues.map(([region, leagues]) => { const visible = leagues.filter(name => name.toLowerCase().includes(search.toLowerCase())); return visible.length ? <fieldset key={region}><legend>{region}</legend><div className="sport-toggles">{visible.map(name => <label className="checkbox" key={name}><input type="checkbox" checked={selected.includes(name)} onChange={e => onChange(e.target.checked ? [...selected, name] : selected.filter(value => value !== name), extra)} />{name}</label>)}</div></fieldset> : null; })}
    <label>More leagues, clubs or national teams<textarea rows={3} value={custom} placeholder="Any other competition or team, one per line" onChange={e => { setCustom(e.target.value); onChange(selected, e.target.value.split("\n").map(s => s.trim()).filter(Boolean)); }} /></label>
  </details>;
}

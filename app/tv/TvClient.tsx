"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { defaultTvProfile, categoryForVideo, laneLabels, isArchive, type StationFilters, type TvProfile } from "@/lib/tv-profile";
import type { TvRun } from "@/lib/tv";
import StationPlayer from "./StationPlayer";
import ChannelManager from "./ChannelManager";
import PublisherPicker from "./PublisherPicker";
import FootballPicker from "./FootballPicker";
import AutomaticStatus from "./AutomaticStatus";
import ViewingToggles from "./ViewingToggles";
import WeeklyFilters from "./WeeklyFilters";
import { studioSources } from "@/lib/studio-sources";
import { sports } from "@/lib/sports";
import { watchedIdsFromExport, namesFromImdbCsv } from "@/lib/history-import";
import { stationNames, type StationKey } from "@/lib/station-rules";

export default function TvClient({ initialProfile, aiAvailable, email, autopilot = false, stations, personal = false, personalDaily = false, enabledStations = ["tv"] }: { initialProfile: TvProfile; aiAvailable: boolean; email?: string; autopilot?: boolean; stations?: Partial<Record<StationKey, TvProfile>>; personal?: boolean; personalDaily?: boolean; enabledStations?: StationKey[] }) {
  const router = useRouter();
  const [savedStations, setSavedStations] = useState(stations);
  const [activeStations, setActiveStations] = useState(enabledStations);
  const [profile, setProfile] = useState({ ...defaultTvProfile, ...initialProfile });
  const [interests, setInterests] = useState(initialProfile.interests.join("\n"));
  const [avoid, setAvoid] = useState(initialProfile.avoid.join("\n"));
  const [seeds, setSeeds] = useState(initialProfile.seedPlaylistIds.join("\n"));
  const [celebrities, setCelebrities] = useState((initialProfile.favoriteCelebrities ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [hasError, setHasError] = useState(false);
  const [run, setRun] = useState<TvRun | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const [feedbackId, setFeedbackId] = useState("");
  const [rated, setRated] = useState<Record<string, string>>({});
  const [automatic, setAutomatic] = useState(autopilot);
  const lines = (value: string) => value.split("\n").map((s) => s.trim()).filter(Boolean);
  const patch = (value: Partial<TvProfile>) => {
    setProfile((p) => ({ ...p, ...value, ...(Object.keys(value).some((key) => key !== "liveEnabled") ? { liveEnabled: false } : {}) }));
    setDirty(true);
  };
  const editText = (setter: (text: string) => void, value: string) => { setter(value); patch({}); setProfile((p) => ({ ...p, liveEnabled: false })); };

  async function request(body: object) {
    setBusy(true); setMessage(""); setHasError(false); setErrorCode("");
    try {
      const response = await fetch("/api/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { setErrorCode(data.code ?? ""); throw new Error(data.error ?? `Request failed (HTTP ${response.status}).`); }
      return data;
    } catch (error) { setHasError(true); setMessage(error instanceof Error ? error.message : "Request failed."); return null; }
    finally { setBusy(false); }
  }
  function applyProfile(next: TvProfile) {
    setProfile({ ...defaultTvProfile, ...next }); setInterests(next.interests.join("\n"));
    setAvoid(next.avoid.join("\n")); setSeeds(next.seedPlaylistIds.join("\n")); setDirty(false);
    setCelebrities((next.favoriteCelebrities ?? []).join(", "));
  }
  async function save() {
    const data = await request({ action: "save", profile: { ...profile, interests: lines(interests), avoid: lines(avoid), seedPlaylistIds: lines(seeds), favoriteCelebrities: celebrities.split(/[,\n]/).map((name) => name.trim()).filter(Boolean) } });
    if (data) { applyProfile(data.profile); if (!data.profile.liveEnabled) setAutomatic(false); setRun(null); setMessage("Your house rules are saved. Turn autopilot on when you want automatic updates."); router.refresh(); }
  }
  async function buildTv() {
    const data = await request({ action: "start" });
    if (data) {
      applyProfile(data.profile); setRun(data.run ?? null); setHasError(Boolean(data.runError)); setErrorCode(data.errorCode ?? "");
      if (data.run?.videos.length) setQueueVersion(version => version + 1);
      setMessage(data.runError ? `Your playlist is connected, but the mix couldn't be filled: ${data.runError}` :
        data.run?.videos.length ? `${data.run.videos.length} fresh picks added. Your automatic schedule stays as configured.` :
        `No new picks this time. ${data.run?.warnings.join(" ") || "Try a wider mix or clear finished videos in YouTube."}`);
    }
  }
  async function importTaste() {
    const data = await request({ action: "import-taste" });
    if (data) { applyProfile(data.profile); setRun(null); setMessage(`Refreshed from ${data.likedCount} likes and ${data.subscriptionCount} subscriptions. Ready for a fresh mix.`); }
  }
  async function scan(mode: "dry-run" | "live") {
    const data = await request({ action: "run", mode });
    if (data) { setRun(data); setMessage(mode === "dry-run" ? "A sneak peek. Nothing added yet; a live build discovers again." : data.videos.length ? `${data.videos.length} new picks added to your station.` : "No new picks fit this run. Check the notes below."); }
  }
  async function feedback(videoId: string, value: string) {
    const data = await request({ action: "feedback", videoId, feedback: value });
    if (data) { setRated((p) => ({ ...p, [videoId]: value })); setMessage("Got it. We'll keep that in mind for the next mix."); }
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Google and delete your app preferences, feedback and history? Your YouTube playlists will stay untouched.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't disconnect.");
      if (!data.revoked) window.alert(data.message);
      window.location.assign("/tv");
    } catch (error) { setHasError(true); setMessage(error instanceof Error ? error.message : "Couldn't disconnect."); }
    finally { setBusy(false); }
  }
  async function saveChannels(rows: { key: StationKey; name: string; interests: string[] }[]) {
    const data = await request({ action: "save-stations", stations: rows });
    if (!data) return false;
    applyProfile(data.profile); setSavedStations(data.stations); setActiveStations(data.enabledStations); setAutomatic(false);
    setMessage("Your lineup is saved. Turn automatic playlists on when ready."); return true;
  }
  async function saveWeeklyFilters(station: StationKey, filters: StationFilters) {
    const data = await request({ action: "save-weekly-filters", station, filters });
    if (!data) return false;
    setSavedStations(current => ({ ...current, [station]: data.profile }));
    return true;
  }
  async function startAutomatic() {
    const data = await request({ action: "kickoff" });
    if (data) { applyProfile(data.profile); setAutomatic(true); const failed = data.result?.find((run: { error?: string }) => run.error); setHasError(Boolean(failed)); setErrorCode(failed?.code ?? ""); setMessage(failed ? `Automatic updates are on, but a station check failed: ${failed.error}` : "Automatic updates are on. See the latest playlist checks below."); router.refresh(); }
  }
  async function toggleAutopilot() {
    const data = await request({ action: "autopilot", enabled: !automatic });
    if (data) { applyProfile(data.profile); setAutomatic(data.enabled); setMessage(data.enabled ? "Automatic playlists are on." : "Automatic playlists paused."); }
  }
  async function importHistory(file?: File) {
    if (!file) return;
    const ids = watchedIdsFromExport(await file.text());
    if (!ids.length) { setHasError(true); setMessage("No YouTube watch links found. Choose the watch-history JSON or HTML from Google Takeout."); return; }
    let imported = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const data = await request({ action: "import-watched", videoIds: ids.slice(i, i + 1000) });
      if (!data) return;
      imported += data.imported;
    }
    setMessage(imported + " watched video IDs imported. The original file stayed in your browser.");
  }
  async function importCelebrities(file?: File) {
    if (!file) return;
    const names = namesFromImdbCsv(await file.text());
    if (!names.length) { setHasError(true); setMessage("No names found. Use the CSV export from your IMDb people list."); return; }
    const merged = [...new Set([...celebrities.split(/[,\n]/).map(s => s.trim()).filter(Boolean), ...names])].slice(0, 500);
    setCelebrities(merged.join(", ")); patch({ favoriteCelebrities: merged }); setMessage(names.length + " names read and merged with your favourites. Save below to apply them.");
  }
  const minutes = run ? Math.round(run.videos.reduce((n, video) => n + video.durationSeconds, 0) / 60) : 0;
  const lanes = new Set(run?.videos.map(categoryForVideo) ?? []);

  return <>
    <section className="station-control panel" id="your-station">
      <div className="section-heading"><div><p className="eyebrow">THE REMOTE IS YOURS</p><h2>Your couch.<br /><span className="cinema-type">Your rules.</span></h2></div><span className="station-stamp">MADE<br />FOR YOU<br /><span>?</span></span></div>
      <div className="mix-summary"><span>? {profile.discoveryPercent}% room for surprise</span><span>? Max {profile.maxPerTopic} per topic</span><span>? {profile.sessionMinutes} minute mix</span></div>
<div className="autopilot-card"><div><h3>{automatic ? "Your station is on autopilot." : "Less setup. More sofa."}</h3><p>{personal ? "Your viewing brief is saved to your account. No taste questionnaire needed." : "Start with your YouTube likes and subscriptions. Fine-tuning is optional."}</p><p>{personalDaily ? "Your enabled playlists refresh daily at 9am or 7pm Nairobi time." : "TV and custom channels check daily around 7pm Nairobi time. TV can replace the queue once half qualifies as watched or the queue is 48 hours old. Specialist channels run weekly."}</p><small>Watch counts come from this player and explicit watched marks. YouTube app playback is unavailable to TV Mix.</small></div><button id="autopilot-toggle" className="secondary" disabled={busy || dirty} onClick={toggleAutopilot}>{automatic ? "Pause automatic playlists" : "Turn on automatic playlists"}</button></div>
      <AutomaticStatus refresh={busy} personal={personal} personalDaily={personalDaily} onStart={startAutomatic} disabled={busy || dirty} />
      <div className="main-controls" id="build-mix"><button className="big-build playful" disabled={busy || dirty} onClick={buildTv}><span>?</span>{busy ? "Finding the good stuff." : (profile.playlistId ? "Add more videos now" : "Build my TV playlist")}</button>
        {profile.playlistId && !dirty ? <a className="button secondary" href={`https://www.youtube.com/playlist?list=${encodeURIComponent(profile.playlistId)}`} target="_blank" rel="noreferrer">Open in YouTube ?</a> : null}
        <button className="text-button" disabled={busy || dirty || !profile.playlistId} onClick={() => scan("dry-run")}>Just a sneak peek</button></div>
      <p className={hasError ? "tv-error" : "station-message"} role={hasError ? "alert" : "status"} aria-live={hasError ? "assertive" : "polite"}>
        {busy ? "One moment. We're looking for a little of everything. This can take a minute." : message || (dirty ? "Save your changes below before building." : "Press play on a better evening. We'll fill a private YouTube playlist for you.")}
        {hasError && errorCode ? <> <code>{errorCode}</code></> : null}{hasError && errorCode === "RECONNECT_GOOGLE" ? <> <a href="/api/auth/google/start">Reconnect Google</a></> : null}
      </p>
      <p className="fineprint">Add more videos now tops up your current playlist without removing existing videos. Your daily 7pm Nairobi check stays scheduled and uses the usual watched / 48-hour refresh rules. Your filters and queue limits still apply.</p>
      <StationPlayer key={queueVersion} playlistId={profile.playlistId} />
      <div className="station-shelf">{activeStations.filter(key => key !== "tv").map(key => <div key={key}><h3>{savedStations?.[key]?.displayName || stationNames[key]}</h3><p>{key.startsWith("custom") ? "Daily / around 7pm Nairobi time" : key === "faith" ? (personalDaily ? "Daily / around 7pm Nairobi time" : "Friday / around 7pm Nairobi time") : (personalDaily ? "Daily / around 9am Nairobi time" : "Saturday / around 9am Nairobi time")}</p>{savedStations?.[key]?.playlistId ? <a href={"https://www.youtube.com/playlist?list=" + savedStations[key]!.playlistId} target="_blank" rel="noreferrer">Open playlist ?</a> : <span>Ready for its first automatic hunt</span>}</div>)}</div>
      <div className="house-rules"><div><span className="mini-icon">?</span><h3>Comfort watching</h3><p>{profile.lightViewing ? "Heavy talks, lectures and raunchy dating formats sit this one out." : "All formats can join, within your other filters."}</p></div><div><span className="mini-icon">?</span><h3>Less of the same</h3><p>No more than {profile.maxPerTopic} picks from one topic, including what&apos;s already in your queue.</p></div><div><span className="mini-icon">?</span><h3>A little plot twist</h3><p>Fresh lanes and older discoveries. Familiar favourites with room to wander.</p></div></div>
      <details className="tuning-drawer" id="taste-tuning" open={dirty || !profile.interests.length || undefined}><summary>Optional fine-tuning <span>+</span></summary>
        <div className="toolbar"><button className="text-button" disabled={busy || dirty} onClick={importTaste}>Refresh from my YouTube taste</button></div>
        <p className="fineprint">What do you like watching on cable TV? A simple answer is enough. You can also be specific about shows, creators, languages, leagues, formats and moods. These are your preferences only.</p>
        <div className="grid"><label>What keeps you curious?<textarea rows={7} value={interests} onChange={(e) => editText(setInterests, e.target.value)} placeholder={"Football highlights\nFilm behind the scenes\nTravel and food"} /><small>One whole interest per line, up to 60 entries (400 characters each). Words on the same line stay together. Your existing detail is preserved.</small></label>
          <div className="tuning-stack"><label>Time per update <input type="range" min={15} max={720} step={15} value={profile.sessionMinutes} onChange={(e) => patch({ sessionMinutes: Number(e.target.value) })} /><strong>{profile.sessionMinutes} minutes</strong></label>
            <label>A little outside your usual<input type="range" min={0} max={60} step={5} value={profile.discoveryPercent} onChange={(e) => patch({ discoveryPercent: Number(e.target.value) })} /><strong>{profile.discoveryPercent}% discovery target</strong></label>
            <div className="grid"><label>Longest video (min)<input type="number" min={2} max={120} value={profile.maxVideoMinutes} onChange={(e) => patch({ maxVideoMinutes: Number(e.target.value) })} /></label><label>Max per topic<input type="number" min={1} max={4} value={profile.maxPerTopic} onChange={(e) => patch({ maxPerTopic: Number(e.target.value) })} /></label></div>
            <label>Older gems target<input type="range" min={0} max={100} step={5} value={profile.archivePercent} onChange={(e) => patch({ archivePercent: Number(e.target.value) })} /><strong>{profile.archivePercent}% older discoveries</strong></label></div>
          <label>Hard passes - what should stay out?<textarea rows={3} value={avoid} onChange={(e) => editText(setAvoid, e.target.value)} placeholder={"Spoilers\nPranks"} /><small>Optional exclusions, one phrase per line. Matching video metadata is excluded. Specific phrases work better than vague single words.</small></label>
          <label>People you enjoy<textarea rows={4} value={celebrities} onChange={(e) => editText(setCelebrities, e.target.value)} placeholder="Names, separated by commas or new lines" /><small>{celebrities.split(/[,\n]/).filter(n => n.trim()).length} people. These are familiar starting points, not a closed guest list. Casts of your favourite shows and a discovery slot can introduce new people.</small></label><label>New faces alongside familiar favourites<input type="range" min={0} max={100} step={5} value={profile.celebrityDiscoveryPercent} onChange={e => patch({ celebrityDiscoveryPercent: Number(e.target.value) })} /><strong>{profile.celebrityDiscoveryPercent}% people discovery target</strong><small>A target across builds, not a guaranteed share. Set 0 for known names and shows only. Your overall exclusions always apply.</small></label>
          <label>Import your IMDb favourites<input type="file" accept=".csv,text/csv" onChange={(e) => void importCelebrities(e.target.files?.[0])} /><small>Optional: export a people list as CSV on IMDb, then choose the file here. Names are merged into your favourites; other columns stay in your browser. If IMDb does not offer export, paste names directly above.</small></label>
          <label>A playlist that gets your taste<textarea rows={3} value={seeds} onChange={(e) => editText(setSeeds, e.target.value)} placeholder="Up to three playlist links, one per line" /><small>Optional references. They supply candidates; your filters still apply.</small></label>
          <label>Your TV playlist<input value={profile.playlistId} onChange={(e) => patch({ playlistId: e.target.value })} /><small>Leave empty to create one. Deleted TV playlists reconnect on the next build.</small></label>
          <fieldset id="sports-tuning" className="sports-fieldset"><legend>Sports you enjoy</legend><p>Pick as many as you like. These add searches without rewriting your interests. Unlisted sport? Add it to What keeps you curious.</p><div className="sport-toggles">{sports.map(sport => <label className="checkbox" key={sport.id}><input type="checkbox" checked={profile.selectedSports.includes(sport.id)} onChange={e => patch({ selectedSports: e.target.checked ? [...profile.selectedSports, sport.id] : profile.selectedSports.filter(id => id !== sport.id) })} />{sport.name}</label>)}</div><label>Broad football preference<select value={profile.footballFocus} onChange={(e) => patch({ footballFocus: e.target.value as TvProfile["footballFocus"] })}><option value="all">Follow my interests</option><option value="european-world-cup">European football &amp; World Cup</option></select></label><FootballPicker selected={profile.footballLeagues} extra={profile.footballExtras} onChange={(footballLeagues, footballExtras) => patch({ footballLeagues, footballExtras })} /><label className="checkbox"><input type="checkbox" checked={profile.monthlyMotorsport} onChange={e => patch({ monthlyMotorsport: e.target.checked })} />Limit F1 / motorsport to a monthly cameo</label><small>Applies whenever motorsport is found, including in your existing interests.</small></fieldset>
        </div>
        <PublisherPicker selected={profile.publisherSources} legacy={studioSources.filter(source => profile.studioHandles.includes(source.handle))} onRemoveLegacy={handle => patch({ studioHandles: profile.studioHandles.filter(item => item !== handle) })} onChange={publisherSources => patch({ publisherSources })} />
        <ViewingToggles filters={profile} aiAvailable={aiAvailable} onChange={patch} />
        <label className="checkbox"><input type="checkbox" checked={profile.useSubscriptions} onChange={(e) => patch({ useSubscriptions: e.target.checked })} />Include subscriptions</label>
        <p className="fineprint">AI is optional and off by default. Enabling it sends your chosen interests, avoid terms, video metadata and liked-video titles to the configured AI provider and may incur provider charges, separate from ChatGPT. Filters use metadata, not full video review, so suitability is never guaranteed.</p>
        <div className="toolbar"><button disabled={busy} onClick={save}>Save my house rules</button><button className="secondary" disabled={busy || dirty || !profile.playlistId} onClick={() => scan("live")}>Add more videos now</button></div>
      </details>
    </section>
    <ChannelManager profile={profile} stations={savedStations} enabled={activeStations} busy={busy} dirty={dirty} onSave={saveChannels} />
    {activeStations.some(key => key !== "tv") ? <section className="panel" id="weekly-filters" aria-labelledby="weekly-filters-title">
      <h2 id="weekly-filters-title">Other playlist settings</h2>
      {activeStations.filter(key => key !== "tv").map(key => (
        <WeeklyFilters key={key} name={savedStations?.[key]?.displayName || stationNames[key]}
          profile={{ ...defaultTvProfile, ...savedStations?.[key] }} aiAvailable={aiAvailable}
          busy={busy} onSave={filters => saveWeeklyFilters(key, filters)} />
      ))}
    </section> : null}
    {run ? <section className="lineup-section" id="tonights-lineup"><div className="section-heading"><div><p className="eyebrow">{run.mode === "dry-run" ? "A LITTLE SNEAK PEEK" : "FRESH ON YOUR STATION"}</p><h2 className="lineup-title">Tonight looks <em>good.</em></h2></div><div className="lineup-tally"><strong>{run.videos.length}</strong><span>picks � {minutes} min<br />{lanes.size} different lanes</span></div></div>
      {run.warnings.length ? <details className="lineup-notes"><summary>A note about this mix</summary>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details> : null}
      <div className="lineup-grid">{run.videos.map((video, i) => <article className="lineup-card" key={video.videoId}>
        <a className="thumbnail" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer"><Image src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} width={480} height={360} unoptimized alt="" loading="lazy" /><span className="pick-number">{String(i + 1).padStart(2, "0")}</span><span className="duration-chip">{Math.round(video.durationSeconds / 60)} MIN</span><span className="thumbnail-play" aria-hidden="true">?</span><span className="sr-only">Watch {video.title}</span></a>
        <div className="lineup-card-body"><p className="eyebrow">{laneLabels[categoryForVideo(video)]} {video.discovery ? " / WILD CARD" : isArchive(video) ? " / OLDER GEM" : ""}</p><h3><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">{video.title}</a></h3><p>{video.channelTitle}</p><details><summary>Why this one?</summary><p>{video.reason}</p></details>
          <div className="feedback-row">{["like", "skip", "watched", "block-channel"].map((value) => <button key={value} disabled={busy} aria-pressed={rated[video.videoId] === value} onClick={() => feedback(video.videoId, value)}>{rated[video.videoId] === value ? "V " : ""}{value === "block-channel" ? "less of this channel" : value}</button>)}</div></div>
      </article>)}</div>{!run.videos.length ? <div className="empty-lineup"><span>?</span><h3>A little room for tomorrow.</h3><p>No new picks fit this run. Broaden your interests or clear finished videos from your queue.</p></div> : null}
    </section> : null}
    <div className="grid extras-grid"><details className="panel" id="reference-tools"><summary>One-time history import &amp; feedback <span>+</span></summary><p>YouTube does not share native watch history or skips. Import your Google Takeout watch-history JSON or HTML once to exclude older watched videos. Only IDs are uploaded. App skips are remembered. TV can refresh after half qualify as watched (two minutes each, completed shorter clips, or explicit watched marks) or after 48 hours.</p><label>Import watched videos<input type="file" accept=".json,.html,application/json,text/html" disabled={busy} onChange={(e) => void importHistory(e.target.files?.[0])} /></label><p>Already watched something outside this app? Paste its YouTube link below and mark it watched. Like and Skip guide future picks; Less of this channel blocks that channel for your account.</p><label>YouTube video link or ID<input value={feedbackId} onChange={(e) => { const raw = e.target.value.trim(); const match = raw.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/); setFeedbackId(match?.[1] ?? raw); }} placeholder="https://www.youtube.com/watch?v=..." /></label><div className="toolbar">{["like", "skip", "watched", "block-channel"].map((value) => <button className="secondary" key={value} disabled={busy || !/^[\w-]{11}$/.test(feedbackId)} onClick={() => feedback(feedbackId, value)}>{value.replace("-", " ")}</button>)}</div></details>
      <details className="panel" id="account-controls"><summary>Account &amp; privacy <span>?</span></summary><p>Connected as <strong>{email ?? "your Google account"}</strong>. Subscriptions guide your station like a trusted mentor; your filters still decide what belongs. Your station uses your account only. YouTube&apos;s private Home algorithm and watch history aren&apos;t imported.</p><div className="toolbar"><a className="button secondary" href="/api/auth/google/start">Switch Google account</a><form action="/api/auth/logout" method="post"><button type="submit" className="text-button">Sign out</button></form></div><button className="text-button" disabled={busy} onClick={disconnect}>Disconnect &amp; delete my app data</button><p className="fineprint"><a href="/privacy">Privacy policy</a> � <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google connection controls ?</a></p></details></div>
  </>;
}

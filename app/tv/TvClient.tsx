"use client";

import Image from "next/image";
import { useState } from "react";
import { defaultTvProfile, exampleInterests, categoryForVideo, laneLabels, isArchive, type TvProfile } from "@/lib/tv-profile";
import type { TvRun } from "@/lib/tv";
import StationPlayer from "./StationPlayer";
import { watchedIdsFromExport, namesFromImdbCsv } from "@/lib/history-import";
import { stationNames, type StationKey } from "@/lib/station-rules";

export default function TvClient({ initialProfile, aiAvailable, email, autopilot = false, stations, personal = false }: { initialProfile: TvProfile; aiAvailable: boolean; email?: string; autopilot?: boolean; stations?: Partial<Record<StationKey, TvProfile>>; personal?: boolean }) {
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
    const data = await request({ action: "save", profile: { ...profile, interests: lines(interests), avoid: lines(avoid), seedPlaylistIds: lines(seeds), favoriteCelebrities: celebrities.split(",").map((name) => name.trim()).filter(Boolean) } });
    if (data) { applyProfile(data.profile); if (!data.profile.liveEnabled) setAutomatic(false); setRun(null); setMessage("Your house rules are saved. Turn autopilot on when you want automatic updates."); }
  }
  async function buildTv() {
    const data = await request({ action: "start" });
    if (data) {
      applyProfile(data.profile); setRun(data.run ?? null); setHasError(Boolean(data.runError)); setErrorCode(data.errorCode ?? "");
      setMessage(data.runError ? `Your playlist is connected, but the mix couldn't be filled: ${data.runError}` :
        data.run?.videos.length ? `${data.run.videos.length} good things added. Your evening is ready.` :
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
  async function weekendMix() {
    const next = { ...profile, interests: exampleInterests, avoid: lines(avoid), seedPlaylistIds: lines(seeds), favoriteCelebrities: celebrities.split(",").map((name) => name.trim()).filter(Boolean),
      lightViewing: true, sharedTv: true, maxPerTopic: 4, discoveryPercent: 25, footballFocus: "european-world-cup", monthlyMotorsport: true, liveEnabled: false };
    const data = await request({ action: "save", profile: next });
    if (data) { applyProfile(data.profile); await buildTv(); }
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
    setCelebrities(names.join(", ")); patch({ favoriteCelebrities: names }); setMessage(names.length + " names ready. Save below to apply them.");
  }
  const minutes = run ? Math.round(run.videos.reduce((n, video) => n + video.durationSeconds, 0) / 60) : 0;
  const lanes = new Set(run?.videos.map(categoryForVideo) ?? []);

  return <>
    <section className="station-control panel" id="your-station">
      <div className="section-heading"><div><p className="eyebrow">THE REMOTE IS YOURS</p><h2>Your couch.<br /><span className="cinema-type">Your rules.</span></h2></div><span className="station-stamp">MADE<br />FOR YOU<br /><span>✦</span></span></div>
      <div className="mix-summary"><span>↗ {profile.discoveryPercent}% room for surprise</span><span>▦ Max {profile.maxPerTopic} per topic</span><span>◷ {profile.sessionMinutes} minute mix</span></div>
      <div className="autopilot-card"><div><h3>{automatic ? "Your station is on autopilot." : "Less setup. More sofa."}</h3><p>{personal ? "Your viewing brief is saved to your account. No taste questionnaire needed." : "Start with your YouTube likes and subscriptions. Fine-tuning is optional."}</p><p>Hunts run on the server while this page is closed. The daily TV hunt is around 7pm and refreshes only after half the queue is watched. Faith: Friday evening. Childhood, pop culture and life skills: Saturday around 9am. Nairobi time.</p></div><button className="secondary" disabled={busy || dirty} onClick={toggleAutopilot}>{automatic ? "Pause automatic playlists" : "Turn on automatic playlists"}</button></div>
      <div className="main-controls"><button className="big-build playful" disabled={busy || dirty} onClick={buildTv}><span>▶</span>{busy ? "Finding the good stuff…" : "Build my TV playlist"}</button>
        {profile.playlistId && !dirty ? <a className="button secondary" href={`https://www.youtube.com/playlist?list=${encodeURIComponent(profile.playlistId)}`} target="_blank" rel="noreferrer">Open in YouTube ↗</a> : null}
        <button className="text-button" disabled={busy || dirty || !profile.playlistId} onClick={() => scan("dry-run")}>Just a sneak peek</button></div>
      <p className={hasError ? "tv-error" : "station-message"} role={hasError ? "alert" : "status"} aria-live={hasError ? "assertive" : "polite"}>
        {busy ? "One moment. We're looking for a little of everything. This can take a minute." : message || (dirty ? "Save your changes below before building." : "Press play on a better evening. We'll fill a private YouTube playlist for you.")}
        {hasError && errorCode ? <> <code>{errorCode}</code></> : null}{hasError && errorCode === "RECONNECT_GOOGLE" ? <> <a href="/api/auth/google/start">Reconnect Google</a></> : null}
      </p>
      <StationPlayer playlistId={profile.playlistId} />
      {stations ? <div className="station-shelf">{(Object.keys(stationNames) as StationKey[]).filter(key => key !== "tv").map(key => <div key={key}><h3>{stationNames[key]}</h3><p>{key === "faith" ? "Friday · 7pm · your subscriptions" : key === "childhood" ? "Saturday · 9am · weekly" : "Saturday · 9am"}</p>{stations[key]?.playlistId ? <a href={"https://www.youtube.com/playlist?list=" + stations[key]!.playlistId} target="_blank" rel="noreferrer">Open playlist ↗</a> : <span>Created automatically when connected</span>}</div>)}</div> : null}
      <div className="house-rules"><div><span className="mini-icon">✳</span><h3>Comfort watching</h3><p>{profile.lightViewing ? "Heavy talks, lectures and raunchy dating formats sit this one out." : "All formats can join, within your other filters."}</p></div><div><span className="mini-icon">▦</span><h3>Less of the same</h3><p>No more than four picks from one topic, including what&apos;s already in your queue.</p></div><div><span className="mini-icon">↝</span><h3>A little plot twist</h3><p>Fresh lanes and older discoveries. Familiar favourites with room to wander.</p></div></div>
      <details className="tuning-drawer" open={dirty || undefined}><summary>Optional fine-tuning <span>+</span></summary>
        <div className="toolbar"><button className="secondary" disabled={busy} onClick={weekendMix}>Build the weekend mix ✦</button><button className="text-button" disabled={busy || dirty} onClick={importTaste}>Refresh from my YouTube taste</button></div>
        <p className="fineprint">The cable-TV mix: fresh trailers, SNL, chess, Gameranx / Falcon, European football, WWE, awards, fashion, wildlife, art, books, Spanish, music, useful tech and a little news. Topics rotate across builds; up to four picks per lane and two per channel. Your playlist, hard passes and references stay yours.</p>
        <div className="grid"><label>What keeps you curious?<textarea rows={7} value={interests} onChange={(e) => editText(setInterests, e.target.value)} placeholder={"Football highlights\nFilm behind the scenes\nTravel and food"} /><small>One interest per line, up to 60. Every account has its own list.</small></label>
          <div className="tuning-stack"><label>Time for tonight <input type="range" min={15} max={240} step={15} value={profile.sessionMinutes} onChange={(e) => patch({ sessionMinutes: Number(e.target.value) })} /><strong>{profile.sessionMinutes} minutes</strong></label>
            <label>A little outside your usual<input type="range" min={0} max={60} step={5} value={profile.discoveryPercent} onChange={(e) => patch({ discoveryPercent: Number(e.target.value) })} /><strong>{profile.discoveryPercent}% discovery target</strong></label>
            <div className="grid"><label>Longest video (min)<input type="number" min={2} max={120} value={profile.maxVideoMinutes} onChange={(e) => patch({ maxVideoMinutes: Number(e.target.value) })} /></label><label>Max per topic<input type="number" min={1} max={4} value={profile.maxPerTopic} onChange={(e) => patch({ maxPerTopic: Number(e.target.value) })} /></label></div>
            <label>Older gems target<input type="range" min={0} max={100} step={5} value={profile.archivePercent} onChange={(e) => patch({ archivePercent: Number(e.target.value) })} /><strong>{profile.archivePercent}% older discoveries</strong></label></div>
          <label>Hard passes<textarea rows={3} value={avoid} onChange={(e) => editText(setAvoid, e.target.value)} placeholder={"Spoilers\nPranks"} /></label>
          <label>Celebrities you enjoy<input value={celebrities} onChange={(e) => editText(setCelebrities, e.target.value)} placeholder="Names, separated by commas" /><small>Short interviews match these names. With optional AI, your likes can also guide celebrity affinity. No names and AI off means interviews wait; SNL sketches and award monologues can still play.</small></label>
          <label>Import your IMDb favourites<input type="file" accept=".csv,text/csv" onChange={(e) => void importCelebrities(e.target.files?.[0])} /><small>The linked IMDb list blocks automated reading. Its CSV export fills the names for you.</small></label>
          <label>A playlist that gets your taste<textarea rows={3} value={seeds} onChange={(e) => editText(setSeeds, e.target.value)} placeholder="Up to three playlist links, one per line" /><small>Optional references. They supply candidates; your filters still apply.</small></label>
          <label>Your TV playlist<input value={profile.playlistId} onChange={(e) => patch({ playlistId: e.target.value })} /><small>Leave empty to create one. Deleted TV playlists reconnect on the next build.</small></label>
          <label>Football flavour<select value={profile.footballFocus} onChange={(e) => patch({ footballFocus: e.target.value as TvProfile["footballFocus"] })}><option value="all">Follow my interests</option><option value="european-world-cup">European football &amp; World Cup</option></select></label>
        </div>
        <div className="toggle-grid"><label className="checkbox"><input type="checkbox" checked={profile.lightViewing} onChange={(e) => patch({ lightViewing: e.target.checked })} />Keep it light</label><label className="checkbox"><input type="checkbox" checked={profile.sharedTv} onChange={(e) => patch({ sharedTv: e.target.checked })} />Shared-room screening</label><label className="checkbox"><input type="checkbox" checked={profile.useSubscriptions} onChange={(e) => patch({ useSubscriptions: e.target.checked })} />Include subscriptions</label><label className="checkbox"><input type="checkbox" checked={profile.useYouTubeLikes} onChange={(e) => patch({ useYouTubeLikes: e.target.checked })} />Learn from my likes</label><label className="checkbox"><input type="checkbox" checked={profile.monthlyMotorsport} onChange={(e) => patch({ monthlyMotorsport: e.target.checked })} />F1 / motorsport: monthly cameo</label><label className="checkbox"><input type="checkbox" checked={profile.aiEnabled} disabled={!aiAvailable && !profile.aiEnabled} onChange={(e) => patch({ aiEnabled: e.target.checked })} />Optional AI taste check {aiAvailable ? "" : "(unavailable)"}</label></div>
        <p className="fineprint">AI is optional and off by default. Enabling it sends your chosen interests, avoid terms, video metadata and liked-video titles to the configured AI provider and may incur provider charges, separate from ChatGPT. Filters use metadata, not full video review, so suitability is never guaranteed.</p>
        <div className="toolbar"><button disabled={busy} onClick={save}>Save my house rules</button><button className="secondary" disabled={busy || dirty || !profile.playlistId} onClick={() => scan("live")}>Add more videos now</button></div>
      </details>
    </section>
    {run ? <section className="lineup-section" id="tonights-lineup"><div className="section-heading"><div><p className="eyebrow">{run.mode === "dry-run" ? "A LITTLE SNEAK PEEK" : "FRESH ON YOUR STATION"}</p><h2 className="lineup-title">Tonight looks <em>good.</em></h2></div><div className="lineup-tally"><strong>{run.videos.length}</strong><span>picks · {minutes} min<br />{lanes.size} different lanes</span></div></div>
      {run.warnings.length ? <details className="lineup-notes"><summary>A note about this mix</summary>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details> : null}
      <div className="lineup-grid">{run.videos.map((video, i) => <article className="lineup-card" key={video.videoId}>
        <a className="thumbnail" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer"><Image src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} width={480} height={360} unoptimized alt="" loading="lazy" /><span className="pick-number">{String(i + 1).padStart(2, "0")}</span><span className="duration-chip">{Math.round(video.durationSeconds / 60)} MIN</span><span className="thumbnail-play" aria-hidden="true">▶</span><span className="sr-only">Watch {video.title}</span></a>
        <div className="lineup-card-body"><p className="eyebrow">{laneLabels[categoryForVideo(video)]} {video.discovery ? " / WILD CARD" : isArchive(video) ? " / OLDER GEM" : ""}</p><h3><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">{video.title}</a></h3><p>{video.channelTitle}</p><details><summary>Why this one?</summary><p>{video.reason}</p></details>
          <div className="feedback-row">{["like", "skip", "watched", "block-channel"].map((value) => <button key={value} disabled={busy} aria-pressed={rated[video.videoId] === value} onClick={() => feedback(video.videoId, value)}>{rated[video.videoId] === value ? "✓ " : ""}{value === "block-channel" ? "less of this channel" : value}</button>)}</div></div>
      </article>)}</div>{!run.videos.length ? <div className="empty-lineup"><span>✳</span><h3>A little room for tomorrow.</h3><p>No new picks fit this run. Broaden your interests or clear finished videos from your queue.</p></div> : null}
    </section> : null}
    <div className="grid extras-grid"><details className="panel"><summary>One-time history import &amp; feedback <span>+</span></summary><p>YouTube does not share native watch history or skips. Import your Google Takeout watch-history JSON or HTML once to exclude older watched videos. Only IDs are uploaded. App skips are remembered. TV keeps its contents until at least half qualify as watched (two minutes each, completed shorter clips, or explicit watched marks).</p><label>Import watched videos<input type="file" accept=".json,.html,application/json,text/html" disabled={busy} onChange={(e) => void importHistory(e.target.files?.[0])} /></label><label>Video ID<input value={feedbackId} onChange={(e) => setFeedbackId(e.target.value)} placeholder="11-character video ID" /></label><div className="toolbar">{["like", "skip", "watched", "block-channel"].map((value) => <button className="secondary" key={value} disabled={busy || !/^[\w-]{11}$/.test(feedbackId)} onClick={() => feedback(feedbackId, value)}>{value.replace("-", " ")}</button>)}</div></details>
      <details className="panel"><summary>Account &amp; privacy <span>↗</span></summary><p>Connected as <strong>{email ?? "your Google account"}</strong>. Subscriptions guide your station like a trusted mentor; your filters still decide what belongs. Your station uses your account only. YouTube&apos;s private Home algorithm and watch history aren&apos;t imported.</p><div className="toolbar"><a className="button secondary" href="/api/auth/google/start">Switch Google account</a><form action="/api/auth/logout" method="post"><button type="submit" className="text-button">Sign out</button></form></div><button className="text-button" disabled={busy} onClick={disconnect}>Disconnect &amp; delete my app data</button><p className="fineprint"><a href="/privacy">Privacy policy</a> · <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google connection controls ↗</a></p></details></div>
  </>;
}

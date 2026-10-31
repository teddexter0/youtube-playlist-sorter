"use client";

import { useState } from "react";
import { defaultTvProfile, exampleInterests, isArchive, type TvProfile } from "@/lib/tv-profile";
import type { TvRun } from "@/lib/tv";

export default function TvClient({ initialProfile, aiAvailable }: { initialProfile: TvProfile; aiAvailable: boolean }) {
  const [profile, setProfile] = useState({ ...defaultTvProfile, ...initialProfile });
  const [interests, setInterests] = useState(initialProfile.interests.join("\n"));
  const [avoid, setAvoid] = useState(initialProfile.avoid.join("\n"));
  const [seeds, setSeeds] = useState(initialProfile.seedPlaylistIds.join("\n"));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [run, setRun] = useState<TvRun | null>(null);
  const [feedbackId, setFeedbackId] = useState("");
  const [rated, setRated] = useState<Record<string, string>>({});
  const lines = (value: string) => value.split("\n").map((s) => s.trim()).filter(Boolean);
  const patch = (value: Partial<TvProfile>) => { setProfile((p) => ({ ...p, ...value })); setDirty(true); };

  async function request(body: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      return data;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); return null; }
    finally { setBusy(false); }
  }
  async function save() {
    const data = await request({ action: "save", profile: { ...profile, interests: lines(interests), avoid: lines(avoid), seedPlaylistIds: lines(seeds) } });
    if (data) { setProfile(data.profile); setDirty(false); setRun(null); setMessage("Preferences saved. Preview before enabling daily TV after any change."); }
  }
  async function importTaste() {
    const data = await request({ action: "import-taste" });
    if (data) {
      setProfile(data.profile); setInterests(data.profile.interests.join("\n"));
      setAvoid(data.profile.avoid.join("\n")); setSeeds(data.profile.seedPlaylistIds.join("\n"));
      setDirty(false); setRun(null);
      setMessage(`Imported a sample of ${data.likedCount} liked videos and ${data.subscriptionCount} subscriptions. Your private TV playlist is ready. Preview your lineup next.`);
    }
  }
  async function scan(mode: "dry-run" | "live") {
    const data = await request({ action: "run", mode });
    if (data) { setRun(data); setMessage(mode === "dry-run" ? "Preview complete. No videos were added. Live runs discover again, so the final lineup can differ." : "Your TV playlist has been topped up."); }
  }
  async function feedback(videoId: string, value: string) {
    const data = await request({ action: "feedback", videoId, feedback: value });
    if (data) { setRated((p) => ({ ...p, [videoId]: value })); setMessage("Feedback saved for future lineups. Manage the current queue in YouTube."); }
  }
  return <>
    <section className="panel">
      <h2>Your TV, your taste</h2>
      <p>Start with your connected YouTube account. We use a sample of your likes and subscriptions to suggest interests, and create a private TV playlist if you need one. You can edit everything below.</p>
      <div className="toolbar"><button disabled={busy} onClick={importTaste}>Set up from my YouTube account</button></div>
      <p>We cannot import YouTube&apos;s Home algorithm or watch history. Your account signals, chosen interests and feedback shape this queue.</p>
      <div className="grid">
        <label>Interests<textarea rows={8} value={interests} onChange={(e) => { setInterests(e.target.value); setDirty(true); }} placeholder={"Space documentaries\nCooking techniques\nFootball tactics"} /></label>
        <div>
          <label>TV playlist URL or ID<input value={profile.playlistId} onChange={(e) => patch({ playlistId: e.target.value })} /></label>
          <p>The account setup button above creates your private TV playlist. To use another playlist you own, paste its link here.</p>
          <label>Optional seed playlists (up to 3, one per line)<textarea rows={3} value={seeds} onChange={(e) => { setSeeds(e.target.value); setDirty(true); }} /></label>
          <p>Seeds contribute candidates; subscriptions contribute rotating uploads. AI can compare these with your interests when enabled.</p>
        </div>
        <label>Avoid terms (one per line)<textarea rows={3} value={avoid} onChange={(e) => { setAvoid(e.target.value); setDirty(true); }} placeholder={"Spoilers\nPrank"} /></label>
        <div className="grid">
          <label>Lineup budget (minutes)<input type="number" min={15} max={240} value={profile.sessionMinutes} onChange={(e) => patch({ sessionMinutes: Number(e.target.value) })} /></label>
          <label>Max video (minutes)<input type="number" min={2} max={120} value={profile.maxVideoMinutes} onChange={(e) => patch({ maxVideoMinutes: Number(e.target.value) })} /></label>
          <label>Older discoveries target (%)<input type="number" min={0} max={100} value={profile.archivePercent} onChange={(e) => patch({ archivePercent: Number(e.target.value) })} /></label>
        </div>
      </div>
      <div className="toolbar">
        <button className="secondary" disabled={busy} onClick={() => { setInterests(exampleInterests.join("\n")); setDirty(true); }}>Use Ted&apos;s example interests</button>
        <label className="checkbox"><input type="checkbox" checked={profile.useSubscriptions} onChange={(e) => patch({ useSubscriptions: e.target.checked })} />Include subscriptions</label>
        <label className="checkbox"><input type="checkbox" checked={profile.useYouTubeLikes} onChange={(e) => patch({ useYouTubeLikes: e.target.checked })} />Use YouTube likes for taste matching</label>
        <label className="checkbox"><input type="checkbox" checked={profile.sharedTv} onChange={(e) => patch({ sharedTv: e.target.checked })} />Conservative shared-TV filter</label>
        <label className="checkbox"><input type="checkbox" checked={profile.aiEnabled} disabled={!aiAvailable && !profile.aiEnabled} onChange={(e) => patch({ aiEnabled: e.target.checked })} />AI ranking {aiAvailable ? "" : "(server setup needed)"}</label>
      </div>
      <p>When enabled, AI ranking sends these preferences, candidate metadata and liked-video titles (including YouTube likes if selected) to the configured AI provider. It does not watch the videos. Metadata filters and AI cannot guarantee that every video suits every viewer.</p>
      <label className="checkbox"><input type="checkbox" checked={profile.liveEnabled} onChange={(e) => patch({ liveEnabled: e.target.checked })} />Top up daily at 7pm Nairobi time, after a preview</label>
      <div className="toolbar">
        <button disabled={busy} onClick={save}>Save preferences</button>
        <button className="secondary" disabled={busy || dirty} onClick={() => scan("dry-run")}>Preview lineup</button>
        <button className="secondary" disabled={busy || dirty || !profile.liveEnabled} onClick={() => scan("live")}>Top up TV now</button>
        {profile.playlistId && !dirty ? <a className="button secondary" href={`https://www.youtube.com/playlist?list=${encodeURIComponent(profile.playlistId)}`} target="_blank" rel="noreferrer">Open TV in YouTube</a> : null}
      </div>
      <p role="status" aria-live="polite">{busy ? "Working on your TV queue…" : message || (dirty ? "Save your changes before running." : "Save, preview, then enable daily TV and save again.")}</p>
    </section>
    {run ? <section className="panel"><h2>{run.mode === "dry-run" ? "Your preview" : "Added to your TV queue"}</h2>
      <p>{run.videos.length} videos · {Math.round(run.videos.reduce((n, v) => n + v.durationSeconds, 0) / 60)} minutes · {run.candidateCount} candidates considered</p>
      {run.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      <div className="grid">{run.videos.map((video) => <article className="card" key={video.videoId}>
        <span className="eyebrow">{isArchive(video) ? "OLDER DISCOVERY" : "RECENT PICK"} · {video.topic}</span>
        <h3><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">{video.title}</a></h3>
        <p>{video.channelTitle} · {Math.round(video.durationSeconds / 60)} min<br />{video.reason}</p>
        <div className="toolbar">{["like", "skip", "watched", "block-channel"].map((value) => <button className="secondary" key={value} disabled={busy} aria-pressed={rated[video.videoId] === value} onClick={() => feedback(video.videoId, value)}>{rated[video.videoId] === value ? "✓ " : ""}{value.replace("-", " ")}</button>)}</div>
      </article>)}</div>
      {!run.videos.length ? <p>No new picks fit this run. Broaden your interests, adjust duration or clear finished items from TV.</p> : null}
    </section> : null}
    <section className="panel"><h2>Watch on your phone. Cast to your TV.</h2>
      <p>Open the TV playlist in the normal YouTube app, play it, then use YouTube&apos;s Cast control. Your laptop does not need to stay on once scheduled hosting is configured. Starting playback and casting still need your tap.</p>
      <p>YouTube does not send this app your native skips or watch progress. Paste a video ID below to give feedback later. A skip excludes that video; a channel block excludes future videos from that channel. Likes guide AI ranking. Watched marks the video as seen. Feedback does not delete playlist items.</p>
      <label>Video ID<input value={feedbackId} onChange={(e) => setFeedbackId(e.target.value)} placeholder="11-character video ID" /></label>
      <div className="toolbar">{["like", "skip", "watched", "block-channel"].map((value) => <button className="secondary" key={value} disabled={busy || !/^[\w-]{11}$/.test(feedbackId)} onClick={() => feedback(feedbackId, value)}>{value.replace("-", " ")}</button>)}</div>
    </section>
  </>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { playedSecondsDelta } from "@/lib/playback-time";
type Video = { videoId: string; title: string; channelTitle: string; durationSeconds: number };
type Player = { destroy(): void; getCurrentTime(): number; getPlayerState(): number };
type YT = { Player: new (element: HTMLDivElement, options: object) => Player };
declare global { interface Window { YT?: YT; onYouTubeIframeAPIReady?: () => void } }
let api: Promise<YT> | undefined;
function playerApi() {
  if (window.YT) return Promise.resolve(window.YT);
  if (!api) api = new Promise<YT>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.onerror = () => reject(new Error("YouTube player could not load.")); document.head.appendChild(script);
  });
  return api;
}
export default function StationPlayer({ playlistId }: { playlistId: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const advancing = useRef(false);
  const advanceRef = useRef<(action: string) => void>(() => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const sessionSeconds = useRef(0);
  async function advance(action: string) {
    if (advancing.current || !videos[index]) return;
    advancing.current = true; setSaving(true);
    try {
      await flushRef.current();
      if (action === "ended") action = sessionSeconds.current >= Math.min(120, videos[index].durationSeconds * 0.9) ? "watched" : "skip";
      const r = await fetch("/api/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "feedback", videoId: videos[index].videoId, feedback: action }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Feedback failed.");
      setIndex(i => i + 1); setMessage("Remembered. On to the next.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Feedback failed."); }
    finally { advancing.current = false; setSaving(false); }
  }
  advanceRef.current = action => { void advance(action); };
  useEffect(() => {
    if (!open || !videos[index] || !host.current) return;
    let active = true; let player: Player | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let previous = 0, wallTime = Date.now(), unsent = 0, inFlight = false;
    let retry: { videoId: string; seconds: number; eventId: string } | undefined;
    const videoId = videos[index].videoId;
    sessionSeconds.current = 0;
    const flush = async () => {
      if (inFlight || (!retry && unsent < 1)) return;
      inFlight = true;
      if (!retry) { const seconds = Math.min(15, Math.floor(unsent)); unsent -= seconds; retry = { videoId, seconds, eventId: crypto.randomUUID() }; }
      try {
        const response = await fetch("/api/tv", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "progress", ...retry }) });
        if (!response.ok) throw new Error("Playback progress could not sync. It will retry while this player is open.");
        retry = undefined;
      } catch (e) { if (active) setMessage(e instanceof Error ? e.message : "Progress sync failed."); }
      finally { inFlight = false; }
    };
    flushRef.current = flush;
    const target = document.createElement("div"); host.current.replaceChildren(target);
    playerApi().then(yt => {
      if (!active) return;
      player = new yt.Player(target, { videoId, width: "100%", height: "100%", playerVars: { autoplay: 1, playsinline: 1, origin: window.location.origin }, events: { onStateChange: (event: { data: number }) => { if (event.data === 0) advanceRef.current("ended"); }, onError: () => setMessage("This video cannot play here. You can skip it or open the playlist in YouTube.") } });
      timer = setInterval(() => {
        if (!player?.getCurrentTime || !player.getPlayerState) return;
        const current = player.getCurrentTime(), now = Date.now();
        const seconds = playedSecondsDelta(previous, current, (now - wallTime) / 1000, player.getPlayerState() === 1);
        previous = current; wallTime = now; unsent += seconds; sessionSeconds.current += seconds;
        if (unsent >= 10 || retry) void flush();
      }, 1000);
    }).catch(e => setMessage(e.message));
    return () => { active = false; if (timer) clearInterval(timer); void flush(); player?.destroy(); };
  }, [open, index, videos]);
  async function watch() {
    setMessage("Opening your station...");
    try {
      const r = await fetch("/api/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "queue" }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setVideos(data.videos); setIndex(0); setOpen(true); setMessage(data.videos.length ? "" : "The playlist is empty. Build a mix first.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Couldn't open the station."); }
  }
  return <section className="station-player"><div className="toolbar"><button className="secondary" disabled={!playlistId || saving} onClick={watch}>Play my TV queue here</button>{open ? <button className="text-button" onClick={() => setOpen(false)}>Close player</button> : null}</div>
    {open && videos[index] ? <><div className="player-screen" ref={host} /><h3>{videos[index].title}</h3><p>{videos[index].channelTitle}</p><div className="toolbar"><button disabled={saving} onClick={() => advance("skip")}>Skip &amp; remember</button><button className="secondary" disabled={saving} onClick={() => advance("watched")}>Watched &amp; next</button><button className="text-button" disabled={saving} onClick={() => advance("block-channel")}>Less of this channel</button></div></> : null}
    <p role="status">{message}</p><small>This plays your existing TV playlist. Hunts run on the server while this page is closed. Two minutes watched counts toward the 50% TV refresh threshold; native YouTube/TV-app progress is unavailable.</small>
  </section>;
}

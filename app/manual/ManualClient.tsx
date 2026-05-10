"use client";

import { useState } from "react";
import { playlistLabels, type PlaylistKey, type ProcessedVideo } from "@/lib/config";

const targetKeys: PlaylistKey[] = [
  "next",
  "lateNightShows",
  "newNj",
  "podcasts",
  "news",
  "games",
  "football",
  "richReminders"
];

export default function ManualClient({ videos }: { videos: ProcessedVideo[] }) {
  const [videoId, setVideoId] = useState("");
  const [targetKey, setTargetKey] = useState<PlaylistKey>("next");
  const [message, setMessage] = useState("");

  async function submit(dryRun: boolean) {
    setMessage("");
    const res = await fetch("/api/manual-override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId, targetKey, dryRun })
    });
    const data = await res.json();
    setMessage(res.ok ? data.action ?? "Manual override complete" : data.error ?? "Manual override failed");
  }

  return (
    <>
      <section className="panel">
        <h2>Move a video by ID</h2>
        <div className="grid">
          <label>
            YouTube video ID
            <input value={videoId} onChange={(event) => setVideoId(event.target.value.trim())} placeholder="dQw4w9WgXcQ" />
          </label>
          <label>
            Target playlist
            <select value={targetKey} onChange={(event) => setTargetKey(event.target.value as PlaylistKey)}>
              {targetKeys.map((key) => (
                <option key={key} value={key}>
                  {playlistLabels[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={() => submit(true)} disabled={!videoId}>
            Dry-run override
          </button>
          <button type="button" onClick={() => submit(false)} disabled={!videoId}>
            Apply override
          </button>
        </div>
        {message ? <p>{message}</p> : null}
      </section>

      <section>
        <h2>Recent processed videos</h2>
        <table>
          <thead>
            <tr>
              <th>Video</th>
              <th>Target</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.videoId}>
                <td>
                  <strong>{video.title ?? video.videoId}</strong>
                  <br />
                  <span className="muted">{video.videoId}</span>
                </td>
                <td>{video.targetPlaylistName ?? "Inbox"}</td>
                <td className={`status ${video.status}`}>{video.status}</td>
                <td>{video.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

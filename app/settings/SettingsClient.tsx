"use client";

import { useMemo, useState } from "react";
import { allPlaylistKeys, playlistLabels, requiredPlaylistKeys, type PlaylistIds, type PlaylistKey, type UserSettings } from "@/lib/config";
import type { SortResult } from "@/lib/janitor";

type Props = {
  initialSettings: UserSettings;
};

export default function SettingsClient({ initialSettings }: Props) {
  const [playlistIds, setPlaylistIds] = useState<PlaylistIds>(initialSettings.playlistIds ?? {});
  const [liveSortingEnabled, setLiveSortingEnabled] = useState(initialSettings.liveSortingEnabled);
  const [cleanupEnabled, setCleanupEnabled] = useState(initialSettings.cleanupEnabled);
  const [cleanupMode, setCleanupMode] = useState(initialSettings.cleanupMode ?? "age");
  const [excludedCleanupPlaylistKeys, setExcludedCleanupPlaylistKeys] = useState<PlaylistKey[]>(
    initialSettings.excludedCleanupPlaylistKeys ?? ["newNj"]
  );
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<SortResult[]>([]);
  const [busy, setBusy] = useState(false);

  const missingRequired = useMemo(
    () => requiredPlaylistKeys.filter((key) => !playlistIds[key]),
    [playlistIds]
  );

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playlistIds,
        liveSortingEnabled,
        cleanupEnabled,
        cleanupMode,
        excludedCleanupPlaylistKeys
      })
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed to save settings");
      return;
    }
    setLiveSortingEnabled(data.liveSortingEnabled);
    setCleanupEnabled(data.cleanupEnabled);
    setMessage("Settings saved. Live toggles only stay enabled after their dry-run has completed.");
  }

  async function validate(key: PlaylistKey) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/playlists/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: playlistIds[key] ?? "" })
    });
    const data = await res.json();
    setBusy(false);
    setMessage(data.valid ? `${playlistLabels[key]} validated: ${data.title}` : data.error ?? `${playlistLabels[key]} was not found`);
    if (data.playlistId) setPlaylistIds((current) => ({ ...current, [key]: data.playlistId }));
  }

  async function createMissing(key: PlaylistKey) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/playlists/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create playlist");
      return;
    }
    setPlaylistIds((current) => ({ ...current, [key]: data.playlistId }));
    setMessage(`Created private playlist: ${data.title}`);
  }

  async function scan(mode: "dry-run" | "live") {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Scan failed");
      return;
    }
    setResults(data.results);
    setMessage(`${mode === "dry-run" ? "Dry-run" : "Live"} scan complete.`);
  }

  async function cleanup(mode: "dry-run" | "live") {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Cleanup failed");
      return;
    }
    setResults(data.results);
    setMessage(`${mode === "dry-run" ? "Dry-run" : "Live"} cleanup complete.`);
  }

  return (
    <>
      <section className="panel">
        <h2>Playlist IDs</h2>
        <p>Paste playlist URLs or IDs. IDs are stored because playlist names can collide.</p>
        <div className="grid">
          {allPlaylistKeys.map((key) => (
            <label key={key}>
              {playlistLabels[key]} {requiredPlaylistKeys.includes(key as never) ? "*" : "(optional)"}
              <div className="toolbar">
                <input
                  value={playlistIds[key] ?? ""}
                  onChange={(event) => setPlaylistIds((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder="Playlist URL or ID"
                />
                <button type="button" className="secondary" onClick={() => validate(key)} disabled={busy || !playlistIds[key]}>
                  Validate
                </button>
                {key !== "inbox" && !playlistIds[key] ? (
                  <button type="button" className="secondary" onClick={() => createMissing(key)} disabled={busy}>
                    Create missing playlist
                  </button>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Automation</h2>
        <div className="grid">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={liveSortingEnabled}
              onChange={(event) => setLiveSortingEnabled(event.target.checked)}
            />
            Enable live sorting after dry-run
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={cleanupEnabled}
              onChange={(event) => setCleanupEnabled(event.target.checked)}
            />
            Enable 14-day cleanup after dry-run
          </label>
          <label>
            Cleanup mode
            <select value={cleanupMode} onChange={(event) => setCleanupMode(event.target.value as "age" | "done")}>
              <option value="age">Remove 14 days after sorting</option>
              <option value="done">Remove only when present in Done</option>
            </select>
          </label>
          <label>
            Exclude from cleanup
            <select
              multiple
              value={excludedCleanupPlaylistKeys}
              onChange={(event) =>
                setExcludedCleanupPlaylistKeys(Array.from(event.target.selectedOptions).map((option) => option.value as PlaylistKey))
              }
            >
              {allPlaylistKeys
                .filter((key) => key !== "inbox" && key !== "done")
                .map((key) => (
                  <option key={key} value={key}>
                    {playlistLabels[key]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button type="button" onClick={save} disabled={busy}>
            Save settings
          </button>
          <button type="button" className="secondary" onClick={() => scan("dry-run")} disabled={busy || missingRequired.length > 0}>
            Test scan dry-run
          </button>
          <button type="button" className="secondary" onClick={() => scan("live")} disabled={busy || !liveSortingEnabled}>
            Run live scan now
          </button>
          <button type="button" className="secondary" onClick={() => cleanup("dry-run")} disabled={busy}>
            Cleanup dry-run
          </button>
          <button type="button" className="secondary" onClick={() => cleanup("live")} disabled={busy || !cleanupEnabled}>
            Live cleanup now
          </button>
        </div>
        {missingRequired.length > 0 ? <p className="muted">Missing required playlists: {missingRequired.map((key) => playlistLabels[key]).join(", ")}</p> : null}
        {message ? <p>{message}</p> : null}
      </section>

      {results.length > 0 ? (
        <section>
          <h2>Dry-run results</h2>
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Target</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={`${result.videoId}-${result.action}`}>
                  <td>
                    <strong>{result.title ?? result.videoId}</strong>
                    <br />
                    <span className="muted">{result.channelTitle}</span>
                  </td>
                  <td>{result.targetPlaylistName ?? "Inbox"}</td>
                  <td className={`status ${result.status}`}>{result.status}</td>
                  <td>{result.reason}</td>
                  <td>{result.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

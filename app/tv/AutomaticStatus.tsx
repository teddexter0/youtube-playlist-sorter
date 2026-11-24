"use client";
import { useEffect, useState } from "react";
type Attempt = { id: string; at: string; station?: string; complete?: boolean; held?: boolean; added?: number; error?: string; warnings?: string[] };
export default function AutomaticStatus({ refresh, personal, personalDaily, onStart, disabled }: { refresh: boolean; personal: boolean; personalDaily: boolean; onStart: () => void; disabled: boolean }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { if (refresh) return; const controller = new AbortController(); fetch("/api/tv/status", { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("Run status could not be loaded."); const data = await response.json(); setAttempts(data.attempts); setError(""); }).catch(error => { if (error.name !== "AbortError") setError(error.message); }); return () => controller.abort(); }, [refresh]);
  return <div className="run-status" id="run-status"><h3>Your automatic run status</h3><p>TV and your custom channels run daily around <strong>7pm Nairobi time</strong>. {personalDaily ? "NEW NJ also runs daily at 7pm. Childhood, Pop Culture and Life Skills run daily around 9am." : personal ? "NEW NJ runs Friday around 7pm. Childhood, Pop Culture and Life Skills run Saturday around 9am." : "Only your selected channels are scheduled."}</p>{!personalDaily && <small>TV can refresh at half watched or once the queue is 48 hours old.</small>}
    {error ? <p role="alert">{error}</p> : attempts.length ? <ul>{attempts.slice(0, 4).map(run => <li key={run.id}><strong>{new Date(run.at).toLocaleString("en-GB",{ timeZone:"Africa/Nairobi",dateStyle:"medium",timeStyle:"short" })} EAT</strong> · {run.station ?? "TV"} · {run.error ? `Failed: ${run.error}` : run.held ? run.warnings?.[0] ?? "TV queue held." : run.complete ? run.added ? `${run.added} videos added` : run.warnings?.find(warning => warning.startsWith("No ")) ?? "No new picks added." : "Hunt started"}</li>)}</ul> : <p>No automatic attempts have been recorded yet.</p>}
    <button className="secondary" disabled={disabled} onClick={onStart}>Start automatic updates now</button><p className="fineprint">Enables your schedule and checks for updates now.</p>
  </div>;
}

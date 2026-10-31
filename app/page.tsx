import Link from "next/link";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";

export default async function HomePage() {
  const userId = getCurrentUserId();
  const settings = userId ? await getUserSettings(userId) : null;

  return (
    <>
      <section className="hero">
        <h1>Less scrolling. More watching.</h1>
        <p>
          Build a varied TV queue from your interests, or sort videos you save to Inbox.
          Open your playlist in YouTube on your phone and cast it to the TV.
        </p>
        <div className="toolbar">
          <Link href="/tv" className="button">Set up personal TV</Link>
          {userId ? (
            <Link href="/settings" className="button">
              Open settings
            </Link>
          ) : (
            <a href="/api/auth/google/start" className="button">
              Connect Google account
            </a>
          )}
          <Link href="/logs" className="button secondary">
            View logs
          </Link>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Status</h2>
          <p>{userId ? `Connected as ${settings?.email ?? userId}` : "Google is not connected yet."}</p>
          <p>
            Live sorting: <strong>{settings?.liveSortingEnabled ? "enabled" : "off"}</strong>
            <br />
            Cleanup: <strong>{settings?.cleanupEnabled ? "enabled" : "off"}</strong>
          </p>
        </div>
        <div className="panel">
          <h2>Safety defaults</h2>
          <p>
            Dry-run is required before live sorting or cleanup. The app never creates playlists on its own,
            avoids duplicate playlist inserts, and only removes playlist items during cleanup.
          </p>
        </div>
      </section>
    </>
  );
}

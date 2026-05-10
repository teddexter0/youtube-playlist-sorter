import Link from "next/link";
import SettingsClient from "@/app/settings/SettingsClient";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings, upsertUserSettings } from "@/lib/store";

export default async function SettingsPage() {
  const userId = getCurrentUserId();
  if (!userId) {
    return (
      <section className="panel">
        <h1>Connect Google first</h1>
        <p>The app needs YouTube playlist access to validate playlists and add playlist items.</p>
        <a href="/api/auth/google/start" className="button">
          Connect Google account
        </a>
      </section>
    );
  }

  let settings = await getUserSettings(userId);
  if (!settings) {
    await upsertUserSettings(userId, {});
    settings = await getUserSettings(userId);
  }

  return (
    <>
      <div className="toolbar">
        <Link href="/" className="button secondary">
          Home
        </Link>
      </div>
      <SettingsClient initialSettings={settings!} />
    </>
  );
}

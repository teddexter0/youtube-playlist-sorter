import ManualClient from "@/app/manual/ManualClient";
import { getCurrentUserId } from "@/lib/session";
import { getProcessedList } from "@/lib/store";

export default async function ManualPage() {
  const userId = getCurrentUserId();
  const videos = userId ? await getProcessedList(userId, 100) : [];

  if (!userId) {
    return (
      <section className="panel">
        <h1>Manual override</h1>
        <p>Connect Google to manually file a video into one of your configured playlists.</p>
        <a href="/api/auth/google/start" className="button">
          Connect Google account
        </a>
      </section>
    );
  }

  return (
    <>
      <h1>Manual override</h1>
      <p>Use this for one-off fixes. Rules editor is intentionally left out of the MVP.</p>
      <ManualClient videos={videos} />
    </>
  );
}

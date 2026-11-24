import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { envValue } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const id = getCurrentUserId();
  const user = id ? await getUserSettings(id) : null;
  const owner = envValue("PERSONAL_STATION_EMAIL");
  if (!owner || user?.email?.toLowerCase() !== owner.toLowerCase()) notFound();
  return <section className="panel">
    <h1>Move Personal TV storage</h1>
    <p>Copy and verify your settings, connected account, playlist history and saved interests in the dedicated database. The original copy is preserved.</p>
    <p>Current database: <strong>{envValue("FIREBASE_PROJECT_ID")}</strong></p>
    <form method="post" action="/api/account/migrate-storage"><button type="submit">Copy and verify my storage</button></form>
    <p><a href="/tv">Back to Personal TV</a></p>
  </section>;
}

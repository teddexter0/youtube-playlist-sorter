import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { defaultTvProfile } from "@/lib/tv-profile";
import { aiConfigured } from "@/lib/tv-ai";
import TvClient from "./TvClient";

export default async function TvPage() {
  const userId = getCurrentUserId();
  const user = userId ? await getUserSettings(userId) : null;
  return <>
    <section className="hero">
      <p className="eyebrow">YOUR INTERESTS. LESS SCROLLING.</p>
      <h1>Something good is on.</h1>
      <p>A varied YouTube queue for the end of your day. Recent uploads, older discoveries, and room to try something different.</p>
    </section>
    {user ? <TvClient initialProfile={user.tv ?? { ...defaultTvProfile, playlistId: user.playlistIds.tv ?? "" }} aiAvailable={aiConfigured()} /> :
      <section className="panel"><h2>Sign in with your YouTube account</h2><p>Connect Google to import interests from your YouTube likes and subscriptions. Set up a private TV playlist, preview your first lineup, then enable daily updates. Each person gets their own account data and preferences.</p><a className="button" href="/api/auth/google/start">Continue with Google / YouTube</a></section>}
  </>;
}

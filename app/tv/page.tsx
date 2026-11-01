import { getCurrentUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { tvProfileSchema } from "@/lib/tv-profile";
import { aiConfigured } from "@/lib/tv-ai";
import BroadcastStage from "./BroadcastStage";
import TvClient from "./TvClient";

export const dynamic = "force-dynamic";

export default async function TvPage() {
  const userId = getCurrentUserId();
  const user = userId ? await getUserSettings(userId) : null;
  return <>
    <BroadcastStage connected={Boolean(user)} />
    <div className="station-ticker" aria-hidden="true"><div>{[0, 1].map((i) => <span key={i}>A LITTLE MATCH DAY ✦ A LITTLE MOVIE MAGIC ✦ A LITTLE OUTSIDE YOUR BUBBLE ✦ </span>)}</div></div>
    {user ? <TvClient initialProfile={tvProfileSchema.parse(user.tv ?? { playlistId: user.playlistIds.tv ?? "" })} aiAvailable={aiConfigured()} email={user.email} autopilot={Boolean(user.stationAutopilot)} stations={user.stationProfiles} personal={Boolean(user.personalStationVersion)} /> :
      <section className="panel sign-in-panel" id="your-station"><p className="eyebrow">EVERYONE GETS THEIR OWN REMOTE.</p><h2>Your account.<br /><span className="cinema-type">Your little station.</span></h2><p>Bring your own Google / YouTube account. Your likes, settings and playlist stay separate from everyone else&apos;s. AI is optional; there&apos;s no shared taste profile.</p><a className="button big-build" href="/api/auth/google/start">Continue with Google / YouTube ↗</a><p className="fineprint">Google&apos;s testing/verification rules may restrict new accounts until the app owner finishes public launch. <a href="/setup">Connection help</a> · <a href="/privacy">How your data is used</a></p></section>}
  </>;
}

import Link from "next/link";
import { getCurrentUserId } from "@/lib/session";
import BroadcastStage from "./tv/BroadcastStage";

export default function HomePage() {
  const connected = Boolean(getCurrentUserId());
  return <>
    <BroadcastStage connected={connected} />
    <div className="station-ticker" aria-hidden="true"><div>{[0, 1].map((i) => <span key={i}>MATCH DAY ✦ MOVIE MAGIC ✦ LITTLE WONDERS ✦ SOMEWHERE NEW ✦ GOOD SOUNDS ✦ NO MORE SAME OLD ✦ </span>)}</div></div>
    <section className="welcome-section" id="your-station"><p className="eyebrow">REMEMBER WHEN SOMETHING GOOD JUST CAME ON?</p><h2>That feeling.<br /><span className="cinema-type">Your kind of television.</span></h2>
      <div className="welcome-grid"><article><span className="welcome-number">01</span><h3>Your taste.<br />A wider world.</h3><p>Start with your own likes and subscriptions. Leave a little room for something you&apos;ve never stumbled across.</p></article><article><span className="welcome-number">02</span><h3>A little of this.<br />A little of that.</h3><p>No one-topic takeover. Rotate channels, sprinkle in older gems, and keep the heavy talks for another time.</p></article><article><span className="welcome-number">03</span><h3>Skip the hunt.<br />Keep the good part.</h3><p>Build a private playlist now, or have a new mix waiting each evening. All the watching happens in YouTube.</p></article></div>
      <Link className="button big-link" href="/tv">Let&apos;s make your station ↗</Link>
    </section>
  </>;
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal TV — Good stuff is still on.",
  description: "Your own little YouTube station. Familiar favourites, unexpected discoveries, and better evenings."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="checker-logo" aria-hidden="true"><b>P</b><b>TV</b></span><span>personal<span className="brand-script">television</span></span><span className="sr-only">YouTube Playlist Sorter</span>
          </Link>
          <nav>
            <Link href="/tv" className="nav-station">Your station ↗</Link>
            <details className="nav-tools"><summary>Behind the screen +</summary><div><Link href="/settings">Inbox sorter settings</Link><Link href="/logs">Activity log</Link><Link href="/manual">Manual sorting</Link><Link href="/setup">Connection setup</Link></div></details>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer"><span className="footer-wordmark">GOOD STUFF IS STILL ON.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">House rules</Link><Link href="/credits">Scenery &amp; credits</Link><a href="https://github.com/teddexter0/youtube-playlist-sorter/issues">Say hello ↗</a></div><p>A personal YouTube queue. No ads added by this app. YouTube playback may include its own ads.</p></footer>
      </body>
    </html>
  );
}

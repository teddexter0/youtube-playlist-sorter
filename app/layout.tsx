import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube Playlist Sorter + Personal TV",
  description: "Discover a varied personal TV queue and sort your saved YouTube videos."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            YouTube Playlist Sorter
          </Link>
          <nav>
            <Link href="/tv">Personal TV</Link>
            <Link href="/settings">Settings</Link>
            <Link href="/logs">Logs</Link>
            <Link href="/manual">Manual override</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

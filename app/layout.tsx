import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube Playlist Auto-Janitor",
  description: "Sort a custom YouTube Inbox playlist into curated playlists."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            YouTube Playlist Auto-Janitor
          </Link>
          <nav>
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

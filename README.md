# YouTube Playlist Auto-Janitor

Do you use YouTube? Plethora of interests in channels? Procrastinated Watch Laters? Then try this thing over here. It auto-sifts your dynamic tastes into curated playlists from what you would otherwise spend less optimal, less interested time going down in Watch Later. As per the API, we cannot officially use Watch Later, so make your own playlist called `Inbox`. Add your kind of videos there: sports highlights and analysis, cartoon recaps, celebrity tabloids, fashion trends, philosophy education, cars, games, faith, money reminders, name it. Let the magic work.

Tech stack: Next.js 14 App Router, TypeScript, Firebase Firestore, Google OAuth, YouTube Data API v3, and Vercel Cron. The cron runs daily at 7pm EAT using `0 16 * * *` UTC, starts in dry-run mode, stores encrypted refresh tokens, avoids duplicate playlist inserts, inserts target videos in ascending duration order, and only removes playlist items during cleanup.

## Sorting rules

Classification is deterministic and uses title, description, hashtags, tags, top relevant comments, owner channel title, owner channel ID, duration, and whether the owner channel is in your subscriptions. Niche terms to their specific playlists of choice

Target playlists are kept in ascending video length by inserting each new video at the position where its duration belongs, shortest at the top and longest at the bottom.

## Cleanup limits

The YouTube Data API does not expose personal watch-progress percentages such as "watched more than 60%." The supported cleanup modes are therefore:

- `age`: remove sorted playlist items after they have been in the target playlist for at least 14 days.
- `done`: remove sorted playlist items only after you add the video to the configured `Done` playlist.

Industry-standard workarounds for true watch-progress cleanup are a small browser extension that records local YouTube progress into your own backend, or a manual `Done` playlist. The app keeps the official API-only path by default.

## Environment

Copy `.env.example` to `.env.local` and fill in Google OAuth, Firebase Admin, encryption, and cron values. Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` as a long random string or a 64-character hex key.

## Local dev

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, connect Google, paste playlist URLs or IDs, validate them, then run a dry-run scan before enabling live sorting.

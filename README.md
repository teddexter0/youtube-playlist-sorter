# YouTube Playlist Sorter + Personal TV

## Personal TV: the refined goal

Open YouTube at the end of the day and have a varied playlist ready, without spending an hour collecting videos first. `/tv` adds discovery alongside the existing Inbox sorter. It produces a normal YouTube playlist you can open on phone, desktop or TV. Start playback in YouTube and cast using YouTube's controls; this app does not remotely start playback or casting. Your laptop can be off when the app is deployed with working scheduled execution.

### Implemented

- Google/YouTube sign-in imports a starting interest profile from a bounded sample of up to 50 liked videos and 50 subscriptions, using YouTube topic metadata. The **Build my TV playlist** action creates or reconnects a private TV playlist and fills it immediately. Deleted playlists are recreated only after a confirmed missing result; permission/quota failures are surfaced without creating duplicates. **Refresh interests from YouTube** imports the profile without adding videos. Subscribed channel names are a fallback if topic metadata is unavailable. Empty accounts can enter interests manually. There is no automatic import of ChatGPT memories.
- Separate per-user avoid terms, seed playlists, duration budget and older-content target. Optional native YouTube likes guide AI taste matching and suppress those exact videos from replay. Subscription uploads supply candidates. Ted's example interests remain opt-in.
- Search up to four rotating interests per run, with recent (last 30 days) and archive (over one year old) searches. Sample four rotating subscribed channels' uploads and up to three seed playlists. Subscriptions alone are not a complete picture of someone's interests.
- Build up to 12 picks within a 15–240 minute budget, with at most two videos per channel and preference for alternating topics. The archive percentage is a soft count target; availability, diversity and duration can override it. This is a lineup budget per top-up, not a cap on total runtime already queued.
- Optional AI relevance and shared-TV suitability ranking using Vercel AI Gateway. Only supplied candidate IDs can be selected. Reject omitted, unsuitable or low-scored candidates. AI errors stop the run rather than bypassing the filter.
- Conservative shared-TV search/metadata screening. Respectful coverage of a religion, race, orientation or political view is not a reason for exclusion. Metadata and AI cannot guarantee that actual video/audio content will offend nobody. No transcript or full-video analysis is currently performed.
- Manual builds and **Add videos now** work without enabling daily updates. Preview or complete a manual build before enabling daily live top-ups. Changing profile preferences requires another preview. A live run discovers again; it does not publish an immutable copy of the preview.
- Append to a dedicated TV playlist without deleting/reordering its existing entries. Stop topping up at 40 queued videos. Remove finished items in YouTube. TV is not part of the Inbox cleanup history.
- Avoid current playlist duplicates, the latest 500 delivered IDs and up to 300 explicit feedback entries. Per-user run leases prevent concurrent app runs; partial successes are recorded individually. A YouTube success followed by a database/network failure cannot be made fully atomic across the two services; a retry rechecks the target playlist.
- Like, skip, watched and block-channel controls, including entering a video ID after watching on TV. Likes inform AI ranking; skip/watched suppress that video; channel blocks suppress that channel. Feedback does not delete queued videos. Native YouTube skips are not observed.
- The existing daily sort cron also processes users with `tv.liveEnabled`, independently of Inbox sorting being enabled, at **7pm Nairobi time** (`0 16 * * *` UTC). API handlers request up to 300 seconds; verify your hosting plan permits that runtime. Multi-user scale will require a job queue/per-user scheduling and a quota budget.

### Set up your first lineup

1. Configure Google OAuth, YouTube Data API, the existing Firebase Admin connection, encryption and cron secret using `.env.example`. Confirm the intended Firestore database and its edition before provisioning or changing infrastructure; no database is provisioned by this change.
2. Connect your Google/YouTube account. Open `/tv` and click **Build my TV playlist** to import initial taste signals, create/reconnect a private TV playlist and add videos immediately. Existing saved interests are preserved. The result reports videos added, no eligible picks, or a specific fill failure.
3. Review or refine the suggested interests, optionally add seed playlists, choose your budget, and save with daily TV off. No Inbox or category playlists are required for TV mode.
4. Preview. Inspect the reasons and mix. Enable daily TV and save again. Use **Add videos now** for another manual fill; daily runs only happen after you opt in.
5. Open the playlist in the YouTube mobile app, play and cast as usual. Provide explicit feedback here when useful.

AI ranking is optional and **billed separately from ChatGPT subscriptions**. On Vercel, authentication uses the deployment's `VERCEL_OIDC_TOKEN`; an explicit `AI_GATEWAY_API_KEY` takes precedence when supplied. Set server-only `TV_AI_MODEL` to a current gateway model supporting Chat Completions JSON-schema output. Local/external hosting also needs an AI Gateway key or a valid pulled OIDC token. Enable the UI toggle only if you consent to sending your interests, avoid terms, candidate metadata and explicitly liked video titles to that provider. No model ID is hardcoded in source. Without AI, the app uses search relevance, metadata screening and diversity rules; it does not claim ChatGPT-level taste matching. The native REST integration adds no SDK dependency. Gateway credits or customer verification can still be required.

### Platform limits and remaining validation

- Official YouTube APIs cannot access Watch Later or personal watch history/progress. A normal TV/Inbox playlist is supported. Truly automatic learning from native playback would need another consented integration, such as a browser extension; that is not implemented.
- This release does not promise human-equivalent recommendation accuracy. Validate several evenings of picks, record relevance/suitability feedback, and refine interests before relying on it unattended. Skips only suppress their exact video; they do not yet train a negative-interest model.
- Every preview/live run can make up to eight search calls plus subscription, playlist, video and insert calls. Repeated previews consume API quota; this is not a zero-cost unlimited service. Production scaling needs rate limiting and shared quota accounting.
- The linked production project has Firebase/encryption settings, but Google OAuth client ID and secret were absent during release preparation. `/setup` identifies incomplete settings; `/api/health` checks database access and reports readiness without returning user data or secrets. Real OAuth, database edition/indexes, gateway model compatibility, playlist writes, scheduled execution, playback and phone-to-TV casting require a connected account. Mock tests cover selection, run gates, duplicate prevention, partial failures and AI failure behavior.

### Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Original Inbox sorter

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

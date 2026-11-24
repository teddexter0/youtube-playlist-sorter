# Playlist Sorter & Personal TV

Organise saved YouTube videos and build personalised playlists from your interests, subscriptions and likes. Play the resulting playlists in YouTube on desktop, mobile or TV.

## Features

- Google sign-in with separate settings, playlists and feedback for each account.
- Inbox sorting into configured categories.
- TV discovery using interests, subscriptions, likes and reference playlists.
- Duration budgets, topic limits, discovery preferences and optional content filters.
- Up to four viewer-defined automatic playlists for new accounts; existing lineups are preserved.
- Optional sports selections, familiar people and controlled guest discovery. Simple descriptions and detailed interests both work.
- Full-page scenic backgrounds, visible navigation and an optional guided tour.
- Preview selections before enabling scheduled updates.
- Optional AI ranking for relevance and metadata-based suitability checks.
- Like, skip, watched and block-channel feedback.
- Childhood recommendations based on an account's own show catalogue and reference links, rather than generic children's entertainment.
- A directory of official studio/streaming playlists and discovery from publisher-owned trailer collections.
- Account disconnect and deletion of the signed-in account's app data.

## How it works

Google OAuth and the YouTube Data API provide authorised account signals and playlist management. Initial interests come from a bounded sample of up to 50 liked videos and 500 subscriptions. Users can adjust their interests at any time.

Discovery combines topic searches, subscription uploads and reference playlists. Selection applies duration and diversity rules, avoids previously delivered videos and respects explicit feedback. Without AI, selection uses metadata and deterministic rules. Skips suppress individual videos rather than training a general negative-interest model.

Scheduled jobs run on the server, so the website does not need to remain open. Enabled updates, valid Google access, hosting configuration and sufficient API quota are required.

Station autopilot supports themed weekly playlists. Failed or missed weekly hunts can retry on the next evening check. TV can replace the queue once half the videos qualify as watched or the queue is 48 hours old. Two minutes of recorded playback, completing a shorter clip, or explicitly marking a video watched qualifies. The current queue stays in place until replacement picks reach YouTube. Except for Childhood Recaps, ranking also uses views per day since publication as a signal for recent popularity.

## Account data and personalisation

Firestore stores documents and fields rather than SQL rows and columns. Records are scoped to `users/{googleUserId}`. Server handlers obtain this ID from the signed session, rather than trusting a browser-supplied user ID.

| Record or field | Purpose |
| --- | --- |
| `playlistIds`, `tv`, `stationProfiles` | Destinations, interests, duration limits and station preferences |
| `enabledStations`, `stationProfiles.*.displayName` | Explicitly selected automatic channels and their names; new accounts start with the main TV mix only |
| `tv.selectedSports`, `favoriteCelebrities`, `celebrityDiscoveryPercent` | Account-specific sports searches, up to 500 familiar names, and new-guest discovery |
| `stationProfiles.childhood.franchises`, `referenceUrls`, `preferredHandles` | Account-specific nostalgia titles, source references and preferred recap creators |
| `tvFeedback` | Like, skip, watched or channel-block actions, channel IDs and timestamps |
| `tvHistory`, `tvRecent` | Recent deliveries, categories, channels and timestamps for variety and repeat prevention |
| `tvSearchCursor`, `stationCursors` | Rotate discovery topics between successful runs |
| `watched/{videoId}` | Seen-video records with source and timestamp; delivery is not proof of watching |
| `playback/{videoId}` | App-recorded seconds, completion state and recent event IDs for deduplication |
| `stationRefresh/{station}` | Refresh cycle, phase and timestamp for retries |
| `processedVideos`, `targetPlaylistCache`, `logs` | Inbox processing, duplicate checks and operational diagnostics |
| `encryptedRefreshToken` | Encrypted Google background-access token, excluded from browser settings responses |

These records support account-specific recommendations and reliability. They do not provide native YouTube history access, and the app does not train a custom AI model on user data. Account deletion removes nested app records and attempts token revocation; YouTube playlists remain in the user's account.

The account document is versioned and stores bounded preference/history summaries. Per-video playback, seen records, processed items and logs live in subcollections rather than an ever-growing account document. Playback and run claims use transactions; event IDs prevent duplicate playback samples from inflating counts. Public channel facts are cached separately from private account preferences. Studio selections belong to each account's `tv.studioHandles`; they supplement trailers and scene clips without replacing its other discovery sources.

OAuth start and callback handlers are dynamic and uncached. Sign-in starts on the registered callback host so state cookies remain on the correct domain across aliases.

## Setup

Requirements: Node.js with npm, a Google Cloud OAuth client with YouTube Data API enabled, Firebase Admin credentials for an existing Firestore database, and a host capable of scheduled execution.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and supply Google OAuth, Firebase Admin, token-encryption and cron settings. Keep credentials server-side and out of version control.
3. Register the exact callback URL for your environment in Google Cloud: `/api/auth/google/callback`.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Connect Google and open `/tv` to build a playlist. For Inbox sorting, configure and validate source and destination playlist IDs.
6. Review a preview before enabling live scheduled processing. `/setup` and `/api/health` report configuration readiness.

To accept users beyond listed testers, configure Google's OAuth audience and publishing status appropriately and complete any required verification. Application code or a readiness response alone does not establish public OAuth approval.

### Optional AI ranking

Configure `TV_AI_MODEL` with a supported Vercel AI Gateway model. Authentication uses `AI_GATEWAY_API_KEY` or Vercel OIDC credentials when available. AI usage is billed separately from ChatGPT subscriptions.

When enabled, ranking sends configured interests, avoid terms, relevant liked-video titles and candidate metadata to the configured provider. It assesses metadata rather than full video or audio. Failed AI ranking stops the run rather than bypassing the configured filter.

### Scheduling

`vercel.json` defines daily processing at 16:00 UTC (19:00 Africa/Nairobi) and an additional Saturday station slot at 06:00 UTC (09:00 Africa/Nairobi). Station cadence and account settings determine which playlists run.

Protect cron endpoints with `CRON_SECRET`. Confirm hosting support for the schedules and requested function runtime. Larger deployments need per-user jobs, rate limiting and quota accounting.

## Limitations

- Marked Shorts and all videos of three minutes or less are excluded across discovery and Inbox sorting. This conservative policy also excludes ordinary short trailers and clips, because public API metadata cannot reliably identify their source aspect ratio.
- Horror exclusion uses title/description screening and, when enabled, AI assessment. An approved studio does not override that setting; neither method certifies unseen video content.
- The YouTube Data API does not expose personal watch history, native-app playback progress or Watch Later. Use a regular Inbox playlist for sorting.
- Automatic playback counting currently works only in the app's player. Native YouTube or TV-app viewing cannot satisfy the TV refresh threshold automatically. Manual watched marks are supported.
- Takeout history imports can suppress previously seen videos but do not verify playback duration. Google's separate Data Portability API supports recurring exports in eligible regions; it is not integrated here and currently does not list Kenya as supported.
- Metadata filters and AI cannot guarantee an entire video's contents or suitability.
- Search and playlist operations consume API quota. Google access may expire or be revoked.
- YouTube writes and Firestore updates cannot form a single atomic transaction. Run leases, recorded successes and playlist rechecks reduce duplicate work after partial failures.
- Public sign-in, playlist writes, AI requests and scheduled jobs require verification against the actual deployment and a consenting account. Local mock tests do not establish live readiness.

Inbox cleanup removes app-sorted playlist entries after 14 days (`age`) or after the user adds them to a configured Done playlist (`done`). It removes playlist entries, not underlying videos.

## Development checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Builds do not create, clear or refill playlists. Account-specific preference repairs merge into the matching account when it signs in; other accounts are unchanged. Actual playlist writes happen only through the existing enabled jobs or explicit build actions.

## Stack and references

Next.js 14 App Router, React, TypeScript, Firebase Admin / Firestore, Google OAuth, YouTube Data API v3 and Vercel Cron. Optional ranking uses Vercel AI Gateway.

Public information pages: `/privacy`, `/terms` and `/credits`.

- [YouTube Data API](https://developers.google.com/youtube/data)
- [Google Data Portability availability](https://support.google.com/accounts/answer/14452558)
- [Data Portability recurring access](https://developers.google.com/data-portability/user-guide/time-based)

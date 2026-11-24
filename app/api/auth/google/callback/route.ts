import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getYouTubeAccountTaste, oauthClient, youtubeScope } from "@/lib/google";
import { setSessionCookie } from "@/lib/session";
import { getUserSettings, storeRefreshToken, upsertUserSettings } from "@/lib/store";
import { defaultTvProfile } from "@/lib/tv-profile";
import { tvErrorDetails } from "@/lib/tv-error";
import type { UserSettings } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function finish(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("cache-control", "private, no-store");
  response.cookies.delete("yt_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state || state !== request.cookies.get("yt_oauth_state")?.value) {
    return NextResponse.json({ error: "Google sign-in expired or could not be verified. Start again." }, { status: 400 });
  }
  if (request.nextUrl.searchParams.has("error")) return finish(request, "/setup?authError=permission-denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) return finish(request, "/setup?authError=connection-failed");
    const scopes = tokens.scope?.split(/\s+/) ?? (await client.getTokenInfo(tokens.access_token)).scopes;
    if (!scopes.includes(youtubeScope)) return finish(request, "/setup?authError=youtube-permission");
    client.setCredentials(tokens);

    const { data: profile } = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    const userId = profile.id;
    if (!userId) return finish(request, "/setup?authError=connection-failed");

    const existing = await getUserSettings(userId) as (UserSettings & { encryptedRefreshToken?: string }) | null;
    const refreshToken = tokens.refresh_token || (existing?.encryptedRefreshToken ? decryptSecret(existing.encryptedRefreshToken) : "");
    if (!refreshToken) return finish(request, "/setup?authError=offline-access");
    // Use the same refresh-only credentials as scheduled jobs, so sign-in
    // succeeds only when background access actually works.
    const background = oauthClient();
    background.setCredentials({ refresh_token: refreshToken });
    const youtube = google.youtube({ version: "v3", auth: background });
    const { token } = await background.getAccessToken();
    if (!token || !(await background.getTokenInfo(token)).scopes.includes(youtubeScope)) {
      return finish(request, "/setup?authError=offline-access");
    }
    await youtube.channels.list({ part: ["id"], mine: true });
    await upsertUserSettings(userId, profile.email ? { email: profile.email } : {});
    if (tokens.refresh_token) await storeRefreshToken(userId, encryptSecret(tokens.refresh_token));

    if (!existing?.tv) {
      try {
        const taste = await getYouTubeAccountTaste(youtube);
        await upsertUserSettings(userId, { tv: { ...defaultTvProfile, interests: taste.interests } });
      } catch {
        // The user can retry the optional taste import from Personal TV.
      }
    }
    setSessionCookie(userId);
    return finish(request, "/tv?youtube=connected");
  } catch (error) {
    const { code } = tvErrorDetails(error);
    console.warn("Google connection check failed", { code });
    return finish(request, `/setup?authError=${code === "RECONNECT_GOOGLE" ? "offline-access" : code === "YOUTUBE_QUOTA" ? "quota" : "connection-failed"}`);
  }
}

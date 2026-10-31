import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { getYouTubeAccountTaste, oauthClient } from "@/lib/google";
import { setSessionCookie } from "@/lib/session";
import { getUserSettings, storeRefreshToken, upsertUserSettings } from "@/lib/store";
import { defaultTvProfile } from "@/lib/tv-profile";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state || state !== request.cookies.get("yt_oauth_state")?.value) {
    return NextResponse.json({ error: "Google sign-in expired or could not be verified. Start again." }, { status: 400 });
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const userId = profile.data.id;
  if (!userId) return NextResponse.json({ error: "Google profile did not include an id" }, { status: 400 });

  await upsertUserSettings(userId, { email: profile.data.email ?? undefined });
  if (tokens.refresh_token) {
    await storeRefreshToken(userId, encryptSecret(tokens.refresh_token));
  }

  const existing = await getUserSettings(userId);
  if (!existing?.tv) {
    try {
      const taste = await getYouTubeAccountTaste(google.youtube({ version: "v3", auth: client }));
      await upsertUserSettings(userId, { tv: { ...defaultTvProfile, interests: taste.interests } });
    } catch {
      // Sign-in remains usable if account metadata is temporarily unavailable.
      // The user can retry the import from Personal TV.
    }
  }

  setSessionCookie(userId);
  const response = NextResponse.redirect(new URL("/tv", request.url));
  response.cookies.delete("yt_oauth_state");
  return response;
}

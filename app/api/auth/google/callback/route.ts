import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { oauthClient } from "@/lib/google";
import { setSessionCookie } from "@/lib/session";
import { storeRefreshToken, upsertUserSettings } from "@/lib/store";

export async function GET(request: NextRequest) {
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

  setSessionCookie(userId);
  return NextResponse.redirect(new URL("/settings", request.url));
}

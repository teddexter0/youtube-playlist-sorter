import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, clearSessionCookie } from "@/lib/session";
import { getUserSettings } from "@/lib/store";
import { adminDb } from "@/lib/firebase";
import { oauthClient } from "@/lib/google";
import { decryptSecret } from "@/lib/crypto";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const user = await getUserSettings(userId) as { encryptedRefreshToken?: string } | null;
  let revoked = true;
  if (user?.encryptedRefreshToken) {
    try { await oauthClient().revokeToken(decryptSecret(user.encryptedRefreshToken)); }
    catch { revoked = false; }
  }
  await adminDb().recursiveDelete(adminDb().collection("users").doc(userId));
  clearSessionCookie();
  return NextResponse.json({ ok: true, revoked, message: revoked ? "Your app data and connection were removed. Your YouTube playlists are still yours." : "Your app data was removed. Also remove access in your Google Account connections to finish revocation." }, { headers: { "cache-control": "private, no-store" } });
}

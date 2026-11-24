import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/google";
import crypto from "crypto";
import { missingGoogleConfig } from "@/lib/runtime-config";
import { NextRequest } from "next/server";
import { envValue } from "@/lib/runtime-config";

// OAuth state must be generated per request. Next 14 can otherwise prerender a
// GET handler and replay one state/cookie pair to everyone from the CDN.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function preventCaching(response: NextResponse) {
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("cdn-cache-control", "no-store");
  response.headers.set("vercel-cdn-cache-control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  if (missingGoogleConfig().length) return preventCaching(NextResponse.redirect(new URL("/setup", request.url)));
  const callback = new URL(envValue("GOOGLE_REDIRECT_URI"));
  // Start on the callback's own host so aliases/previews cannot strand the
  // host-only state cookie on a different domain.
  if (request.nextUrl.origin !== callback.origin) return preventCaching(NextResponse.redirect(new URL("/api/auth/google/start", callback.origin)));
  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set("yt_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600
  });
  return preventCaching(response);
}

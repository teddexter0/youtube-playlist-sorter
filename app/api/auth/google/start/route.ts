import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/google";
import crypto from "crypto";
import { missingGoogleConfig } from "@/lib/runtime-config";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  if (missingGoogleConfig().length) return NextResponse.redirect(new URL("/setup", request.url));
  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set("yt_oauth_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600
  });
  return response;
}

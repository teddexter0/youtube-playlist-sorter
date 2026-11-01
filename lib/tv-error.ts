import { z } from "zod";

// Pick only public diagnostics; never serialize Gaxios request config or tokens.
export function tvErrorDetails(error: unknown) {
  if (error instanceof z.ZodError) {
    const issues = error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`);
    return { status: 400, code: "INVALID_SETTINGS", error: `Check your settings. ${issues.join("; ")}` };
  }
  const failure = error as { message?: string; response?: { status?: number; data?: { error?: string | { errors?: { reason?: string }[]; status?: string } } } } | null;
  const provider = failure?.response?.data?.error;
  const reason = typeof provider === "string" ? provider : provider?.errors?.[0]?.reason ?? provider?.status;
  if (reason === "manualSortRequired") return { status: 400, code: "MANUAL_SORT_REQUIRED", error: "YouTube requires this playlist's ordering to be Manual before the app can keep videos shortest-first. Open the playlist in YouTube, set its sort order to Manual, then retry." };
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return { status: 429, code: "YOUTUBE_QUOTA", error: "YouTube API quota is exhausted for this Google Cloud project. Wait for quota to reset before building again." };
  }
  if (["accessNotConfigured", "SERVICE_DISABLED"].includes(reason ?? "")) {
    return { status: 503, code: "YOUTUBE_API_DISABLED", error: "Enable YouTube Data API v3 in the Google Cloud project that owns this OAuth client, then retry." };
  }
  if (["invalid_grant", "invalidCredentials", "authError", "insufficientPermissions"].includes(reason ?? "")) {
    return { status: 401, code: "RECONNECT_GOOGLE", error: "Reconnect Google and approve YouTube access, then try building again." };
  }
  const message = error instanceof Error ? error.message : "TV request failed.";
  const safeMessage = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(access_token|refresh_token|client_secret)=([^&\s]+)/gi, "$1=[redacted]").slice(0, 600);
  return { status: 400, code: reason ?? "TV_REQUEST_FAILED", error: safeMessage };
}

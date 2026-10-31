// PowerShell-created environment values can include a BOM or trailing newlines.
export function envValue(name: string) {
  return process.env[name]?.replace(/^\uFEFF/, "").trim() ?? "";
}

export function missingGoogleConfig() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"]
    .filter((name) => !envValue(name));
}

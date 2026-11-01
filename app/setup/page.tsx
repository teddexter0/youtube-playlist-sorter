import Link from "next/link";
import { missingGoogleConfig, envValue } from "@/lib/runtime-config";
import { aiConfigured } from "@/lib/tv-ai";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = missingGoogleConfig();
  const firebase = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"].every((key) => envValue(key));
  const projectNumber = envValue("GOOGLE_CLIENT_ID").match(/^\d+/)?.[0];
  return <section className="panel">
    <p className="eyebrow">GOOGLE / YOUTUBE SIGN-IN</p><h1>{missing.length ? "Google sign-in is being configured." : "Ready to connect your YouTube account."}</h1>
    <p>You will sign in with your normal Google account and approve YouTube access. Your likes and subscriptions help build your starting taste profile. Regular users do not need a Google Cloud project.</p>
    <details><summary>App owner: connection setup and status</summary>
    <p>Google/YouTube sign-in: {missing.length ? "needs configuration" : "configured"}<br />Firebase connection settings: {firebase ? "present" : "incomplete"}<br />AI Gateway authentication: {aiConfigured() ? "configured" : "not configured"}</p>
    {missing.length ? <>
      <p>This deployment needs these server settings: <strong>{missing.join(", ")}</strong>. Existing Firebase settings do not replace a Google OAuth client.</p>
      <p>In the Google Cloud project, enable YouTube Data API v3 and configure an external OAuth consent screen. Create a Web application OAuth client with this exact authorized redirect:</p>
      <code>https://youtube-playlist-sorter-kappa.vercel.app/api/auth/google/callback</code>
      <p>Save the client ID and client secret privately in this Vercel project&apos;s production environment, then redeploy. Do not paste the secret into chat. While the consent screen is in testing, add your Google account as a test user. Google testing-mode refresh tokens can expire; broader use needs the relevant Google publishing/verification steps.</p>
      <div className="toolbar"><a className="button" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud credentials</a><a className="button secondary" href="https://vercel.com/teddexter0-4827s-projects/youtube-playlist-sorter/settings/environment-variables" target="_blank" rel="noreferrer">Open Vercel settings</a></div>
    </> : <a className="button" href="/api/auth/google/start">Connect Google</a>}
    <h2>Let other people bring their own accounts</h2>
    <p>Account isolation is handled by the app. Google&apos;s audience and verification settings are a separate launch requirement. In Testing, only listed test users can sign in; deployment alone does not open access to everyone.</p>
    <ol><li>Open Google Auth Platform → Audience. For a public launch, use External / In production, and finish any verification Google requests.</li><li>In Branding, use this site&apos;s home page, <code>https://youtube-playlist-sorter-kappa.vercel.app/privacy</code> and <code>https://youtube-playlist-sorter-kappa.vercel.app/terms</code>.</li><li>Confirm your support email, domain ownership, requested scopes and verification demonstration in Google&apos;s Verification Center.</li><li>Test in a separate browser profile using a second Google account. It should begin with its own interests and an empty private queue, never another person&apos;s data.</li></ol>
    <a className="button secondary" href={`https://console.cloud.google.com/auth/audience${projectNumber ? `?project=${projectNumber}` : ""}`} target="_blank" rel="noreferrer">Open Google audience settings ↗</a>
    </details>
    <p><Link href="/tv">Back to Personal TV</Link></p>
  </section>;
}

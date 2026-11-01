// Idempotent, production-only deployment migration, explicitly requested by owner.
const fs = require("fs");
const ts = require("typescript");
const crypto = require("crypto");
const path = require("path");
const Module = require("module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) { return originalResolve.call(this, request.startsWith("@/") ? path.join(__dirname, "..", request.slice(2)) : request, parent, ...rest); };
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText, file);
const { stationProfiles, personalVersion } = require("../lib/station-presets.ts");
const clean = key => (process.env[key] || "").replace(/^\uFEFF/, "").trim();
const hash = profile => { const { liveEnabled, ...preferences } = profile; return crypto.createHash("sha256").update(JSON.stringify(preferences)).digest("hex"); };
async function main() {
  if (process.env.VERCEL_ENV !== "production" || !clean("PERSONAL_STATION_EMAIL") || !clean("PERSONAL_STATION_PROFILE")) return;
  const privatePreferences = JSON.parse(clean("PERSONAL_STATION_PROFILE"));
  const { cert, initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  initializeApp({ credential: cert({ projectId: clean("FIREBASE_PROJECT_ID"), clientEmail: clean("FIREBASE_CLIENT_EMAIL"), privateKey: clean("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n") }) });
  const db = getFirestore();
  const matches = await db.collection("users").where("email", "==", clean("PERSONAL_STATION_EMAIL")).get();
  let changed = 0;
  for (const doc of matches.docs) {
    await db.runTransaction(async tx => {
      const current = (await tx.get(doc.ref)).data();
      if (current.personalStationVersion >= personalVersion) return;
      if ((current.tvLockUntil ?? 0) > Date.now()) throw new Error("Personal station migration deferred: active playlist build.");
      const profiles = stationProfiles(current, true, privatePreferences);
      tx.update(doc.ref, { tv: profiles.tv, tvPreviewHash: hash(profiles.tv), stationProfiles: profiles, stationAutopilot: true, personalStationVersion: personalVersion, tvSearchCursor: 0, updatedAt: new Date().toISOString() });
      changed++;
    });
    let current = (await doc.ref.get()).data();
    if (!current.encryptedRefreshToken) { console.log(JSON.stringify({ stationProvisioning: "reconnect-needed" })); continue; }
    try {
      const { google } = require("googleapis");
      const keyRaw = clean("GOOGLE_TOKEN_ENCRYPTION_KEY");
      const key = /^[a-f0-9]{64}$/i.test(keyRaw) ? Buffer.from(keyRaw, "hex") : crypto.createHash("sha256").update(keyRaw).digest();
      const [iv, tag, payload] = current.encryptedRefreshToken.split(".");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const refresh = Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
      const auth = new google.auth.OAuth2(clean("GOOGLE_CLIENT_ID"), clean("GOOGLE_CLIENT_SECRET"), clean("GOOGLE_REDIRECT_URI"));
      auth.setCredentials({ refresh_token: refresh });
      const yt = google.youtube({ version: "v3", auth });
      const own = []; let pageToken;
      do { const result = await yt.playlists.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken }); own.push(...(result.data.items || [])); pageToken = result.data.nextPageToken; } while (pageToken && own.length < 500);
      const names = require("../lib/station-rules.ts").stationNames;
      for (const [station, title] of Object.entries(names)) {
        const profile = station === "tv" ? current.tv : current.stationProfiles[station];
        if (own.some(playlist => playlist.id === profile.playlistId)) continue;
        const found = own.find(playlist => playlist.snippet.title.toLowerCase() === title.toLowerCase());
        const id = found?.id || (await yt.playlists.insert({ part: ["snippet", "status"], requestBody: { snippet: { title, description: "Your personal station. Shorter videos first." }, status: { privacyStatus: "private" } } })).data.id;
        if (!id) throw new Error("No playlist ID");
        profile.playlistId = id;
        await doc.ref.update(station === "tv" ? { tv: profile, tvPreviewHash: hash(profile), "playlistIds.tv": id, "stationProfiles.tv": profile } : { ["stationProfiles." + station]: profile });
      }
      console.log(JSON.stringify({ stationProvisioning: "complete", playlists: 5 }));
      current = (await doc.ref.get()).data();
      if (current.personalStationInitialBuildVersion !== personalVersion) {
        const { runStations } = require("../lib/stations.ts");
        const result = await runStations(current, "evening");
        console.log(JSON.stringify({ initialStationBuild: result.map(row => ({ station: row.station, added: row.added ?? 0, failed: Boolean(row.error), reason: !row.error ? undefined : /quota/i.test(row.error) ? "YOUTUBE_QUOTA" : /invalid.grant|revoked|token/i.test(row.error) ? "RECONNECT_GOOGLE" : /manualSort|position/i.test(row.error) ? "MANUAL_SORT_REQUIRED" : "STATION_REQUEST_FAILED" })) }));
        if (result.every(row => !row.error)) await doc.ref.update({ personalStationInitialBuildVersion: personalVersion });
      }
    } catch (error) { console.log(JSON.stringify({ stationProvisioning: "pending", reason: /invalid.grant|revoked|token/i.test(error.message) ? "RECONNECT_GOOGLE" : /quota/i.test(error.message) ? "YOUTUBE_QUOTA" : "PROVIDER_REQUEST_FAILED" })); }
  }
  console.log(JSON.stringify({ personalStationMigration: "complete", matchedAccounts: matches.size, updatedAccounts: changed, version: personalVersion }));
}
main().catch(() => { console.error("Personal station migration failed; no secrets logged. Production build stopped."); process.exitCode = 1; });

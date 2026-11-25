// Called explicitly for a requested production refresh, scoped to the configured owner.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

async function run() {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (process.env.VERCEL_ENV !== "production" || process.argv[2] !== today) return;

  const resolve = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, ...args) {
    return resolve.call(this, request.startsWith("@/") ? path.join(__dirname, "..", request.slice(2)) : request, parent, ...args);
  };
  require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true }
  }).outputText, filename);

  const { adminDb } = require("../lib/firebase.ts");
  const { envValue } = require("../lib/runtime-config.ts");
  const { enableStations, runStations } = require("../lib/stations.ts");
  const { activeStationKeys } = require("../lib/station-rules.ts");
  const owner = envValue("PERSONAL_STATION_EMAIL");
  if (!owner) { console.log("Requested TV refresh: owner configuration missing."); return; }
  const matches = await adminDb().collection("users").where("email", "==", owner).limit(2).get();
  if (matches.size !== 1) { console.log("Requested TV refresh: account could not be uniquely matched."); return; }
  const ref = matches.docs[0].ref;
  let user = matches.docs[0].data();
  if (!user.encryptedRefreshToken || user.storageMigrating || !activeStationKeys(user).includes("tv")) {
    console.log("Requested TV refresh: account unavailable for TV."); return;
  }
  if (["append-lineup", "append-lineup-retry", "append-popculture"].includes(process.argv[3])) {
    const mode = process.argv[3];
    const options = mode === "append-lineup" ? { lineupUpgrade: true } : { lineupRetry: mode === "append-popculture" ? "popculture" : true };
    const results = await runStations(user, "evening", now, { trigger: "kickoff", ...options });
    console.log("Requested append-only lineup:", JSON.stringify({ automatic: Boolean(user.stationAutopilot), runs: results.map(({ station, added, appended, code, warnings }) => ({
      station, added, appended, code, sourceWarnings: warnings?.filter(warning => /YouTube could not find channel|No suitable unseen trailers|No new picks/.test(warning))
    })) }));
    return;
  }
  if (process.argv[3] === "append-three") {
    const marker = ref.collection("stationRuns").doc(today + "--requested-top-up");
    const claimed = await adminDb().runTransaction(async tx => {
      if ((await tx.get(marker)).exists) return false;
      tx.create(marker, { station: "tv", trigger: "requested-top-up", at: now.toISOString() });
      return true;
    });
    if (!claimed) { console.log("Requested TV top-up: already attempted."); return; }
    const { runTvForUser } = require("../lib/tv.ts");
    const { tvErrorDetails } = require("../lib/tv-error.ts");
    try {
      const result = await runTvForUser(user, "live", { manual: true, appendLimit: 3 });
      await marker.update({ complete: true, added: result.videos.length, warnings: result.warnings });
      console.log("Requested TV top-up:", JSON.stringify({ added: result.videos.length }));
    } catch (error) {
      const { code, error: message } = tvErrorDetails(error);
      await marker.update({ complete: false, error: message });
      console.log("Requested TV top-up:", JSON.stringify({ failure: code }));
    }
    return;
  }
  if (!user.stationAutopilot) {
    await enableStations(user, true);
    user = (await ref.get()).data();
  }
  if (process.argv[3] === "replace-lineup") {
    const { listPlaylistItems, youtubeForUser } = require("../lib/google.ts");
    const yt = youtubeForUser(user);
    const keys = activeStationKeys(user);
    const previous = await Promise.all(keys.map(async station => {
      const slot = ["childhood", "popculture", "lifeskills"].includes(station) ? "morning" : "evening";
      const claim = await ref.collection("stationRuns").doc(`${today}--${slot}--${station}`).get();
      const profile = station === "tv" ? user.tv : user.stationProfiles?.[station];
      const count = profile?.playlistId ? (await listPlaylistItems(yt, profile.playlistId, 500).catch(() => [])).length : 0;
      return { station, count, scheduled: claim.data()?.complete ?? null, issue: claim.data()?.error ?? null };
    }));
    console.log("Previous lineup:", JSON.stringify(previous));
    const results = await runStations(user, "evening", now, { trigger: "kickoff", replaceToday: true });
    const current = (await ref.get()).data();
    const status = await Promise.all(keys.map(async station => {
      const slot = ["childhood", "popculture", "lifeskills"].includes(station) ? "morning" : "evening";
      const marker = (await ref.collection("stationRuns").doc(`${today}--${slot}--${station}--replacement`).get()).data();
      const profile = station === "tv" ? current.tv : current.stationProfiles?.[station];
      return { station, targetMinutes: profile?.sessionMinutes, complete: marker?.complete === true,
        replacement: marker?.replacement, code: results.find(result => result.station === station)?.code, error: marker?.error };
    }));
    console.log("Requested replacement lineup:", JSON.stringify({ automatic: current.stationAutopilot, runs: status }));
    return;
  }
  if (process.argv[3] === "all-stations") {
    const results = await runStations(user, "evening", now, { trigger: "kickoff" });
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replaceAll("/", "-");
    const runs = await Promise.all(activeStationKeys(user).map(async station => {
      const slot = ["childhood", "popculture", "lifeskills"].includes(station) ? "morning" : "evening";
      const entry = (await ref.collection("stationRuns").doc(`${date}--${slot}--${station}`).get()).data();
      return { station, complete: entry?.complete === true, added: entry?.added ?? 0, held: entry?.held === true,
        code: results.find(result => result.station === station)?.code, trigger: entry?.trigger };
    }));
    console.log("Requested daily stations:", JSON.stringify({ automatic: user.stationAutopilot, runs }));
    return;
  }
  const [result] = await runStations(user, "evening", now, { trigger: "kickoff", onlyTv: true });
  if (!result) { console.log("Requested TV refresh: existing run already claimed."); return; }
  const failure = result.error && result.code;
  console.log("Requested TV refresh:", JSON.stringify({
    status: failure ? "failed" : result.held ? "held" : result.added ? "refreshed" : "no-suitable-picks",
    added: result.added ?? 0, ...(failure ? { failure } : {})
  }));
}

run().catch(error => {
  const code = typeof error.code === "string" && /^[a-zA-Z0-9_-]+$/.test(error.code) ? error.code : "UNKNOWN";
  console.log("Requested TV refresh: could not complete (" + code + ").");
});

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const test = require("node:test");
const assert = require("node:assert/strict");

const scope = "https://www.googleapis.com/auth/youtube";
let tokens, effects, existing;
const original = Module._load;
const target = path.resolve(__dirname, "../app/api/auth/google/callback/route.ts");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, filename);
Module._load = function(request, parent, ...args) {
  if (parent?.filename === target) {
    if (request === "googleapis") return { google: {
      oauth2: () => ({ userinfo: { get: async () => ({ data: { id: "owner" } }) } }),
      youtube: () => ({ channels: { list: async () => effects.push("verified-youtube") } })
    } };
    if (request === "@/lib/google") return { youtubeScope: scope, oauthClient: () => ({
      getToken: async () => ({ tokens }), setCredentials: () => {},
      getAccessToken: async () => ({ token: "background" }), getTokenInfo: async () => ({ scopes: [scope] })
    }) };
    if (request === "@/lib/crypto") return { encryptSecret: value => value, decryptSecret: value => value };
    if (request === "@/lib/session") return { setSessionCookie: () => effects.push("session") };
    if (request === "@/lib/store") return {
      getUserSettings: async () => existing, upsertUserSettings: async () => effects.push("settings"),
      storeRefreshToken: async () => effects.push("stored-token")
    };
    if (request === "@/lib/tv-profile") return {};
    if (request === "@/lib/tv-error") return { tvErrorDetails: () => ({ code: "RECONNECT_GOOGLE" }) };
  }
  return original.call(this, request, parent, ...args);
};
const { GET } = require(target);
Module._load = original;
const url = new URL("https://station.example/api/auth/google/callback?state=state&code=code");
const request = { url: url.href, nextUrl: url, cookies: { get: () => ({ value: "state" }) } };

test("identity-only consent cannot overwrite a saved YouTube grant or show a connected session", async () => {
  effects = [];
  tokens = { scope: "openid email", access_token: "access", refresh_token: "partial" };
  assert.equal(new URL((await GET(request)).headers.get("location")).searchParams.get("authError"), "youtube-permission");
  assert.deepEqual(effects, []);
});

test("callback checks background access before saving a new grant and opening TV", async () => {
  effects = [];
  existing = { tv: {} };
  tokens = { scope: `openid ${scope}`, access_token: "access", refresh_token: "fresh" };
  assert.equal(new URL((await GET(request)).headers.get("location")).searchParams.get("youtube"), "connected");
  assert.deepEqual(effects, ["verified-youtube", "settings", "stored-token", "session"]);
});

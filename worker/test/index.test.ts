import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest, sendDue, type Deps, type Env, type Message } from "../src/index.ts";

const subscription = {
  endpoint: "https://web.push.apple.com/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
};

function setup(options: { status?: number } = {}) {
  const data = new Map<string, string>();
  const sent: Message[] = [];
  const relayed: { url: string; init: RequestInit }[] = [];
  const clock = { now: 1_000_000 };
  const env: Env = {
    STORE: {
      get: async (key) => data.get(key) ?? null,
      put: async (key, value) => void data.set(key, value),
      delete: async (key) => void data.delete(key),
    },
    APP_KEY: "test-app-key",
    VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
    VAPID_SUBJECT: "mailto:owner@example.com",
  };
  const deps: Deps = {
    send: async (_subscription, message) => {
      sent.push(message);
      const status = options.status ?? 201;
      return { ok: status < 300, status, gone: status === 410, detail: "" };
    },
    fetch: async (input, init) => {
      relayed.push({ url: String(input), init: init ?? {} });
      return new Response("upstream body", { status: 200, headers: { "Content-Type": "text/plain" } });
    },
    now: () => clock.now,
  };
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handleRequest(
      new Request(`https://worker.example${path}`, {
        method,
        headers: { "X-App-Key": "test-app-key", "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      deps,
    );
  return { env, deps, data, sent, relayed, clock, call };
}

test("health answers without a key and everything else requires one", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/health", undefined, { "X-App-Key": "" })).status, 200);
  assert.equal((await call("GET", "/push/key", undefined, { "X-App-Key": "" })).status, 401);
  assert.equal((await call("GET", "/push/key", undefined, { "X-App-Key": "wrong-app-key" })).status, 401);
  assert.deepEqual(await (await call("GET", "/push/key")).json(), { publicKey: "public" });
});

test("preflight is answered with CORS headers and no key", async () => {
  const { env, deps } = setup();
  const response = await handleRequest(
    new Request("https://worker.example/push/send", { method: "OPTIONS", headers: { Origin: "https://someone.github.io" } }),
    env,
    deps,
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /X-App-Key/);
});

test("ALLOWED_ORIGINS limits which pages get CORS headers", async () => {
  const { env, deps } = setup();
  env.ALLOWED_ORIGINS = "https://someone.github.io";
  const from = (origin: string) =>
    handleRequest(new Request("https://worker.example/health", { headers: { Origin: origin } }), env, deps);
  assert.equal((await from("https://someone.github.io")).headers.get("Access-Control-Allow-Origin"), "https://someone.github.io");
  assert.equal((await from("https://evil.example")).headers.get("Access-Control-Allow-Origin"), null);
});

test("an immediate send needs a subscription, then delivers", async () => {
  const { call, sent } = setup();
  assert.equal((await call("POST", "/push/send", { title: "Hi" })).status, 502);

  assert.equal((await call("PUT", "/push/subscription", { nope: true })).status, 400);
  assert.equal((await call("PUT", "/push/subscription", subscription)).status, 200);
  assert.equal((await call("POST", "/push/send", { title: "Hi", body: "There" })).status, 200);
  assert.deepEqual(sent, [{ title: "Hi", body: "There" }]);
});

test("a delayed send waits for the timer and is sent once", async () => {
  const { call, env, deps, sent, clock } = setup();
  await call("PUT", "/push/subscription", subscription);
  const queued = await call("POST", "/push/send", { title: "Later", delaySeconds: 300 });
  assert.equal(queued.status, 200);
  assert.equal(sent.length, 0);

  clock.now += 299_000;
  assert.equal(await sendDue(env, deps), 0);
  clock.now += 1_000;
  assert.equal(await sendDue(env, deps), 1);
  assert.equal(await sendDue(env, deps), 0);
  assert.deepEqual(sent.map((message) => message.title), ["Later"]);

  const state = (await (await call("GET", "/push/pending")).json()) as { pending: unknown[] };
  assert.deepEqual(state.pending, []);
});

test("out-of-range delays are rejected", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/push/send", { delaySeconds: -1 })).status, 400);
  assert.equal((await call("POST", "/push/send", { delaySeconds: 8 * 24 * 60 * 60 })).status, 400);
});

test("a subscription the push service reports gone is forgotten", async () => {
  const { call, data } = setup({ status: 410 });
  await call("PUT", "/push/subscription", subscription);
  assert.equal((await call("POST", "/push/send", {})).status, 502);
  assert.equal(data.has("subscription"), false);
});

test("the relay forwards to NovelAI hosts only and passes the token through", async () => {
  const { call, relayed, data } = setup();
  const response = await call("POST", "/relay/image/ai/generate-image-stream", { model: "x" }, { Authorization: "Bearer nai-token" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "upstream body");
  assert.equal(response.headers.get("X-Relayed-From"), "https://image.novelai.net");
  assert.equal(relayed[0]!.url, "https://image.novelai.net/ai/generate-image-stream");
  const forwarded = new Headers(relayed[0]!.init.headers);
  assert.equal(forwarded.get("Authorization"), "Bearer nai-token");
  assert.equal(forwarded.get("X-App-Key"), null, "the app key stays with the Worker");
  assert.equal(data.size, 0, "nothing about the request is stored");

  await call("GET", "/relay/text/user/subscription");
  assert.equal(relayed[1]!.url, "https://text.novelai.net/user/subscription");
  assert.equal((await call("GET", "/relay/elsewhere/anything")).status, 404);
  assert.equal(relayed.length, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest, sendDue, type Deps, type Env, type Message, type Pending } from "../src/index.ts";

const subscription = {
  endpoint: "https://web.push.apple.com/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
};

const MINUTE = 60_000;

function setup(options: { status?: number } = {}) {
  const data = new Map<string, string>();
  const sent: Message[] = [];
  const clock = { now: 1_000_000_000 };
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
  const pending = async () => ((await (await call("GET", "/push/pending")).json()) as { pending: Pending[] }).pending;
  return { env, deps, data, sent, clock, call, pending };
}

test("health answers without a key and everything else requires one", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/health", undefined, { "X-App-Key": "" })).status, 200);
  assert.equal((await call("GET", "/push/key", undefined, { "X-App-Key": "" })).status, 401);
  assert.equal((await call("GET", "/push/key", undefined, { "X-App-Key": "wrong-app-key" })).status, 401);
  assert.equal((await call("PUT", "/reminders", { reminders: [] }, { "X-App-Key": "" })).status, 401);
  assert.deepEqual(await (await call("GET", "/push/key")).json(), { publicKey: "public" });
});

test("preflight is answered with CORS headers and no key", async () => {
  const { env, deps } = setup();
  const response = await handleRequest(
    new Request("https://worker.example/reminders", { method: "OPTIONS", headers: { Origin: "https://someone.github.io" } }),
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

test("the app's list replaces the last one and each reminder is sent once when due", async () => {
  const { call, env, deps, sent, clock, pending } = setup();
  await call("PUT", "/push/subscription", subscription);
  const at = clock.now + 2 * MINUTE;
  const first = await call("PUT", "/reminders", {
    reminders: [
      { id: "task:a", at, title: "Call the bank", body: "It's time.", url: "./#/item/a", badge: 2 },
      { id: "morning:1", at: at + 60 * MINUTE, title: "Good morning", body: "2 due today." },
    ],
  });
  assert.deepEqual(await first.json(), { ok: true, count: 2, subscribed: true });

  // The task is edited on the phone: the new list drops the old morning summary and moves the task.
  await call("PUT", "/reminders", { reminders: [{ id: "task:a", at: at + MINUTE, title: "Call the bank", body: "It's time." }] });
  assert.deepEqual((await pending()).map((entry) => [entry.id, entry.at]), [["task:a", at + MINUTE]]);

  clock.now = at;
  assert.equal(await sendDue(env, deps), 0);
  clock.now = at + MINUTE + 5_000;
  assert.equal(await sendDue(env, deps), 1);
  clock.now += MINUTE;
  assert.equal(await sendDue(env, deps), 0, "not sent again on the next run");
  assert.deepEqual(sent, [{ tag: "task:a", title: "Call the bank", body: "It's time." }]);
  assert.deepEqual(await pending(), []);
});

test("a list sent again after a reminder went out does not send it twice", async () => {
  const { call, env, deps, sent, clock } = setup();
  await call("PUT", "/push/subscription", subscription);
  const reminders = [{ id: "task:a", at: clock.now + MINUTE, title: "A", body: "B" }];
  await call("PUT", "/reminders", { reminders });
  clock.now += MINUTE + 1_000;
  assert.equal(await sendDue(env, deps), 1);
  // The phone had not noticed the time passing and sends the same list again.
  await call("PUT", "/reminders", { reminders });
  clock.now += MINUTE;
  assert.equal(await sendDue(env, deps), 0);
  assert.equal(sent.length, 1);
});

test("a reminder that came due just before the list was replaced is still sent, once", async () => {
  const { call, env, deps, sent, clock } = setup();
  await call("PUT", "/push/subscription", subscription);
  const reminders = [{ id: "task:a", at: clock.now + MINUTE, title: "A" }];
  await call("PUT", "/reminders", { reminders });
  // The app is open as the time passes, and sends its list again before the timer has run.
  clock.now += MINUTE + 20_000;
  await call("PUT", "/reminders", { reminders });
  clock.now += 20_000;
  assert.equal(await sendDue(env, deps), 1);
  await call("PUT", "/reminders", { reminders });
  clock.now += MINUTE;
  assert.equal(await sendDue(env, deps), 0);
  assert.deepEqual(sent.map((message) => message.title), ["A"]);
});

test("reminders that are malformed, long past or far ahead are left out", async () => {
  const { call, clock, pending } = setup();
  const response = await call("PUT", "/reminders", {
    reminders: [
      { id: "ok", at: clock.now + MINUTE, title: "x".repeat(200), body: "", badge: 5000.7, tag: "t" },
      { id: "ok", at: clock.now + 2 * MINUTE, title: "Same id again wins" },
      { id: "past", at: clock.now - 16 * MINUTE, title: "Past" },
      { id: "far", at: clock.now + 61 * 24 * 60 * MINUTE, title: "Far" },
      { id: "", at: clock.now + MINUTE },
      { id: "test:sneaky", at: clock.now + MINUTE },
      { at: clock.now + MINUTE },
      "nonsense",
      null,
    ],
  });
  assert.equal(((await response.json()) as { count: number }).count, 1);
  assert.deepEqual(await pending(), [
    { id: "ok", at: clock.now + 2 * MINUTE, message: { title: "Same id again wins", body: "You have a reminder." } },
  ]);

  assert.equal((await call("PUT", "/reminders", { reminders: "no" })).status, 400);
  assert.equal((await call("PUT", "/reminders", { reminders: Array.from({ length: 301 }, () => ({})) })).status, 413);
  assert.equal((await call("GET", "/reminders")).status, 405);
});

test("a reminder found very late is dropped, and one a few minutes late is sent", async () => {
  const { call, env, deps, sent, clock } = setup();
  await call("PUT", "/push/subscription", subscription);
  await call("PUT", "/reminders", {
    reminders: [
      { id: "old", at: clock.now + MINUTE, title: "Old" },
      { id: "recent", at: clock.now + 20 * MINUTE, title: "Recent" },
    ],
  });
  // The timer did not run for 25 minutes.
  clock.now += 25 * MINUTE;
  assert.equal(await sendDue(env, deps), 1);
  assert.deepEqual(sent.map((message) => message.title), ["Recent"]);
});

test("a delayed test waits for the timer, and survives the app replacing its list", async () => {
  const { call, env, deps, sent, clock, pending } = setup();
  await call("PUT", "/push/subscription", subscription);
  assert.equal((await call("POST", "/push/send", { title: "Later", delaySeconds: 300 })).status, 200);
  await call("PUT", "/reminders", { reminders: [] });
  assert.equal((await pending()).length, 1);

  clock.now += 299_000;
  assert.equal(await sendDue(env, deps), 0);
  clock.now += 1_000;
  assert.equal(await sendDue(env, deps), 1);
  assert.equal(await sendDue(env, deps), 0);
  assert.deepEqual(sent.map((message) => message.title), ["Later"]);
});

test("out-of-range delays are rejected", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/push/send", { delaySeconds: -1 })).status, 400);
  assert.equal((await call("POST", "/push/send", { delaySeconds: 2 * 60 * 60 })).status, 400);
});

test("a subscription the push service reports gone is forgotten", async () => {
  const { call, data } = setup({ status: 410 });
  await call("PUT", "/push/subscription", subscription);
  assert.equal((await call("POST", "/push/send", {})).status, 502);
  assert.equal(data.has("subscription"), false);
});

test("turning notifications off forgets the subscription and the list", async () => {
  const { call, data, clock } = setup();
  await call("PUT", "/push/subscription", subscription);
  await call("PUT", "/reminders", { reminders: [{ id: "a", at: clock.now + MINUTE, title: "A" }] });
  assert.equal((await call("DELETE", "/push/subscription")).status, 200);
  assert.equal(data.has("subscription") || data.has("pending"), false);
});

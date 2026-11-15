// Companion Worker: sends the app's notifications.
//
// A web app on iPhone cannot schedule its own notifications, so this does it.
// The phone is the source of truth for all user data. It works out which
// notifications are coming and hands this Worker the whole list, replacing the
// last one. The Worker holds that list and one push subscription, checks once
// a minute, and sends what is due. It decides nothing about what to send.

import { sendPush, type PushResult, type PushSubscription, type VapidKeys } from "./webpush.ts";

/** The subset of Workers KV this Worker uses. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  STORE: KeyValueStore;
  /** Shared secret the app sends as `X-App-Key`. */
  APP_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** `*`, or a comma-separated list of origins allowed to call this Worker from a page. */
  ALLOWED_ORIGINS?: string;
}

/** What is sent to the phone. The app's service worker turns it into a notification. */
export interface Message {
  title: string;
  body: string;
  /** Where the app opens when the notification is tapped, relative to the app's scope. */
  url?: string;
  /** Notifications with the same tag replace each other on the phone. */
  tag?: string;
  /** The number to show on the app icon. */
  badge?: number;
}

export interface Pending {
  id: string;
  /** Epoch milliseconds at which the message becomes due. */
  at: number;
  message: Message;
}

export interface Deps {
  send: (subscription: PushSubscription, message: Message, vapid: VapidKeys) => Promise<PushResult>;
  now: () => number;
}

const defaultDeps: Deps = {
  send: (subscription, message, vapid) => sendPush(subscription, message, vapid),
  now: () => Date.now(),
};

// One key holds the whole list, so the every-minute check costs one read, not
// a list operation, which the free tier caps at 1,000 a day.
const SUBSCRIPTION_KEY = "subscription";
const PENDING_KEY = "pending";
// The time through which everything due has been sent. Only the timer writes
// it and only the app writes the list, so neither can overwrite the other.
const SENT_KEY = "sent";

const MAX_PENDING = 300;
const MAX_AHEAD = 60 * 24 * 60 * 60 * 1000;
const MAX_TEST_DELAY_SECONDS = 60 * 60;
/** A message this late is dropped, not sent: it means the timer was not running. */
const LATE_LIMIT = 15 * 60 * 1000;
/** Test messages are kept apart from the app's list by their id, so replacing the list leaves them alone. */
const TEST_PREFIX = "test:";

function vapidKeys(env: Env): VapidKeys {
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").split(",").map((origin) => origin.trim());
  const origin = request.headers.get("Origin") ?? "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "";
  if (!allow) return {};
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function keysMatch(given: string, expected: string): boolean {
  if (!expected || given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < given.length; i++) difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

async function readPending(env: Env): Promise<Pending[]> {
  const stored = await env.STORE.get(PENDING_KEY);
  return stored ? (JSON.parse(stored) as Pending[]) : [];
}

async function readSubscription(env: Env): Promise<PushSubscription | null> {
  const stored = await env.STORE.get(SUBSCRIPTION_KEY);
  return stored ? (JSON.parse(stored) as PushSubscription) : null;
}

function isSubscription(value: unknown): value is PushSubscription {
  const candidate = value as PushSubscription | null;
  return (
    typeof candidate?.endpoint === "string" &&
    candidate.endpoint.startsWith("https://") &&
    typeof candidate.keys?.p256dh === "string" &&
    typeof candidate.keys?.auth === "string"
  );
}

function parseMessage(input: Record<string, unknown>): Message {
  const text = (value: unknown, fallback: string, max: number) =>
    (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, max);
  const message: Message = {
    title: text(input.title, "Companion", 80),
    body: text(input.body, "You have a reminder.", 240),
  };
  if (typeof input.url === "string") message.url = input.url.slice(0, 300);
  if (typeof input.tag === "string" && input.tag) message.tag = input.tag.slice(0, 100);
  if (typeof input.badge === "number" && Number.isFinite(input.badge)) {
    message.badge = Math.min(999, Math.max(0, Math.floor(input.badge)));
  }
  return message;
}

/**
 * The time up to which nothing is waiting to be sent: everything before it has
 * either gone out or is too late to send. A message due after it is still owed,
 * even if its time has just passed and the timer has not run yet.
 */
async function sentThrough(env: Env, now: number): Promise<number> {
  return Math.max(Number(await env.STORE.get(SENT_KEY)) || 0, now - LATE_LIMIT);
}

/** Reads one entry of the app's list. Null for one that is malformed, already dealt with, or too far ahead. */
function parseReminder(input: unknown, sent: number, now: number): Pending | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const { id, at } = raw;
  if (typeof id !== "string" || !id || id.length > 100 || id.startsWith(TEST_PREFIX)) return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= sent || at > now + MAX_AHEAD) return null;
  return { id, at: Math.floor(at), message: parseMessage(raw) };
}

/** Sends one message now. Forgets the subscription if the push service says it is gone. */
async function deliver(env: Env, deps: Deps, message: Message): Promise<PushResult> {
  const subscription = await readSubscription(env);
  if (!subscription) return { ok: false, status: 0, gone: false, detail: "No subscription stored" };
  const result = await deps.send(subscription, message, vapidKeys(env));
  if (result.gone) await env.STORE.delete(SUBSCRIPTION_KEY);
  return result;
}

async function handlePush(request: Request, env: Env, deps: Deps, path: string): Promise<Response> {
  if (path === "/push/key" && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (path === "/push/subscription" && request.method === "PUT") {
    const body = (await request.json()) as unknown;
    if (!isSubscription(body)) return json({ error: "Not a push subscription" }, 400);
    await env.STORE.put(SUBSCRIPTION_KEY, JSON.stringify({ endpoint: body.endpoint, keys: body.keys }));
    return json({ ok: true });
  }

  if (path === "/push/subscription" && request.method === "DELETE") {
    // Turning notifications off forgets everything this Worker holds.
    await env.STORE.delete(SUBSCRIPTION_KEY);
    await env.STORE.delete(PENDING_KEY);
    return json({ ok: true });
  }

  // A test message, now or after a short delay. The app's own notifications arrive through /reminders.
  if (path === "/push/send" && request.method === "POST") {
    const body = (await request.json()) as Record<string, unknown>;
    const message = parseMessage(body);
    const delay = Number(body.delaySeconds ?? 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_TEST_DELAY_SECONDS) {
      return json({ error: "delaySeconds is out of range" }, 400);
    }
    if (delay === 0) {
      const result = await deliver(env, deps, message);
      return json(result, result.ok ? 200 : 502);
    }
    const now = deps.now();
    const sent = await sentThrough(env, now);
    const pending = (await readPending(env)).filter((entry) => entry.at > sent);
    if (pending.length >= MAX_PENDING) return json({ error: "Too many pending messages" }, 429);
    const entry: Pending = { id: TEST_PREFIX + crypto.randomUUID(), at: now + delay * 1000, message };
    await env.STORE.put(PENDING_KEY, JSON.stringify([...pending, entry]));
    return json({ ok: true, id: entry.id, at: entry.at });
  }

  if (path === "/push/pending" && request.method === "GET") {
    const sent = await sentThrough(env, deps.now());
    const pending = (await readPending(env)).filter((entry) => entry.at > sent);
    return json({ subscribed: (await readSubscription(env)) !== null, pending });
  }

  return json({ error: "Not found" }, 404);
}

/** Replaces the app's list of coming notifications with the one given. */
async function handleReminders(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const body = (await request.json()) as { reminders?: unknown };
  if (!Array.isArray(body.reminders)) return json({ error: "reminders must be a list" }, 400);
  if (body.reminders.length > MAX_PENDING) return json({ error: "Too many reminders" }, 413);

  const now = deps.now();
  const sent = await sentThrough(env, now);
  const byId = new Map<string, Pending>();
  for (const raw of body.reminders) {
    const entry = parseReminder(raw, sent, now);
    if (entry) byId.set(entry.id, entry);
  }
  const tests = (await readPending(env)).filter((entry) => entry.id.startsWith(TEST_PREFIX) && entry.at > sent);
  const reminders = [...byId.values()].sort((a, b) => a.at - b.at);
  await env.STORE.put(PENDING_KEY, JSON.stringify([...reminders, ...tests]));
  return json({ ok: true, count: reminders.length, subscribed: (await readSubscription(env)) !== null });
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: Deps = defaultDeps,
): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const path = new URL(request.url).pathname;
  let response: Response;
  try {
    if (path === "/health") {
      response = json({ ok: true });
    } else if (!keysMatch(request.headers.get("X-App-Key") ?? "", env.APP_KEY)) {
      response = json({ error: "Missing or wrong X-App-Key" }, 401);
    } else if (path.startsWith("/push/")) {
      response = await handlePush(request, env, deps, path);
    } else if (path === "/reminders") {
      response = await handleReminders(request, env, deps);
    } else {
      response = json({ error: "Not found" }, 404);
    }
  } catch (error) {
    response = json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

/** Sends every message that has become due since the last run. Returns how many were attempted. */
export async function sendDue(env: Env, deps: Deps = defaultDeps): Promise<number> {
  const now = deps.now();
  const pending = await readPending(env);
  if (!pending.some((entry) => entry.at <= now)) return 0;

  const sent = await sentThrough(env, now);
  const due = pending.filter((entry) => entry.at > sent && entry.at <= now);
  if (due.length === 0) return 0;

  // Marked as sent before sending: a message that fails is dropped, never repeated.
  await env.STORE.put(SENT_KEY, String(now));
  for (const entry of due) {
    const result = await deliver(env, deps, { tag: entry.id, ...entry.message });
    if (!result.ok) console.warn(`Push ${entry.id} failed: ${result.status} ${result.detail}`);
  }
  return due.length;
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled: (_event: unknown, env: Env, context: { waitUntil(promise: Promise<unknown>): void }) => {
    context.waitUntil(sendDue(env));
  },
};

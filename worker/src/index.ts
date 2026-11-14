// Companion Worker.
//
// Phase 0 scope: prove web push reaches the Home Screen app (Test B) and offer a
// relay to NovelAI in case the browser cannot call it directly (Test A).
//
// The phone is the source of truth for all user data. This Worker holds one push
// subscription and a short list of messages waiting to be sent, and nothing else.
// A relayed NovelAI request passes straight through; its token is never stored or logged.

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

export interface Message {
  title: string;
  body: string;
  /** Path the app opens when the notification is tapped, relative to the app's scope. */
  url?: string;
}

export interface Pending {
  id: string;
  /** Epoch milliseconds at which the message becomes due. */
  at: number;
  message: Message;
}

export interface Deps {
  send: (subscription: PushSubscription, message: Message, vapid: VapidKeys) => Promise<PushResult>;
  fetch: typeof fetch;
  now: () => number;
}

const defaultDeps: Deps = {
  send: (subscription, message, vapid) => sendPush(subscription, message, vapid),
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
};

// One key holds the whole queue. The every-minute timer then costs one KV read per
// run (1,440 a day) instead of a list operation, which the free tier caps at 1,000 a day.
const SUBSCRIPTION_KEY = "subscription";
const PENDING_KEY = "pending";
const MAX_PENDING = 200;
const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

const RELAY_HOSTS: Record<string, string> = {
  image: "https://image.novelai.net",
  text: "https://text.novelai.net",
};

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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-App-Key",
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
    body: text(input.body, "Test notification", 240),
  };
  if (typeof input.url === "string") message.url = input.url.slice(0, 300);
  return message;
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
    await env.STORE.delete(SUBSCRIPTION_KEY);
    return json({ ok: true });
  }

  if (path === "/push/send" && request.method === "POST") {
    const body = (await request.json()) as Record<string, unknown>;
    const message = parseMessage(body);
    const delay = Number(body.delaySeconds ?? 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_DELAY_SECONDS) {
      return json({ error: "delaySeconds is out of range" }, 400);
    }
    if (delay === 0) {
      const result = await deliver(env, deps, message);
      return json(result, result.ok ? 200 : 502);
    }
    const pending = await readPending(env);
    if (pending.length >= MAX_PENDING) return json({ error: "Too many pending messages" }, 429);
    const entry: Pending = { id: crypto.randomUUID(), at: deps.now() + delay * 1000, message };
    await env.STORE.put(PENDING_KEY, JSON.stringify([...pending, entry]));
    return json({ ok: true, id: entry.id, at: entry.at });
  }

  if (path === "/push/pending" && request.method === "GET") {
    return json({ subscribed: (await readSubscription(env)) !== null, pending: await readPending(env) });
  }

  return json({ error: "Not found" }, 404);
}

/** Forwards a request to NovelAI unchanged and streams the answer back. */
async function handleRelay(request: Request, deps: Deps, path: string): Promise<Response> {
  const [, , service, ...rest] = path.split("/");
  const host = RELAY_HOSTS[service ?? ""];
  if (!host || rest.length === 0) return json({ error: "Unknown relay target" }, 404);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const headers = new Headers();
  for (const name of ["Authorization", "Content-Type", "Accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await deps.fetch(`${host}/${rest.join("/")}${new URL(request.url).search}`, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "X-Relayed-From": host,
    },
  });
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
    } else if (path.startsWith("/relay/")) {
      response = await handleRelay(request, deps, path);
    } else {
      response = json({ error: "Not found" }, 404);
    }
  } catch (error) {
    response = json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  headers.set("Access-Control-Expose-Headers", "X-Relayed-From");
  return new Response(response.body, { status: response.status, headers });
}

/** Sends every pending message that is due. Returns how many were attempted. */
export async function sendDue(env: Env, deps: Deps = defaultDeps): Promise<number> {
  const pending = await readPending(env);
  const now = deps.now();
  const due = pending.filter((entry) => entry.at <= now);
  if (due.length === 0) return 0;

  // Remove due entries before sending: a message that fails is dropped, never repeated.
  await env.STORE.put(PENDING_KEY, JSON.stringify(pending.filter((entry) => entry.at > now)));
  for (const entry of due) {
    const result = await deliver(env, deps, entry.message);
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

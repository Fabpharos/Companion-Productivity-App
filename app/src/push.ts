// Talking to the Worker, and subscribing this phone to push.
//
// Everything here can fail without the app caring: the Worker may be
// unreachable, or this may be a browser tab where push does not exist.

import type { Connection } from "./lib/model.ts";
import type { Reminder } from "./lib/notify.ts";

export class PushError extends Error {}

/** True where this browser can receive push at all. On iPhone that is only the Home Screen app. */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function call<T>(connection: Connection, method: string, path: string, body?: unknown): Promise<T> {
  const base = connection.url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new PushError("Enter the Worker's address, starting with https://");
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      headers: { "X-App-Key": connection.key.trim(), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PushError("The Worker could not be reached. Check the address and the connection.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (response.status === 401) throw new PushError("The Worker did not accept the key.");
  if (!response.ok) throw new PushError(`The Worker answered ${response.status}: ${data.error ?? data.detail ?? "no detail"}`);
  return data as T;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const found = await navigator.serviceWorker.getRegistration();
  if (!found) throw new PushError("The app is not installed for offline use yet. Close it, open it again, and retry.");
  return found;
}

/**
 * Subscribes this phone and gives the Worker the subscription. With `ask`,
 * the permission prompt is shown, which iOS only allows straight from a tap.
 */
export async function subscribe(connection: Connection, ask: boolean): Promise<void> {
  if (!pushSupported()) {
    throw new PushError("Notifications are not available here. On iPhone, open the app from its Home Screen icon.");
  }
  const permission = ask ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") {
    throw new PushError(permission === "denied" ? "Notifications are blocked for this app in the phone's Settings." : "Notifications were not allowed.");
  }
  const { publicKey } = await call<{ publicKey: string }>(connection, "GET", "/push/key");
  const manager = (await registration()).pushManager;
  let subscription = await manager.getSubscription();
  try {
    subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  } catch (reason) {
    throw new PushError(`This phone could not subscribe: ${reason instanceof Error ? reason.message : reason}`);
  }
  await call(connection, "PUT", "/push/subscription", subscription.toJSON());
}

/** Forgets the subscription on the Worker and on this phone. Finishes even when the Worker cannot be reached. */
export async function unsubscribe(connection: Connection): Promise<void> {
  await call(connection, "DELETE", "/push/subscription").catch(() => {});
  if (!pushSupported()) return;
  const found = await navigator.serviceWorker.getRegistration();
  await (await found?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
}

/** Replaces the Worker's list. Answers whether the Worker still has this phone's subscription. */
export async function sendReminders(connection: Connection, reminders: Reminder[]): Promise<{ count: number; subscribed: boolean }> {
  return call(connection, "PUT", "/reminders", { reminders });
}

export async function sendTest(connection: Connection, delaySeconds: number): Promise<void> {
  await call(connection, "POST", "/push/send", {
    title: "Companion",
    body: delaySeconds ? "This test was sent a minute ago." : "Notifications are working.",
    url: "./#/today",
    delaySeconds,
  });
}

/** Shows a number on the app icon, where the phone allows it. */
export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  void (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
}

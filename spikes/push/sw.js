// Service worker for Test B. It shows incoming pushes and keeps a small log of
// when each one arrived, so delivery while the app was closed can be checked later.

const LOG_CACHE = "push-test-log";
const LOG_URL = "log.json";

async function readLog() {
  const cache = await caches.open(LOG_CACHE);
  const stored = await cache.match(LOG_URL);
  return stored ? stored.json() : [];
}

async function appendLog(entry) {
  const entries = [...(await readLog()), { at: Date.now(), ...entry }].slice(-50);
  const cache = await caches.open(LOG_CACHE);
  await cache.put(LOG_URL, new Response(JSON.stringify(entries), { headers: { "Content-Type": "application/json" } }));
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() ?? "" };
  }
  const title = message.title ?? "Companion";
  event.waitUntil(
    Promise.all([
      appendLog({ kind: "push received", title, body: message.body ?? "" }),
      // iOS revokes the subscription if a push does not show a notification.
      self.registration.showNotification(title, {
        body: message.body ?? "",
        icon: "icon-180.png",
        data: { url: message.url ?? "./" },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "./", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      await appendLog({ kind: "notification tapped", title: event.notification.title, body: url });
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        open.postMessage({ type: "notification-tapped", url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

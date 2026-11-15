// The part of the service worker that handles notifications. The rest of the
// service worker (offline caching) is generated at build time and loads this.

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() ?? "" };
  }
  const jobs = [
    // iOS withdraws the subscription if a push does not show a notification, so one is always shown.
    self.registration.showNotification(message.title ?? "Companion", {
      body: message.body ?? "",
      icon: "icon-180.png",
      tag: message.tag,
      data: { url: message.url ?? "./" },
    }),
  ];
  if (typeof message.badge === "number" && self.navigator.setAppBadge) {
    const badge = message.badge > 0 ? self.navigator.setAppBadge(message.badge) : self.navigator.clearAppBadge();
    jobs.push(badge.catch(() => {}));
  }
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "./", self.registration.scope);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      // An open app is told where to go. A closed one is opened there.
      if (open) {
        open.postMessage({ type: "open", hash: url.hash });
        return open.focus();
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});

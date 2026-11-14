const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "spike-push-settings";
const fields = { workerUrl: $("worker-url"), appKey: $("app-key") };
const pageLog = [];

const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ---- Settings ---------------------------------------------------------------

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  fields.workerUrl.value = saved.workerUrl ?? "";
  fields.appKey.value = saved.appKey ?? "";
}

for (const field of Object.values(fields)) {
  field.addEventListener("change", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ workerUrl: fields.workerUrl.value.trim(), appKey: fields.appKey.value.trim() }),
    );
  });
}

async function worker(method, path, body) {
  const base = fields.workerUrl.value.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Enter the Worker address first.");
  const response = await fetch(base + path, {
    method,
    headers: { "X-App-Key": fields.appKey.value.trim(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Worker answered ${response.status}: ${data.error ?? data.detail ?? JSON.stringify(data)}`);
  }
  return data;
}

// ---- Status -----------------------------------------------------------------

const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function iosVersion() {
  const match = /OS (\d+)_(\d+)(?:_(\d+))?/.exec(navigator.userAgent);
  return match ? match.slice(1).filter(Boolean).join(".") : null;
}

async function renderStatus() {
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const subscription = registration && "pushManager" in registration ? await registration.pushManager.getSubscription() : null;
  const rows = [
    ["Opened from", isStandalone() ? "Home Screen icon" : "Browser tab"],
    ["iOS version", iosVersion() ?? "Not an iPhone"],
    ["Push supported", "PushManager" in window && "Notification" in window ? "Yes" : "No"],
    ["Permission", "Notification" in window ? Notification.permission : "Unavailable"],
    ["Service worker", registration ? "Registered" : "Not registered"],
    ["Subscription", subscription ? new URL(subscription.endpoint).host : "None"],
  ];
  const list = $("status");
  list.innerHTML = "";
  for (const [name, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = name;
    const detail = document.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  }
}

// ---- Log --------------------------------------------------------------------

async function serviceWorkerLog() {
  if (!("caches" in window)) return [];
  const cache = await caches.open("push-test-log");
  const stored = await cache.match("log.json");
  return stored ? stored.json() : [];
}

async function renderLog() {
  const entries = [...pageLog, ...(await serviceWorkerLog())].sort((a, b) => a.at - b.at);
  $("log").textContent = entries.length
    ? entries.map((entry) => `${time(entry.at)}  ${entry.kind}${entry.body ? `: ${entry.body}` : ""}`).join("\n")
    : "Nothing yet.";
}

function note(kind, body = "") {
  pageLog.push({ at: Date.now(), kind, body });
  renderLog();
}

function showOpened(url) {
  $("opened").hidden = false;
  $("opened-text").textContent = `Opened from a notification at ${time(Date.now())}.`;
  note("app opened from notification", url);
}

// ---- Actions ----------------------------------------------------------------

function keyBytes(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function enable() {
  if (!("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Push is not available here. On iPhone, open this page from its Home Screen icon.");
  }
  // Ask first: iOS only shows the prompt in direct response to a tap.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(`Notification permission is "${permission}".`);

  await navigator.serviceWorker.register("sw.js", { scope: "./" });
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await worker("GET", "/push/key");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  });
  await worker("PUT", "/push/subscription", subscription.toJSON());
  note("subscribed", new URL(subscription.endpoint).host);
}

async function send(delaySeconds) {
  const due = Date.now() + delaySeconds * 1000;
  const stamp = String(Date.now());
  const result = await worker("POST", "/push/send", {
    title: "Companion push test",
    body: delaySeconds ? `Scheduled for ${time(due)}` : `Sent at ${time(due)}`,
    url: `./?opened=${stamp}`,
    delaySeconds,
  });
  note(delaySeconds ? "scheduled" : "sent", delaySeconds ? `due ${time(result.at)}` : `push service answered ${result.status}`);
}

function bind(id, action) {
  const button = $(id);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      note("error", error.message);
    } finally {
      button.disabled = false;
      renderStatus();
    }
  });
}

bind("check", async () => {
  await worker("GET", "/health");
  const state = await worker("GET", "/push/pending");
  note("worker reachable", `subscribed: ${state.subscribed ? "yes" : "no"}, pending: ${state.pending.length}`);
});
bind("enable", enable);
bind("send-now", () => send(0));
bind("send-1", () => send(60));
bind("send-5", () => send(300));
bind("refresh", renderLog);
bind("copy", async () => {
  const header = `Run ${new Date().toISOString()}\nBrowser: ${navigator.userAgent}\nHome Screen app: ${isStandalone() ? "yes" : "no"}\n\n`;
  await navigator.clipboard.writeText(header + $("log").textContent);
});

navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "notification-tapped") showOpened(event.data.url);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderLog();
});

loadSettings();
renderStatus();
renderLog();
if (new URLSearchParams(location.search).has("opened")) {
  showOpened(location.href);
  history.replaceState(null, "", location.pathname);
}

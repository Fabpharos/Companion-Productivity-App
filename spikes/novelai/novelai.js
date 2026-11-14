import { readEvents, sniffImage } from "./codec.js";
import { textBody, v45Body, v5Body } from "./presets.js";

const HOSTS = {
  image: "https://image.novelai.net",
  text: "https://text.novelai.net",
};

const TESTS = [
  {
    id: "account",
    title: "0. Account and Anlas",
    about: "Reads your subscription. Costs nothing. Run this first: if it is blocked, the others will be too.",
    service: "image",
    method: "GET",
    path: "/user/subscription",
  },
  {
    id: "v5",
    title: "1. V5 image",
    about: "One 512×768 image from nai-diffusion-5-full. Draws on the Opus usage bar. Try both body formats.",
    service: "image",
    method: "POST",
    path: "/ai/generate-image-stream",
    body: v5Body,
    encodings: true,
    image: true,
  },
  {
    id: "v45",
    title: "2. V4.5 image",
    about: "One 512×768 image from nai-diffusion-4-5-full. Free on Opus at this size.",
    service: "image",
    method: "POST",
    path: "/ai/generate-image-stream",
    body: v45Body,
    image: true,
  },
  {
    id: "text",
    title: "3. Text reply",
    about: "One short continuation from Erato.",
    service: "text",
    method: "POST",
    path: "/ai/generate",
    body: textBody,
  },
];

const $ = (id) => document.getElementById(id);
const fields = { token: $("token"), remember: $("remember"), route: $("route"), workerUrl: $("worker-url"), appKey: $("app-key") };
const runs = [];

// ---- Settings ---------------------------------------------------------------

const SETTINGS_KEY = "spike-novelai-settings";
const TOKEN_KEY = "spike-novelai-token";

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  fields.route.value = saved.route ?? "direct";
  fields.workerUrl.value = saved.workerUrl ?? "";
  fields.appKey.value = saved.appKey ?? "";
  fields.remember.checked = saved.remember ?? false;
  fields.token.value = localStorage.getItem(TOKEN_KEY) ?? "";
  $("relay-fields").hidden = fields.route.value !== "relay";
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      route: fields.route.value,
      workerUrl: fields.workerUrl.value.trim(),
      appKey: fields.appKey.value.trim(),
      remember: fields.remember.checked,
    }),
  );
  if (fields.remember.checked) localStorage.setItem(TOKEN_KEY, fields.token.value.trim());
  else localStorage.removeItem(TOKEN_KEY);
  $("relay-fields").hidden = fields.route.value !== "relay";
}

for (const field of Object.values(fields)) field.addEventListener("change", saveSettings);

// ---- Sending ----------------------------------------------------------------

function target(service, path) {
  if (fields.route.value === "relay") {
    const worker = fields.workerUrl.value.trim().replace(/\/+$/, "");
    if (!worker) throw new Error("Enter the Worker address first.");
    return { url: `${worker}/relay/${service}${path}`, headers: { "X-App-Key": fields.appKey.value.trim() } };
  }
  return { url: HOSTS[service] + path, headers: {} };
}

/**
 * Sends one request and describes what happened. Never throws for network trouble:
 * a blocked request is a result, not an error.
 */
async function send({ service, method, path, json, encoding }) {
  const token = fields.token.value.trim();
  if (!token) throw new Error("Enter your NovelAI token first.");
  const { url, headers } = target(service, path);
  headers.Authorization = `Bearer ${token}`;

  let body;
  if (json !== undefined && encoding === "multipart") {
    body = new FormData();
    body.append("request", new Blob([json], { type: "application/json" }), "blob");
  } else if (json !== undefined) {
    body = json;
    headers["Content-Type"] = "application/json";
  }

  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let response;
  try {
    response = await fetch(url, { method, headers, body, referrerPolicy: "no-referrer" });
  } catch (error) {
    return { outcome: "blocked", ms: elapsed(), detail: await diagnoseBlock(url, error) };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    outcome: response.ok ? "ok" : "http-error",
    status: response.status,
    ms: elapsed(),
    contentType: response.headers.get("Content-Type") ?? "",
    bytes,
  };
}

/** A failed fetch gives no reason, so probe the host without CORS to tell the causes apart. */
async function diagnoseBlock(url, error) {
  const origin = new URL(url).origin;
  try {
    await fetch(origin, { mode: "no-cors", referrerPolicy: "no-referrer" });
    return `The browser refused the request (${error.message}), but ${origin} is reachable: a CORS block.`;
  } catch {
    return `Could not reach ${origin} at all (${error.message}): a network problem, not CORS.`;
  }
}

function bodyText(bytes, limit = 1200) {
  const decoded = new TextDecoder().decode(bytes.subarray(0, limit));
  return bytes.length > limit ? `${decoded}…` : decoded;
}

function anlasOf(subscription) {
  const steps = subscription?.trainingStepsLeft;
  if (typeof steps === "number") return steps;
  if (steps && typeof steps === "object") {
    return (steps.fixedTrainingStepsLeft ?? 0) + (steps.purchasedTrainingSteps ?? 0);
  }
  return null;
}

/** Reads the balance for the before-and-after record. Returns null if it cannot be read. */
async function readBalance() {
  try {
    const result = await send({ service: "image", method: "GET", path: "/user/subscription" });
    if (result.outcome !== "ok") return null;
    const subscription = JSON.parse(new TextDecoder().decode(result.bytes));
    return { anlas: anlasOf(subscription), usage: subscription.usage ?? null };
  } catch {
    return null;
  }
}

// ---- Interpreting -----------------------------------------------------------

function interpret(test, result) {
  const view = { headline: "", note: "", image: null, raw: "" };

  if (result.outcome === "blocked") {
    view.headline = "Blocked";
    view.note = result.detail;
    return view;
  }
  if (result.outcome === "http-error") {
    view.headline = `HTTP ${result.status}`;
    view.note = "NovelAI answered, so the browser was allowed through, but it rejected the request.";
    view.raw = bodyText(result.bytes);
    return view;
  }

  view.headline = `Works (HTTP ${result.status})`;
  if (test.image) {
    const events = readEvents(result.bytes);
    const direct = sniffImage(result.bytes);
    if (events) {
      const types = events.map((event) => event.event_type ?? "?");
      const final = events.findLast((event) => event.image instanceof Uint8Array && event.event_type === "final");
      const failure = events.find((event) => event.event_type === "error");
      view.note = `${events.length} stream events: ${summariseCounts(types)}.`;
      if (failure) {
        view.headline = "Stream reported an error";
        view.raw = JSON.stringify(failure, null, 2);
        result.outcome = "http-error";
      } else if (final) {
        view.image = new Blob([final.image], { type: sniffImage(final.image) ?? "image/png" });
        view.note += ` Final image ${final.image.length.toLocaleString()} bytes, ${view.image.type}.`;
      } else {
        view.headline = "Answered, but no final image";
        result.outcome = "http-error";
      }
    } else if (direct) {
      view.image = new Blob([result.bytes], { type: direct });
      view.note = `Body is a bare ${direct} image, not an event stream.`;
    } else {
      view.headline = "Answered, but not in a known format";
      view.note = `${result.bytes.length.toLocaleString()} bytes of ${result.contentType || "unknown type"}.`;
      view.raw = bodyText(result.bytes, 300);
      result.outcome = "http-error";
    }
    return view;
  }

  const textResponse = bodyText(result.bytes);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes));
    if (test.id === "account") {
      view.note = `Tier ${parsed.tier ?? "?"}, ${anlasOf(parsed) ?? "?"} Anlas.`;
      view.raw = JSON.stringify(parsed, null, 2);
    } else if (typeof parsed.output === "string") {
      view.note = `Reply: ${parsed.output}`;
    } else {
      view.raw = JSON.stringify(parsed, null, 2);
    }
  } catch {
    view.raw = textResponse;
  }
  return view;
}

function summariseCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([name, count]) => `${count} ${name}`).join(", ");
}

// ---- Page -------------------------------------------------------------------

function buildTest(test) {
  const node = $("test-template").content.cloneNode(true);
  const part = (name) => node.querySelector(`[data-part="${name}"]`);
  const parts = Object.fromEntries(
    ["title", "about", "encoding-field", "encoding", "body-details", "path", "body", "run", "result"].map((name) => [name, part(name)]),
  );

  parts.title.textContent = test.title;
  parts.about.textContent = test.about;
  parts.run.textContent = "Run this test";
  parts.path.value = test.path;
  if (test.body) {
    parts["body-details"].hidden = false;
    parts.body.value = JSON.stringify(test.body(), null, 2);
  }
  if (test.encodings) parts["encoding-field"].hidden = false;

  parts.run.addEventListener("click", async () => {
    parts.run.disabled = true;
    parts.result.hidden = false;
    parts.result.textContent = "Running…";
    try {
      await runTest(test, parts);
    } catch (error) {
      parts.result.innerHTML = "";
      parts.result.append(line("fail", error.message));
    } finally {
      parts.run.disabled = false;
    }
  });

  $("tests").append(node);
}

function line(className, text) {
  const element = document.createElement("div");
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

async function runTest(test, parts) {
  let json;
  if (test.body) {
    try {
      json = JSON.stringify(JSON.parse(parts.body.value));
    } catch (error) {
      throw new Error(`The request body is not valid JSON: ${error.message}`);
    }
  }
  const encoding = test.body ? (test.encodings ? parts.encoding.value : "json") : "";

  const before = test.image ? await readBalance() : null;
  const result = await send({ service: test.service, method: test.method, path: parts.path.value.trim(), json, encoding });
  const view = interpret(test, result);
  const after = test.image && result.outcome === "ok" ? await readBalance() : null;

  parts.result.innerHTML = "";
  parts.result.append(line(result.outcome === "ok" ? "ok" : "fail", `${view.headline} · ${result.ms} ms`));
  if (view.note) parts.result.append(line("", view.note));
  if (before && after) parts.result.append(line("muted", `Anlas ${before.anlas} → ${after.anlas}`));
  if (view.image) {
    const image = document.createElement("img");
    image.alt = "Generated image";
    image.src = URL.createObjectURL(view.image);
    parts.result.append(image);
  }
  if (view.raw) {
    const raw = document.createElement("pre");
    raw.textContent = view.raw;
    parts.result.append(raw);
  }

  runs.push({
    test: test.title.replace(/^\d+\.\s*/, ""),
    route: fields.route.value === "relay" ? "Worker" : "Direct",
    format: encoding || "–",
    path: parts.path.value.trim(),
    outcome: view.headline,
    ms: result.ms,
    anlas: before && after ? `${before.anlas} → ${after.anlas}` : "–",
    usage: after?.usage ? JSON.stringify(after.usage) : "–",
    note: (view.note || view.raw).replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 160),
  });
  renderSummary();
}

function summaryMarkdown() {
  const rows = runs.map(
    (run) => `| ${run.test} | ${run.route} | ${run.format} | ${run.path} | ${run.outcome} | ${run.ms} | ${run.anlas} | ${run.usage} | ${run.note} |`,
  );
  return [
    `Run ${new Date().toISOString()} from ${location.origin}`,
    `Browser: ${navigator.userAgent}`,
    `Home Screen app: ${matchMedia("(display-mode: standalone)").matches || navigator.standalone === true ? "yes" : "no"}`,
    "",
    "| Test | Route | Body | Path | Outcome | ms | Anlas | Usage bar | Note |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderSummary() {
  $("summary").textContent = runs.length ? summaryMarkdown() : "No runs yet.";
}

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(summaryMarkdown());
  $("copy").textContent = "Copied";
  setTimeout(() => ($("copy").textContent = "Copy results"), 1500);
});

$("clear").addEventListener("click", () => {
  runs.length = 0;
  renderSummary();
});

loadSettings();
TESTS.forEach(buildTest);

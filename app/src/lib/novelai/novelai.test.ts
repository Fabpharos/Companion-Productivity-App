import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CARD } from "../card.ts";
import { fetchAccount, generateImage, generateLine, NovelAiError, type Fetch } from "./client.ts";
import { decodeMsgpack, finalImage, readEvents, sniffImage, type Value } from "./codec.ts";
import { buildPrompt, buildScene, chooseModel, drawsTransparent, imageBody, isFree, readAccount, SIZE, trimReply, V45, V5, type Account } from "./requests.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Minimal MessagePack encoder for building fixtures. */
function encode(value: Value): number[] {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  if (value === null || value === undefined) return [0xc0];
  if (typeof value === "boolean") return [value ? 0xc3 : 0xc2];
  if (typeof value === "bigint") throw new Error("not needed");
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= 0x7f) return [value];
    if (Number.isInteger(value) && value >= 0 && value <= 0xffff) return [0xcd, value >> 8, value & 0xff];
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value);
    return [0xcb, ...bytes];
  }
  if (typeof value === "string") return [0xd9, value.length, ...ascii(value)];
  if (value instanceof Uint8Array) return [0xc5, value.length >> 8, value.length & 0xff, ...value];
  if (Array.isArray(value)) return [0x90 | value.length, ...value.flatMap(encode)];
  const entries = Object.entries(value);
  return [0x80 | entries.length, ...entries.flatMap(([k, v]) => [0xa0 | k.length, ...ascii(k), ...encode(v)])];
}

function frame(event: Value): number[] {
  const body = encode(event);
  return [body.length >>> 24, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
}

const stream = (...events: Value[]) => new Uint8Array(events.flatMap(frame));

// ---------- The stream ----------

test("the stream's value types are read", () => {
  const image = new Uint8Array([...PNG, 1, 2, 3]);
  const event = { event_type: "final", samp_ix: 0, step_ix: 300, sigma: 0.25, done: true, extra: null, tags: ["a", 7], image };
  assert.deepEqual(decodeMsgpack(new Uint8Array(encode(event))), event);
  assert.equal(decodeMsgpack(new Uint8Array([0xff])), -1);
  assert.equal(decodeMsgpack(new Uint8Array([0xd1, 0xff, 0x00])), -256);
  assert.equal(decodeMsgpack(new Uint8Array([0xcf, 0, 0, 0, 1, 0, 0, 0, 0])), 2 ** 32);
  assert.throws(() => decodeMsgpack(new Uint8Array([0xd9, 5, 0x61])), RangeError);
});

test("a stream is split into events, and anything else is not a stream", () => {
  const events = readEvents(stream({ event_type: "intermediate", image: new Uint8Array([0xff, 0xd8, 0]) }, { event_type: "final", image: new Uint8Array(PNG) }))!;
  assert.deepEqual(events.map((event) => event.event_type), ["intermediate", "final"]);
  assert.equal(sniffImage(events[0]!.image as Uint8Array), "image/jpeg");
  assert.equal(readEvents(new TextEncoder().encode('{"statusCode":400,"message":"nope"}')), null);
  assert.equal(readEvents(new Uint8Array([])), null);
  assert.equal(readEvents(stream({ event_type: "final", image: new Uint8Array(PNG) }).slice(0, -2)), null);
});

test("the finished picture is the stream's final event", () => {
  const picture = new Uint8Array([...PNG, 9]);
  const body = stream({ event_type: "intermediate", image: new Uint8Array([0xff, 0xd8]) }, { event_type: "final", image: picture });
  assert.deepEqual(finalImage(body), { bytes: picture, type: "image/png" });
  assert.deepEqual(finalImage(picture), { bytes: picture, type: "image/png" }, "a bare picture is accepted too");
  assert.throws(() => finalImage(stream({ event_type: "error", message: "Out of memory" })), /Out of memory/);
  assert.throws(() => finalImage(stream({ event_type: "intermediate", image: picture })), /without a finished picture/);
  assert.throws(() => finalImage(new TextEncoder().encode("<html>")), /does not know/);
});

// ---------- Requests ----------

const card = { ...DEFAULT_CARD, name: "Mika", basePrompt: "1girl,  long black hair , brown eyes,", description: "A shrine maiden.", personality: "warm", examples: "<START>\n{{char}}: Well done, {{user}}!" };

test("a prompt is the character, the outfit, the mood, the framing and the backdrop", () => {
  assert.equal(
    buildPrompt(card, "kimono, obi", "happy", V5),
    "1girl, long black hair, brown eyes, kimono, obi, happy, smile, open mouth, looking at viewer, solo, full body, standing, transparent background",
  );
  assert.ok(buildPrompt(card, "kimono", "happy", V45).endsWith("standing, simple background, white background"), "V4.5 cannot draw transparency");
  assert.ok(!buildPrompt(card, "", "idle", V5).includes(", ,"));
  assert.deepEqual([drawsTransparent(V5), drawsTransparent(V45)], [true, false]);
});

test("each model gets the request Phase 0 proved", () => {
  const five = imageBody(V5, "a prompt", 7) as { input: string; model: string; action: string; parameters: Record<string, unknown> };
  assert.deepEqual([five.input, five.model, five.action], ["a prompt", "nai-diffusion-5-full", "generate"]);
  assert.deepEqual(
    [five.parameters.params_version, five.parameters.ucPresetId, five.parameters.qualityPresetId, five.parameters.stream, five.parameters.seed, five.parameters.n_samples],
    [4, "heavy", "standard", "msgpack", 7, 1],
  );
  assert.deepEqual([five.parameters.width, five.parameters.height, five.parameters.steps], [SIZE.width, SIZE.height, 23]);
  assert.equal((five.parameters.v4_prompt as { caption: { base_caption: string } }).caption.base_caption, "a prompt");
  assert.match(five.parameters.negative_prompt as string, /nsfw/);
  assert.deepEqual([five.parameters.straight_alpha, five.parameters.tag_hint_transparent_background], [true, true], "V5 is asked for a transparent background");

  const four = imageBody(V45, "a prompt", 7) as { model: string; parameters: Record<string, unknown> };
  assert.deepEqual([four.model, four.parameters.params_version, four.parameters.ucPreset, four.parameters.qualityToggle], ["nai-diffusion-4-5-full", 3, 0, true]);
  assert.equal("ucPresetId" in four.parameters || "image_format" in four.parameters || "tag_hint_transparent_background" in four.parameters, false);
});

// ---------- The spending guard ----------

const opus = { tier: 3, active: true, trainingStepsLeft: { fixedTrainingStepsLeft: 8000, purchasedTrainingSteps: 8 }, usage: { percent: 100, purchasedPercent: 0, isNegative: false, timeUntilNextPercent: 6048 } };

test("the account's tier, Anlas and usage bar are read", () => {
  assert.deepEqual(readAccount(opus), { tier: 3, active: true, anlas: 8008, usage: { percent: 100, isNegative: false } });
  assert.deepEqual(readAccount({ tier: 1, trainingStepsLeft: 50 }), { tier: 1, active: true, anlas: 50, usage: null });
  assert.equal(readAccount({ statusCode: 401 }), null);
  assert.equal(readAccount("nope"), null);
});

test("a picture is drawn for free where that is certain, and anything uncertain counts as paid", () => {
  const account = (fields: Partial<Account>): Account => ({ tier: 3, active: true, anlas: 100, usage: { percent: 60, isNegative: false }, ...fields });
  assert.deepEqual(chooseModel(account({})), { model: V5, free: true });
  assert.deepEqual(chooseModel(account({ usage: { percent: 0, isNegative: false } })), { model: V45, free: true }, "V5 allowance used up: V4.5 is still free on Opus");
  assert.deepEqual(chooseModel(account({ usage: { percent: 5, isNegative: true } })), { model: V45, free: true });
  assert.deepEqual(chooseModel(account({ usage: null })), { model: V45, free: true }, "no usage bar reported");
  assert.deepEqual(chooseModel(account({ tier: 2 })), { model: V5, free: false }, "below Opus nothing is free");
  assert.equal(isFree(account({ active: false }), V45), false);
});

// ---------- Text ----------

test("the scene tells the model who is speaking and what just happened", () => {
  const scene = buildScene(card, "choreDone", { name: "Dishes", points: 10 })!;
  assert.match(scene, /^Mika keeps a friend company/);
  assert.match(scene, /A shrine maiden\. Personality: warm\./);
  assert.match(scene, /Mika: Well done, Friend!/);
  assert.ok(scene.endsWith('***\nMika\'s friend has just finished a chore: "Dishes".\nMika said, "'));
  assert.doesNotMatch(scene, /\{\{|<START>|points/);
  assert.match(buildScene(DEFAULT_CARD, "tap", {})!, /The companion said, "$/);
  assert.equal(buildScene(card, "reward", { name: "x" }), null, "some events keep their pre-set line");
});

test("the reply is cut to one line of speech, and unusable replies are dropped", () => {
  assert.equal(
    trimReply(`It's nice to get chores done during the day. It will save us some time tonight." *** Her friend just finished the laundry`),
    "It's nice to get chores done during the day. It will save us some time tonight.",
    "the reply Phase 0 recorded",
  );
  assert.equal(trimReply("Well done!\nShe smiled."), "Well done!");
  assert.equal(trimReply("  Nice   work.  ”and more"), "Nice work.");
  assert.equal(trimReply("Cut off in the mid"), null);
  assert.equal(trimReply('" she said.'), null);
  assert.equal(trimReply(""), null);
  assert.equal(trimReply("*waves* Hello!"), null);
  assert.equal(trimReply("You finally did it."), null, "the tone rule holds for generated lines too");
  assert.equal(trimReply(`${"very ".repeat(40)}long.`), null);
  assert.equal(trimReply(undefined), null);
});

// ---------- The calls ----------

function fake(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetch = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return { calls, fetcher };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("the token goes only to NovelAI, in the Authorization header", async () => {
  const { calls, fetcher } = fake((url) => (url.includes("/user/") ? json(opus) : json({ output: 'Nice work." and on' })));
  assert.equal((await fetchAccount(" secret-token ", fetcher)).anlas, 8008);
  assert.equal(await generateLine("secret-token", "a scene", fetcher), "Nice work.");
  assert.deepEqual(calls.map((call) => new URL(call.url).host), ["image.novelai.net", "text.novelai.net"]);
  for (const call of calls) {
    assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer secret-token");
    assert.equal(call.init.referrerPolicy, "no-referrer");
    assert.doesNotMatch(call.url, /secret-token/);
  }
  assert.deepEqual(JSON.parse(calls[1]!.init.body as string).model, "llama-3-erato-v1");
});

test("V5 is sent as a form, V4.5 as JSON, and the picture comes back", async () => {
  const picture = new Uint8Array([...PNG, 5]);
  const { calls, fetcher } = fake(() => new Response(stream({ event_type: "final", image: picture })));
  assert.deepEqual(await generateImage("t", V5, "a prompt", 3, fetcher), { bytes: picture, type: "image/png" });
  assert.deepEqual(await generateImage("t", V45, "a prompt", 3, fetcher), { bytes: picture, type: "image/png" });
  assert.equal(calls[0]!.url, "https://image.novelai.net/ai/generate-image-stream");
  const form = calls[0]!.init.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(JSON.parse(await (form.get("request") as Blob).text()).model, V5);
  assert.equal(JSON.parse(calls[1]!.init.body as string).model, V45);
  assert.equal((calls[1]!.init.headers as Record<string, string>)["Content-Type"], "application/json");
});

test("failures are told apart", async () => {
  const kind = async (answer: () => Response | Promise<Response>, token = "t") => {
    try {
      await generateImage(token, V45, "p", 1, fake(answer).fetcher);
      return "none";
    } catch (reason) {
      return reason instanceof NovelAiError ? reason.kind : "unknown";
    }
  };
  assert.equal(await kind(() => json({ message: "Unauthorized" }, 401)), "token");
  assert.equal(await kind(() => json({ message: "Not enough Anlas" }, 402)), "payment");
  assert.equal(await kind(() => json({}, 429)), "busy");
  assert.equal(await kind(() => json({ message: "Bad model" }, 400)), "other");
  assert.equal(await kind(() => Promise.reject(new TypeError("Failed to fetch"))), "network");
  assert.equal(await kind(() => new Response(stream({ event_type: "error", message: "boom" }))), "other");
  assert.equal(await kind(() => json({}), "  "), "token", "no token: nothing is sent");
  await assert.rejects(generateImage("t", V45, "p", 1, fake(() => json({ message: "Bad model" }, 400)).fetcher), /400: Bad model/);
});

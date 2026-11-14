import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMsgpack, readEvents, sniffImage } from "./codec.js";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Minimal MessagePack encoder for building fixtures. */
function encode(value) {
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  if (value === null) return [0xc0];
  if (typeof value === "boolean") return [value ? 0xc3 : 0xc2];
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

function frame(event) {
  const body = encode(event);
  return [body.length >>> 24, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
}

test("decodeMsgpack reads the value types NovelAI events use", () => {
  const image = new Uint8Array([...PNG, 1, 2, 3]);
  const event = { event_type: "final", samp_ix: 0, step_ix: 300, sigma: 0.25, done: true, extra: null, tags: ["a", 7], image };
  assert.deepEqual(decodeMsgpack(new Uint8Array(encode(event))), event);
});

test("decodeMsgpack reads negative and 64-bit integers", () => {
  assert.equal(decodeMsgpack(new Uint8Array([0xff])), -1);
  assert.equal(decodeMsgpack(new Uint8Array([0xd1, 0xff, 0x00])), -256);
  assert.equal(decodeMsgpack(new Uint8Array([0xcf, 0, 0, 0, 1, 0, 0, 0, 0])), 2 ** 32);
});

test("decodeMsgpack rejects truncated input", () => {
  assert.throws(() => decodeMsgpack(new Uint8Array([0xd9, 5, 0x61])), RangeError);
});

test("readEvents splits a stream into intermediate and final events", () => {
  const body = new Uint8Array([
    ...frame({ event_type: "intermediate", step_ix: 3, image: new Uint8Array([0xff, 0xd8, 0]) }),
    ...frame({ event_type: "final", image: new Uint8Array(PNG) }),
  ]);
  const events = readEvents(body);
  assert.deepEqual(events.map((event) => event.event_type), ["intermediate", "final"]);
  assert.equal(sniffImage(events[0].image), "image/jpeg");
  assert.equal(sniffImage(events[1].image), "image/png");
});

test("readEvents returns null for bodies that are not a frame stream", () => {
  assert.equal(readEvents(new TextEncoder().encode('{"statusCode":400,"message":"nope"}')), null);
  assert.equal(readEvents(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])), null);
  assert.equal(readEvents(new Uint8Array([])), null);
  const cut = frame({ event_type: "final", image: new Uint8Array(PNG) }).slice(0, -2);
  assert.equal(readEvents(new Uint8Array(cut)), null);
});

test("sniffImage recognises WebP and ignores other data", () => {
  const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")]);
  assert.equal(sniffImage(webp), "image/webp");
  assert.equal(sniffImage(new Uint8Array([1, 2, 3, 4])), null);
});

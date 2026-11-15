import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOSE_UP_ASPECT, crop, PORTRAIT_ASPECT, PORTRAIT_FRAMING, readFraming, type Crop, type Framing } from "./portrait.ts";

const near = (actual: Crop, expected: Crop) => {
  for (const key of ["width", "left", "top"] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.01, `${key}: ${actual[key]} is not ${expected[key]}`);
  }
};

/** The part of the image the frame shows, as fractions of the image: [left, top, right, bottom]. */
function visible(framing: Framing, imageAspect: number, frameAspect: number): number[] {
  const { width, left, top } = crop(framing, imageAspect, frameAspect);
  const heightPercent = (width / imageAspect) * frameAspect;
  return [-left / width, -top / heightPercent, (100 - left) / width, (100 - top) / heightPercent].map((n) => Math.round(n * 1000) / 1000 + 0);
}

test("a square frame over a square image shows the span around the face", () => {
  near(crop({ x: 0.5, y: 0.5, span: 0.5 }, 1, 1), { width: 200, left: -50, top: -50 });
  assert.deepEqual(visible({ x: 0.5, y: 0.5, span: 0.5 }, 1, 1), [0.25, 0.25, 0.75, 0.75]);
});

test("the close-up of a standing figure is the head and shoulders, centred on the face", () => {
  const [left, top, right, bottom] = visible(PORTRAIT_FRAMING, PORTRAIT_ASPECT, CLOSE_UP_ASPECT) as [number, number, number, number];
  assert.deepEqual([top, bottom], [0, 0.34], "the top third of the image, pinned to its top edge");
  assert.ok(Math.abs((left + right) / 2 - 0.5) < 0.001, "centred side to side");
  assert.ok(right - left < 0.5, "tighter than half the image's width");
});

test("the image always covers the frame", () => {
  const framings: Framing[] = [
    { x: 0, y: 0, span: 0.3 },
    { x: 1, y: 1, span: 0.3 },
    { x: 0.5, y: 0.5, span: 1 },
    { x: 0.2, y: 0.9, span: 0.6 },
  ];
  for (const framing of framings) {
    for (const imageAspect of [0.5, PORTRAIT_ASPECT, 1, 1.8]) {
      const [left, top, right, bottom] = visible(framing, imageAspect, CLOSE_UP_ASPECT) as [number, number, number, number];
      assert.ok(left >= 0 && top >= 0 && right <= 1 && bottom <= 1, `gap with ${JSON.stringify(framing)} at ${imageAspect}`);
    }
  }
});

test("a face at the edge is shown off-centre, with the crop pushed inward", () => {
  assert.deepEqual(visible({ x: 0, y: 0, span: 0.5 }, 1, 1), [0, 0, 0.5, 0.5]);
  assert.deepEqual(visible({ x: 1, y: 1, span: 0.5 }, 1, 1), [0.5, 0.5, 1, 1]);
});

test("a span too wide for the image's shape is tightened until the frame is filled", () => {
  // The whole height of a tall image would leave gaps at the sides of a wider frame.
  const [left, top, right, bottom] = visible({ x: 0.5, y: 0.5, span: 1 }, 0.5, 1) as [number, number, number, number];
  assert.deepEqual([left, right], [0, 1]);
  assert.deepEqual([top, bottom], [0.25, 0.75]);
});

test("stored framing is repaired before use", () => {
  assert.deepEqual(readFraming(null), PORTRAIT_FRAMING);
  assert.deepEqual(readFraming({ x: 5, y: -1, span: 0 }), { x: 1, y: 0, span: 0.1 });
  assert.deepEqual(readFraming({ x: "left", y: 0.4 }), { x: 0.5, y: 0.4, span: PORTRAIT_FRAMING.span });
});

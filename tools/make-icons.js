// Draws the app icon (a check mark on the accent colour) and writes it as
// PNGs into app/public. Run with `node tools/make-icons.js` after changing it.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BACKGROUND = [0x1f, 0x7a, 0x6d];
const MARK = [0xf6, 0xf5, 0xf1];
// The check mark as two strokes, in a 0..1 square.
const STROKES = [
  [0.27, 0.53, 0.44, 0.69],
  [0.44, 0.69, 0.74, 0.34],
];
const HALF_WIDTH = 0.055;

function distance(px, py, [ax, ay, bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size) {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const d = Math.min(...STROKES.map((stroke) => distance(px, py, stroke)));
      // One pixel of blend at the edge of the stroke.
      const cover = Math.max(0, Math.min(1, (HALF_WIDTH - d) * size + 0.5));
      const at = y * (size * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) rows[at + c] = Math.round(BACKGROUND[c] + (MARK[c] - BACKGROUND[c]) * cover);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [180, 512]) {
  const file = new URL(`../app/public/icon-${size}.png`, import.meta.url);
  writeFileSync(file, png(size));
  console.log(`wrote app/public/icon-${size}.png`);
}

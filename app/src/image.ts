// Turning a chosen picture into one the app can keep, and any picture into PNG bytes.
// Browser work: it needs an image element and a canvas.

import { dataUrlBytes } from "./lib/card.ts";
import type { StoredImage } from "./lib/model.ts";

/** Pictures are kept no larger than this on their longer side. Plenty for a phone screen, and small enough to store five. */
const MAX_SIDE = 1024;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as a picture."));
    image.src = src;
  });
}

function draw(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This phone could not prepare the picture.");
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Reads a chosen file and scales it down to fit. A photo stays a JPEG.
 * Anything else becomes a PNG, which keeps a transparent background.
 */
export async function prepareImage(file: Blob): Promise<Omit<StoredImage, "id">> {
  const address = URL.createObjectURL(file);
  try {
    const image = await load(address);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = draw(image, width, height);
    const data = file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
    return { data, width, height };
  } finally {
    URL.revokeObjectURL(address);
  }
}

/** A share of a picture's pixels that must be see-through before it counts as having a transparent background. */
const TRANSPARENT_SHARE = 0.05;

/**
 * A picture NovelAI drew, in the form it is kept in. One with a transparent
 * background is kept exactly as it came, since only a PNG holds transparency.
 * One without is kept as a JPEG, a fraction of the size.
 */
export async function keepDrawn(bytes: Uint8Array, type: string): Promise<Omit<StoredImage, "id">> {
  const address = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  try {
    const image = await load(address);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = draw(image, width, height);
    const context = canvas.getContext("2d")!;
    if (type === "image/png") {
      const pixels = context.getImageData(0, 0, width, height).data;
      let clear = 0;
      for (let at = 3; at < pixels.length; at += 4) if (pixels[at]! < 128) clear++;
      if (clear > (pixels.length / 4) * TRANSPARENT_SHARE) return { data: toDataUrl(bytes, type), width, height };
    }
    // No transparency to keep: flatten onto white, the backdrop the art was drawn on.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    return { data: canvas.toDataURL("image/jpeg", 0.92), width, height };
  } finally {
    URL.revokeObjectURL(address);
  }
}

function toDataUrl(bytes: Uint8Array, type: string): string {
  let binary = "";
  // In pieces, since a whole picture is too many arguments for one call.
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

/** Any picture the app can show, as the bytes of a PNG file. A character card has to be a PNG. */
export async function toPng(src: string): Promise<Uint8Array<ArrayBuffer>> {
  if (src.startsWith("data:image/png;")) return dataUrlBytes(src).bytes;
  const image = await load(src);
  // Drawn art has no size of its own worth keeping: give it a card-sized canvas.
  const scale = Math.max(1, 768 / (image.naturalHeight || 768));
  const canvas = draw(image, Math.round((image.naturalWidth || 512) * scale), Math.round((image.naturalHeight || 768) * scale));
  return dataUrlBytes(canvas.toDataURL("image/png")).bytes;
}

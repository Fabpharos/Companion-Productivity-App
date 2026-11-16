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

/** Any picture the app can show, as the bytes of a PNG file. A character card has to be a PNG. */
export async function toPng(src: string): Promise<Uint8Array<ArrayBuffer>> {
  if (src.startsWith("data:image/png;")) return dataUrlBytes(src).bytes;
  const image = await load(src);
  // Drawn art has no size of its own worth keeping: give it a card-sized canvas.
  const scale = Math.max(1, 768 / (image.naturalHeight || 768));
  const canvas = draw(image, Math.round((image.naturalWidth || 512) * scale), Math.round((image.naturalHeight || 768) * scale));
  return dataUrlBytes(canvas.toDataURL("image/png")).bytes;
}

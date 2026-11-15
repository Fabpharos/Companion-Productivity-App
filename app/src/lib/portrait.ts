// How companion art is framed.
//
// Companion art is a tall portrait of a whole character. It is shown two
// ways: whole, on the Companion tab, and as a close-up of the face beside the
// speech bubble on Today. The close-up is a crop, and where to crop is data
// that travels with the art: a `Framing`. The default art declares one, a
// character card will carry its own, and generated art will reuse its card's.

export interface Framing {
  /** The centre of the face, as fractions of the image's width and height (0 is left or top, 1 is right or bottom). */
  x: number;
  y: number;
  /** How much of the image's height the close-up shows: 0.3 is a tight head and shoulders, 1 is the whole image. */
  span: number;
}

/** Where the face usually is in a full-body portrait of a standing person. Used until an image has its own framing. */
export const PORTRAIT_FRAMING: Framing = { x: 0.5, y: 0.17, span: 0.34 };

/** The shape of the art itself, width over height, assumed until an image has loaded and reported its own. */
export const PORTRAIT_ASPECT = 2 / 3;

/** The shape of the close-up frame, width over height. */
export const CLOSE_UP_ASPECT = 4 / 5;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Makes any stored framing safe to use. */
export function readFraming(raw: unknown): Framing {
  const value = (raw ?? {}) as Partial<Record<keyof Framing, unknown>>;
  const number = (field: unknown, fallback: number) => (typeof field === "number" && Number.isFinite(field) ? field : fallback);
  return {
    x: clamp(number(value.x, PORTRAIT_FRAMING.x), 0, 1),
    y: clamp(number(value.y, PORTRAIT_FRAMING.y), 0, 1),
    span: clamp(number(value.span, PORTRAIT_FRAMING.span), 0.1, 1),
  };
}

export interface Crop {
  /** The image's width, as a percentage of the frame's width. */
  width: number;
  /** The image's left edge, as a percentage of the frame's width. Zero or negative. */
  left: number;
  /** The image's top edge, as a percentage of the frame's height. Zero or negative. */
  top: number;
}

/**
 * Places an image inside a frame so the face is centred and `span` of the
 * image's height is visible. The image always covers the frame: when the
 * framing would leave a gap, the image is enlarged or shifted instead, so a
 * face near an edge ends up off-centre and never beside an empty strip.
 */
export function crop(framing: Framing, imageAspect: number, frameAspect: number): Crop {
  // Work in units of the frame's width.
  const frameHeight = 1 / frameAspect;
  let height = frameHeight / framing.span;
  let width = height * imageAspect;
  if (width < 1) {
    width = 1;
    height = 1 / imageAspect;
  }
  const left = clamp(0.5 - framing.x * width, 1 - width, 0);
  const top = clamp(frameHeight / 2 - framing.y * height, frameHeight - height, 0);
  return { width: width * 100, left: left * 100, top: (top / frameHeight) * 100 };
}

// Decoding for NovelAI's image stream: a sequence of frames, each a 4-byte
// big-endian length followed by one MessagePack map (an "event"). The last
// event of a successful request carries the finished picture.

const text = new TextDecoder();

export type Value = null | boolean | number | bigint | string | Uint8Array | Value[] | { [key: string]: Value } | undefined;
export type StreamEvent = { [key: string]: Value };

/** Decodes one MessagePack value. Covers every type except extensions, which are skipped. */
export function decodeMsgpack(bytes: Uint8Array): Value {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;

  const take = (length: number) => {
    if (at + length > bytes.length) throw new RangeError("MessagePack value is truncated");
    at += length;
    return at - length;
  };
  const str = (length: number) => text.decode(bytes.subarray(take(length), at));
  const bin = (length: number) => bytes.slice(take(length), at);
  const array = (length: number): Value[] => Array.from({ length }, read);
  const map = (length: number) => {
    const out: { [key: string]: Value } = {};
    for (let i = 0; i < length; i++) out[String(read())] = read();
    return out;
  };
  const big = (value: bigint) => (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER ? Number(value) : value);
  const skip = (length: number) => void take(length);

  function read(): Value {
    const tag = view.getUint8(take(1));
    if (tag <= 0x7f) return tag;
    if (tag <= 0x8f) return map(tag & 0x0f);
    if (tag <= 0x9f) return array(tag & 0x0f);
    if (tag <= 0xbf) return str(tag & 0x1f);
    if (tag >= 0xe0) return tag - 0x100;
    switch (tag) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return bin(view.getUint8(take(1)));
      case 0xc5: return bin(view.getUint16(take(2)));
      case 0xc6: return bin(view.getUint32(take(4)));
      case 0xc7: return skip(view.getUint8(take(1)) + 1);
      case 0xc8: return skip(view.getUint16(take(2)) + 1);
      case 0xc9: return skip(view.getUint32(take(4)) + 1);
      case 0xca: return view.getFloat32(take(4));
      case 0xcb: return view.getFloat64(take(8));
      case 0xcc: return view.getUint8(take(1));
      case 0xcd: return view.getUint16(take(2));
      case 0xce: return view.getUint32(take(4));
      case 0xcf: return big(view.getBigUint64(take(8)));
      case 0xd0: return view.getInt8(take(1));
      case 0xd1: return view.getInt16(take(2));
      case 0xd2: return view.getInt32(take(4));
      case 0xd3: return big(view.getBigInt64(take(8)));
      case 0xd4: return skip(2);
      case 0xd5: return skip(3);
      case 0xd6: return skip(5);
      case 0xd7: return skip(9);
      case 0xd8: return skip(17);
      case 0xd9: return str(view.getUint8(take(1)));
      case 0xda: return str(view.getUint16(take(2)));
      case 0xdb: return str(view.getUint32(take(4)));
      case 0xdc: return array(view.getUint16(take(2)));
      case 0xdd: return array(view.getUint32(take(4)));
      case 0xde: return map(view.getUint16(take(2)));
      case 0xdf: return map(view.getUint32(take(4)));
      default: throw new RangeError(`Unknown MessagePack tag 0x${tag.toString(16)}`);
    }
  }

  return read();
}

/** Splits a complete response body into its events. Null when the body is not a well-formed frame sequence. */
export function readEvents(bytes: Uint8Array): StreamEvent[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const events: StreamEvent[] = [];
  let at = 0;
  while (at < bytes.length) {
    if (at + 4 > bytes.length) return null;
    const length = view.getUint32(at);
    at += 4;
    if (length === 0 || at + length > bytes.length) return null;
    try {
      const event = decodeMsgpack(bytes.subarray(at, at + length));
      if (typeof event !== "object" || event === null || Array.isArray(event) || event instanceof Uint8Array) return null;
      events.push(event);
    } catch {
      return null;
    }
    at += length;
  }
  return events.length > 0 ? events : null;
}

/** The type of PNG, JPEG or WebP data, or null for anything else. */
export function sniffImage(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && text.decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/**
 * The finished picture in a response body, which is either the event stream
 * or, from older endpoints, a bare image. Throws with NovelAI's own message
 * when the stream reports an error, and when there is no picture in it.
 */
export function finalImage(body: Uint8Array): { bytes: Uint8Array; type: string } {
  const events = readEvents(body);
  if (events) {
    const failure = events.find((event) => event.event_type === "error");
    if (failure) throw new Error(typeof failure.message === "string" ? failure.message : "NovelAI reported an error while drawing.");
    const final = events.findLast((event) => event.event_type === "final" && event.image instanceof Uint8Array);
    const image = final?.image;
    if (image instanceof Uint8Array) return { bytes: image, type: sniffImage(image) ?? "image/png" };
    throw new Error("NovelAI answered without a finished picture.");
  }
  const type = sniffImage(body);
  if (type) return { bytes: body, type };
  throw new Error("NovelAI answered in a form this app does not know.");
}

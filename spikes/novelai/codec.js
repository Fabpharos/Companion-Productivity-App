// Decoding for NovelAI's image stream: a sequence of frames, each a 4-byte
// big-endian length followed by one MessagePack map (an "event").
// Pure functions, so the same file is tested under Node.

const text = new TextDecoder();

/** Decodes one MessagePack value. Covers every type except extensions, which are skipped. */
export function decodeMsgpack(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;

  const take = (length) => {
    if (at + length > bytes.length) throw new RangeError("MessagePack value is truncated");
    at += length;
    return at - length;
  };
  const str = (length) => text.decode(bytes.subarray(take(length), at));
  const bin = (length) => bytes.slice(take(length), at);
  const array = (length) => Array.from({ length }, read);
  const map = (length) => {
    const out = {};
    for (let i = 0; i < length; i++) out[String(read())] = read();
    return out;
  };
  const big = (value) =>
    value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER ? Number(value) : value;

  function read() {
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
      case 0xc7: return void take(view.getUint8(take(1)) + 1);
      case 0xc8: return void take(view.getUint16(take(2)) + 1);
      case 0xc9: return void take(view.getUint32(take(4)) + 1);
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
      case 0xd4: return void take(2);
      case 0xd5: return void take(3);
      case 0xd6: return void take(5);
      case 0xd7: return void take(9);
      case 0xd8: return void take(17);
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

/**
 * Splits a complete response body into its events.
 * Returns null when the body is not a well-formed frame sequence.
 */
export function readEvents(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const events = [];
  let at = 0;
  while (at < bytes.length) {
    if (at + 4 > bytes.length) return null;
    const length = view.getUint32(at);
    at += 4;
    if (length === 0 || at + length > bytes.length) return null;
    try {
      events.push(decodeMsgpack(bytes.subarray(at, at + length)));
    } catch {
      return null;
    }
    at += length;
  }
  return events.length > 0 ? events : null;
}

/** Returns the MIME type of PNG, JPEG or WebP data, or null for anything else. */
export function sniffImage(bytes) {
  const starts = (...signature) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && text.decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

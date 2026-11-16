// The companion's identity, and the character card file that carries it.
//
// A character card is an ordinary PNG picture of the character with its data
// tucked inside the file, in the SillyTavern "V2" layout, so the same file
// opens in other character tools. The standard fields hold the name,
// description, personality and example lines. What only this app uses (the
// dialogue style, the appearance prompt, where the face is) sits in the
// card's `extensions` under this app's own key.
//
// Bond level and unlocks are progress, not identity, and are never written to a card.

import type { CompanionCard, OutfitRule, StoredImage } from "./model.ts";
import { POSES } from "./companion.ts";
import { PORTRAIT_FRAMING, readFraming } from "./portrait.ts";

export class CardError extends Error {}

export const DEFAULT_CARD: CompanionCard = {
  name: "",
  description: "",
  personality: "",
  examples: "",
  styleId: "calm",
  basePrompt: "",
  defaultOutfit: "",
  outfitRules: [],
  framing: PORTRAIT_FRAMING,
  other: {},
};

/** The key of this app's section inside a card's `extensions`. */
const EXTENSION = "companion_app";
/** The standard V2 fields this app reads and writes itself. Everything else in a card is carried along untouched. */
const OWN_FIELDS = ["name", "description", "personality", "mes_example", "extensions"];

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

function readRules(raw: unknown): OutfitRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObject)
    .map((rule) => ({ context: str(rule.context, 100), tags: str(rule.tags, 500) }))
    .filter((rule) => rule.context && rule.tags)
    .slice(0, 50);
}

/** A card with every field present and of the right type, from whatever was stored or imported. */
export function readCard(raw: unknown): CompanionCard {
  if (!isObject(raw)) return { ...DEFAULT_CARD };
  return {
    name: str(raw.name, 100).trim(),
    description: str(raw.description, 20_000),
    personality: str(raw.personality, 20_000),
    examples: str(raw.examples, 20_000),
    styleId: str(raw.styleId, 40) || DEFAULT_CARD.styleId,
    basePrompt: str(raw.basePrompt, 5000),
    defaultOutfit: str(raw.defaultOutfit, 1000),
    outfitRules: readRules(raw.outfitRules),
    framing: raw.framing === undefined ? PORTRAIT_FRAMING : readFraming(raw.framing),
    other: isObject(raw.other) ? raw.other : {},
  };
}

/** One of the companion's stored pictures, or null if it is not usable. */
export function readImage(raw: unknown): StoredImage | null {
  if (!isObject(raw) || !(POSES as readonly string[]).includes(raw.id as string)) return null;
  if (typeof raw.data !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(raw.data)) return null;
  const size = (value: unknown) => (typeof value === "number" && value > 0 ? Math.round(value) : 0);
  return { id: raw.id as StoredImage["id"], data: raw.data, width: size(raw.width), height: size(raw.height) };
}

// ---------- The card's data ----------

/** The card as the JSON document a character card holds. */
export function cardToJson(card: CompanionCard): object {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      // The fields the format requires, empty unless an imported card filled them.
      scenario: "",
      first_mes: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "",
      ...card.other,
      name: card.name,
      description: card.description,
      personality: card.personality,
      mes_example: card.examples,
      extensions: {
        ...(isObject(card.other.extensions) ? card.other.extensions : {}),
        [EXTENSION]: {
          version: 1,
          styleId: card.styleId,
          basePrompt: card.basePrompt,
          defaultOutfit: card.defaultOutfit,
          outfitRules: card.outfitRules,
          framing: card.framing,
        },
      },
    },
  };
}

/** Reads a card's JSON document. Understands V2 and V3 cards, and the older flat layout. Null if it is not a card. */
export function cardFromJson(json: unknown): CompanionCard | null {
  if (!isObject(json)) return null;
  const data = isObject(json.data) ? json.data : json;
  if (typeof data.name !== "string") return null;
  const extensions = isObject(data.extensions) ? data.extensions : {};
  const own = isObject(extensions[EXTENSION]) ? extensions[EXTENSION] : {};
  const { [EXTENSION]: _own, ...otherExtensions } = extensions;
  // Empty fields are the format's padding, not something to carry along.
  const empty = (value: unknown) => value === "" || value === null || (Array.isArray(value) && value.length === 0);
  const other: Raw = Object.fromEntries(Object.entries(data).filter(([key, value]) => !OWN_FIELDS.includes(key) && !empty(value)));
  if (Object.keys(otherExtensions).length) other.extensions = otherExtensions;
  return readCard({
    name: data.name,
    description: data.description,
    personality: data.personality,
    examples: data.mes_example,
    styleId: own.styleId,
    basePrompt: own.basePrompt,
    defaultOutfit: own.defaultOutfit,
    outfitRules: own.outfitRules,
    framing: own.framing,
    other,
  });
}

// ---------- The PNG file ----------

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** The text chunks character tools look for. "chara" is the V2 card; "ccv3" is the V3 copy some tools add. */
const CARD_KEYWORDS = ["chara", "ccv3"];

interface Chunk {
  type: string;
  /** Where the whole chunk (length, type, data, checksum) sits in the file. */
  start: number;
  end: number;
  data: Uint8Array;
}

function chunks(png: Uint8Array): Chunk[] {
  if (png.length < 8 || SIGNATURE.some((byte, index) => png[index] !== byte)) throw new CardError("This file is not a PNG image.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const found: Chunk[] = [];
  for (let at = 8; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > png.length) throw new CardError("This PNG image is cut short or damaged.");
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!);
    found.push({ type, start: at, end, data: png.subarray(at + 8, at + 8 + length) });
    if (type === "IEND") break;
    at = end;
  }
  return found;
}

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

/** A text chunk's keyword and text, or null for any other chunk. */
function textOf(chunk: Chunk): { keyword: string; text: string } | null {
  if (chunk.type !== "tEXt") return null;
  const split = chunk.data.indexOf(0);
  if (split < 0) return null;
  return { keyword: latin1(chunk.data.subarray(0, split)), text: latin1(chunk.data.subarray(split + 1)) };
}

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeTextChunk(keyword: string, text: string): Uint8Array {
  const body = Uint8Array.from(`tEXt${keyword}\0${text}`, (char) => char.charCodeAt(0));
  const chunk = new Uint8Array(body.length + 8);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length - 4);
  chunk.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));
  return chunk;
}

function toBase64(text: string): string {
  return btoa(latin1(new TextEncoder().encode(text)));
}

function fromBase64(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
}

/** The card inside a PNG file, or null if the picture carries none. Throws a CardError if the file is not a PNG. */
export function extractCard(png: Uint8Array): CompanionCard | null {
  for (const chunk of chunks(png)) {
    const text = textOf(chunk);
    if (text?.keyword !== "chara") continue;
    try {
      return cardFromJson(JSON.parse(fromBase64(text.text)));
    } catch {
      throw new CardError("This picture's character data could not be read.");
    }
  }
  return null;
}

/** A copy of a PNG file with the card written into it, replacing any card it already held. */
export function embedCard(png: Uint8Array, card: CompanionCard): Uint8Array<ArrayBuffer> {
  const all = chunks(png);
  const end = all.find((chunk) => chunk.type === "IEND");
  if (!end) throw new CardError("This PNG image is cut short or damaged.");
  const stale = all.filter((chunk) => CARD_KEYWORDS.includes(textOf(chunk)?.keyword ?? ""));
  const added = makeTextChunk("chara", toBase64(JSON.stringify(cardToJson(card))));

  const parts: Uint8Array[] = [];
  let from = 0;
  for (const chunk of [...stale, end].sort((a, b) => a.start - b.start)) {
    parts.push(png.subarray(from, chunk.start));
    if (chunk === end) parts.push(added, png.subarray(end.start, end.end));
    from = chunk.end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The bytes of a `data:` address, and its type. */
export function dataUrlBytes(url: string): { type: string; bytes: Uint8Array<ArrayBuffer> } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!match) throw new CardError("This picture is not stored in a form that can be exported.");
  return { type: match[1]!, bytes: Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0)) };
}

/** A name for the card file, from the character's name. */
export function cardFileName(card: CompanionCard): string {
  const name = card.name.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${name || "companion"}.card.png`;
}

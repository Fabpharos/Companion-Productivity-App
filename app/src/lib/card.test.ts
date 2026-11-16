import assert from "node:assert/strict";
import { test } from "node:test";
import { CardError, cardFileName, cardFromJson, cardToJson, dataUrlBytes, DEFAULT_CARD, embedCard, extractCard, readCard, readImage } from "./card.ts";
import type { CompanionCard } from "./model.ts";

// The smallest valid PNG: one transparent pixel.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const png = () => Uint8Array.from(atob(PIXEL), (char) => char.charCodeAt(0));

const card: CompanionCard = {
  name: "Mika 美香",
  description: "A cheerful shrine maiden.\nLikes tea — and tidy rooms.",
  personality: "warm, a little teasing",
  examples: "<START>\n{{char}}: Well done!",
  styleId: "teasing",
  basePrompt: "1girl, long black hair, brown eyes",
  defaultOutfit: "white blouse, red skirt",
  outfitRules: [{ context: "chores", tags: "apron, hair tied back" }],
  framing: { x: 0.48, y: 0.2, span: 0.3 },
  other: {},
};

test("a card written into a picture reads back as the same character", () => {
  const file = embedCard(png(), card);
  assert.deepEqual(extractCard(file), card);
  assert.deepEqual([...file.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "still a PNG");
  assert.equal(String.fromCharCode(...file.subarray(-8, -4)), "IEND", "the picture still ends where a PNG must");
});

test("writing a card again replaces the old one", () => {
  const first = embedCard(png(), card);
  const second = embedCard(first, { ...card, name: "Rin" });
  assert.equal(extractCard(second)?.name, "Rin");
  assert.equal(second.length < first.length + 20, true, "the old card is gone, not kept beside the new one");
});

test("a picture without a card, and a file that is not a PNG, are told apart", () => {
  assert.equal(extractCard(png()), null);
  assert.throws(() => extractCard(new TextEncoder().encode("not a picture")), CardError);
  assert.throws(() => embedCard(png().subarray(0, 30), card), CardError);
});

test("the card is laid out as other character tools expect", () => {
  const json = cardToJson(card) as { spec: string; spec_version: string; data: Record<string, unknown> };
  assert.deepEqual([json.spec, json.spec_version], ["chara_card_v2", "2.0"]);
  assert.deepEqual(
    [json.data.name, json.data.description, json.data.personality, json.data.mes_example],
    [card.name, card.description, card.personality, card.examples],
  );
  for (const field of ["scenario", "first_mes", "creator_notes", "system_prompt", "post_history_instructions", "alternate_greetings", "tags", "creator", "character_version"]) {
    assert.ok(field in json.data, `${field} is a required V2 field`);
  }
  assert.equal((json.data.extensions as { companion_app: { styleId: string } }).companion_app.styleId, "teasing");
  assert.doesNotMatch(JSON.stringify(json), /bond|level|streak/i, "progress is not identity");
});

test("a card made elsewhere loads, and what this app does not use is carried along", () => {
  const foreign = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Aoi",
      description: "A librarian.",
      personality: "quiet",
      scenario: "A library at night.",
      first_mes: "Oh. Hello.",
      mes_example: "{{char}}: Shh.",
      tags: ["calm"],
      extensions: { depth_prompt: { depth: 4 } },
    },
  };
  const read = cardFromJson(foreign)!;
  assert.deepEqual([read.name, read.personality, read.examples, read.styleId, read.framing], ["Aoi", "quiet", "{{char}}: Shh.", "calm", DEFAULT_CARD.framing]);
  const again = cardToJson({ ...read, styleId: "formal" }) as { data: Record<string, unknown> };
  assert.deepEqual([again.data.scenario, again.data.first_mes, again.data.tags], ["A library at night.", "Oh. Hello.", ["calm"]]);
  assert.deepEqual(Object.keys(again.data.extensions as object).sort(), ["companion_app", "depth_prompt"]);
  assert.deepEqual(cardFromJson(again), { ...read, styleId: "formal" });

  assert.equal(cardFromJson({ name: "Old", description: "flat layout", personality: "", mes_example: "" })?.name, "Old", "the older flat layout");
  assert.equal(cardFromJson({ spec: "chara_card_v2", data: {} }), null);
  assert.equal(cardFromJson("nope"), null);
});

test("a stored card is made safe field by field", () => {
  assert.deepEqual(readCard(null), DEFAULT_CARD);
  const read = readCard({ name: "  Mika ", styleId: "", framing: { x: 5, y: "no", span: 0 }, outfitRules: [{ context: "chores" }, "x", { context: "a", tags: "b" }], other: [] });
  assert.deepEqual([read.name, read.styleId, read.outfitRules, read.other], ["Mika", "calm", [{ context: "a", tags: "b" }], {}]);
  assert.deepEqual(read.framing, { x: 1, y: DEFAULT_CARD.framing.y, span: 0.1 });
});

test("a stored picture must be a pose's image", () => {
  const data = `data:image/png;base64,${PIXEL}`;
  assert.deepEqual(readImage({ id: "idle", data, width: 512.4, height: 768 }), { id: "idle", data, width: 512, height: 768 });
  assert.equal(readImage({ id: "dancing", data }), null);
  assert.equal(readImage({ id: "idle", data: "https://example.com/a.png" }), null);
  assert.equal(readImage({ id: "idle", data: "data:text/html;base64,AAAA" }), null);
  assert.deepEqual([...dataUrlBytes(data).bytes], [...png()]);
  assert.equal(dataUrlBytes(data).type, "image/png");
});

test("the card file is named after the character", () => {
  assert.equal(cardFileName(card), "Mika-美香.card.png");
  assert.equal(cardFileName({ ...card, name: " ../../etc " }), "etc.card.png");
  assert.equal(cardFileName(DEFAULT_CARD), "companion.card.png");
});

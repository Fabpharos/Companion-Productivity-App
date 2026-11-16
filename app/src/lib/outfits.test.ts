import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CARD } from "./card.ts";
import type { StoredImage } from "./model.ts";
import { currentLook, customId, defaultLook, hasBaseImage, imageId, isGenerated, nearestImage, rulesFor, withoutRule, withRule, type WearContext } from "./outfits.ts";

const card = { ...DEFAULT_CARD, name: "Mika", basePrompt: "1girl, black hair", defaultOutfit: "white blouse, red skirt" };
const quiet: WearContext = { tripOutfit: "", recent: null, hour: 14, month: 10, celebrating: false };
const wearing = (context: Partial<WearContext>, chosen: string | null = null, who = card) => currentLook(who, { ...quiet, ...context }, chosen);

test("the first situation that applies decides the outfit, and the default covers the rest", () => {
  assert.deepEqual([wearing({}).id, wearing({}).tags], ["default", "white blouse, red skirt"]);
  assert.deepEqual([wearing({ tripOutfit: "kimono" }).id, wearing({ tripOutfit: "kimono" }).tags], ["trip", "kimono"]);
  assert.equal(wearing({ tripOutfit: "kimono", recent: "chore", hour: 23 }).id, "trip", "a trip comes before everything");
  assert.equal(wearing({ recent: "chore", hour: 23 }).tags, "apron, hair tied back");
  assert.equal(wearing({ recent: "shopping" }).id, "shopping");
  assert.equal(wearing({ hour: 22 }).tags, "pajamas");
  assert.equal(wearing({ hour: 3 }).id, "night");
  assert.equal(wearing({ celebrating: true }).id, "celebration");
  assert.equal(wearing({ month: 1 }).id, "winter");
  assert.equal(wearing({ month: 4 }).id, "default", "spring has no outfit unless one is given");
});

test("the card's own rules replace the built-in outfits, switch them off, and add outfits chosen by hand", () => {
  const own = { ...card, outfitRules: withRule(card, "night", "nightgown") };
  assert.equal(wearing({ hour: 22 }, null, own).tags, "nightgown");
  const off = { ...card, outfitRules: withRule(card, "night", "") };
  assert.equal(wearing({ hour: 22 }, null, off).id, "default");
  assert.equal(wearing({ hour: 22 }, null, { ...off, outfitRules: withoutRule(off, "night") }).tags, "pajamas");

  const festival = { ...card, outfitRules: withRule(card, customId(" Festival "), "yukata") };
  assert.deepEqual(rulesFor(festival).at(-1), { id: "custom:Festival", label: "Festival", tags: "yukata", custom: true });
  assert.equal(wearing({}, null, festival).id, "default", "a custom outfit is never worn on its own");
  assert.equal(wearing({ tripOutfit: "kimono" }, "custom:Festival", festival).tags, "yukata", "chosen by hand, it wins");
  assert.equal(wearing({ tripOutfit: "kimono" }, "default", festival).id, "default");
  assert.equal(wearing({ hour: 22 }, "custom:Gone", festival).id, "night", "a choice that no longer exists is ignored");
  assert.equal(rulesFor(card).some((rule) => rule.id === "trip"), false, "the trip's outfit is set on the trip");
});

test("a look's pictures are named by the character and the outfit together", () => {
  const kimono = wearing({ tripOutfit: "kimono" });
  assert.match(kimono.key, /^[0-9a-f]{8}$/);
  assert.equal(wearing({ tripOutfit: " Kimono " }).key, kimono.key, "spacing and case make no difference");
  assert.notEqual(wearing({ tripOutfit: "yukata" }).key, kimono.key);
  assert.notEqual(currentLook({ ...card, basePrompt: "1girl, red hair" }, { ...quiet, tripOutfit: "kimono" }).key, kimono.key, "a changed character gets new pictures");
  assert.equal(imageId(kimono.key, "happy"), `nai:${kimono.key}:happy`);
});

test("the nearest stored picture stands in for one not drawn yet", () => {
  const everyday = defaultLook(card);
  const kimono = wearing({ tripOutfit: "kimono" });
  const picture = (id: string): StoredImage => ({ id, data: "data:image/jpeg;base64,AAAA", width: 512, height: 768 });
  const stored = [picture("idle"), picture(imageId(everyday.key, "idle")), picture(imageId(everyday.key, "happy")), picture(imageId(kimono.key, "idle"))];

  assert.equal(nearestImage(stored, card, kimono, "idle")?.id, imageId(kimono.key, "idle"));
  assert.equal(nearestImage(stored, card, kimono, "happy")?.id, imageId(kimono.key, "idle"), "the outfit matters more than the mood");
  assert.equal(nearestImage(stored, card, wearing({ hour: 22 }), "happy")?.id, imageId(everyday.key, "happy"));
  assert.equal(nearestImage(stored, card, wearing({ hour: 22 }), "sleepy")?.id, imageId(everyday.key, "idle"));
  assert.equal(nearestImage([picture("idle")], card, kimono, "idle"), undefined, "an uploaded picture is not a generated one");

  assert.equal(hasBaseImage(stored, card), true);
  assert.equal(hasBaseImage(stored, { ...card, defaultOutfit: "black dress" }), false);
  assert.deepEqual(stored.map(isGenerated), [false, true, true, true]);
});

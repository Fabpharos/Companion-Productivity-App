// What the companion wears, and which stored picture shows it.
//
// A short list of situations is checked in order and the first that applies
// decides the outfit. Each outfit-and-mood picture is drawn once by NovelAI,
// approved, and kept, so the companion is found in the store by what it is
// wearing and its pose.

import type { CompanionCard, PoseName, StoredImage } from "./model.ts";

/** What is going on right now, as far as clothes are concerned. */
export interface WearContext {
  /** The outfit tag of a trip that is under way or about to start, else "". */
  tripOutfit: string;
  /** What was last finished in the past half hour, if anything. */
  recent: "chore" | "shopping" | null;
  /** The hour on the phone's clock, 0 to 23, and the month, 1 to 12. */
  hour: number;
  month: number;
  /** True on a day a milestone was reached, once the bond is strong enough. */
  celebrating: boolean;
}

interface Situation {
  id: string;
  label: string;
  /** The outfit worn unless the card says otherwise. Empty means none: the situation is skipped. */
  tags: string;
  applies(context: WearContext): boolean;
}

const season = (months: number[]) => (context: WearContext) => months.includes(context.month);

/** The built-in situations, most specific first. The first that applies and has an outfit wins. */
export const SITUATIONS: Situation[] = [
  { id: "trip", label: "Trip outfit", tags: "", applies: (context) => context.tripOutfit !== "" },
  { id: "chores", label: "After a chore", tags: "apron, hair tied back", applies: (context) => context.recent === "chore" },
  { id: "shopping", label: "After shopping", tags: "casual clothes, tote bag", applies: (context) => context.recent === "shopping" },
  { id: "night", label: "Late evening", tags: "pajamas", applies: (context) => context.hour >= 21 || context.hour < 5 },
  { id: "celebration", label: "A milestone day", tags: "party hat", applies: (context) => context.celebrating },
  { id: "winter", label: "Winter", tags: "winter coat, scarf", applies: season([12, 1, 2]) },
  { id: "spring", label: "Spring", tags: "", applies: season([3, 4, 5]) },
  { id: "summer", label: "Summer", tags: "sundress, sun hat", applies: season([6, 7, 8]) },
  { id: "autumn", label: "Autumn", tags: "", applies: season([9, 10, 11]) },
];

const CUSTOM = "custom:";

export interface Rule {
  id: string;
  label: string;
  tags: string;
  /** A custom outfit is never worn on its own: it is chosen by hand. */
  custom: boolean;
}

/** Every outfit rule for a card: the built-in situations with the card's own tags where it has any, then its custom outfits. */
export function rulesFor(card: CompanionCard): Rule[] {
  const own = new Map(card.outfitRules.map((rule) => [rule.context, rule.tags]));
  return [
    ...SITUATIONS.filter((situation) => situation.id !== "trip").map((situation) => ({
      id: situation.id,
      label: situation.label,
      tags: own.get(situation.id) ?? situation.tags,
      custom: false,
    })),
    ...card.outfitRules
      .filter((rule) => rule.context.startsWith(CUSTOM))
      .map((rule) => ({ id: rule.context, label: rule.context.slice(CUSTOM.length), tags: rule.tags, custom: true })),
  ];
}

/** The card's outfit rules with one rule's tags changed. Tags may be empty, which switches a built-in rule off. */
export function withRule(card: CompanionCard, id: string, tags: string): CompanionCard["outfitRules"] {
  return [...card.outfitRules.filter((rule) => rule.context !== id), { context: id, tags }];
}

export function withoutRule(card: CompanionCard, id: string): CompanionCard["outfitRules"] {
  return card.outfitRules.filter((rule) => rule.context !== id);
}

export const customId = (name: string) => `${CUSTOM}${name.trim()}`;

export interface Look {
  /** The rule that decided it: a situation, a custom outfit, or "default". */
  id: string;
  label: string;
  tags: string;
  /** Names this look's pictures in the store. It changes when the character or the outfit does. */
  key: string;
}

function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return ((value ^ (value >>> 13)) >>> 0).toString(16).padStart(8, "0");
}

const normal = (tags: string) =>
  tags
    .toLowerCase()
    .split(",")
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(",");

function look(card: CompanionCard, id: string, label: string, tags: string): Look {
  // The key covers the character too, so pictures of an earlier appearance are never shown for a new one.
  return { id, label, tags, key: hash(`${normal(card.basePrompt)}|${normal(tags)}`) };
}

export function defaultLook(card: CompanionCard): Look {
  return look(card, "default", "Everyday", card.defaultOutfit);
}

/**
 * What the companion wears now. A look chosen by hand wins. Otherwise it is
 * the first situation that applies and has an outfit, and the card's default
 * outfit when none does.
 */
export function currentLook(card: CompanionCard, context: WearContext, chosen: string | null = null): Look {
  const rules = rulesFor(card);
  const forced = chosen === "default" ? defaultLook(card) : rules.find((rule) => rule.id === chosen && rule.tags.trim());
  if (forced) return "key" in forced ? forced : look(card, forced.id, forced.label, forced.tags);
  for (const situation of SITUATIONS) {
    if (!situation.applies(context)) continue;
    const tags = situation.id === "trip" ? context.tripOutfit : (rules.find((rule) => rule.id === situation.id)?.tags ?? "");
    if (tags.trim()) return look(card, situation.id, situation.label, tags);
  }
  return defaultLook(card);
}

const PREFIX = "nai:";

/** The name a generated picture is stored under. */
export function imageId(key: string, pose: PoseName): string {
  return `${PREFIX}${key}:${pose}`;
}

export function isGenerated(image: StoredImage): boolean {
  return image.id.startsWith(PREFIX);
}

/**
 * The stored picture nearest to a look and pose: that exact one, else the
 * look in its resting pose, else the everyday look in that pose, else the
 * everyday look resting. Undefined when not even that has been drawn.
 */
export function nearestImage(images: StoredImage[], card: CompanionCard, wearing: Look, pose: PoseName): StoredImage | undefined {
  const everyday = defaultLook(card).key;
  const byId = new Map(images.map((image) => [image.id, image]));
  return (
    byId.get(imageId(wearing.key, pose)) ?? byId.get(imageId(wearing.key, "idle")) ?? byId.get(imageId(everyday, pose)) ?? byId.get(imageId(everyday, "idle"))
  );
}

/** True once the everyday look has an approved picture: the point from which NovelAI draws the companion. */
export function hasBaseImage(images: StoredImage[], card: CompanionCard): boolean {
  return images.some((image) => image.id === imageId(defaultLook(card).key, "idle"));
}

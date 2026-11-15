// Quick capture: turns one line of typed text into drafts of items.
//
// The rules, in order:
//   1. "buy milk", "need eggs and bread": a shopping lead-in followed only by groceries makes shopping entries.
//   2. A leading action verb ("call", "pay", "book") makes a to-do. A day word at the end sets its due date.
//   3. Text that is only groceries makes shopping entries, one per item.
//   4. Anything else is a note.
// `#words` become tags in every case. The guess is cheap to correct, so the
// rules favour being predictable over being clever.

import { OTHER_SECTION, SECTIONS } from "../../content/groceries.ts";
import { addDays } from "./dates.ts";
import type { ItemKind } from "./model.ts";

export interface Draft {
  kind: ItemKind;
  text: string;
  tags: string[];
  due: string | null;
  section: string | null;
}

const GROCERIES = new Map<string, string>();
for (const [section, words] of Object.entries(SECTIONS)) {
  for (const word of words) GROCERIES.set(word, section);
}

const VERBS = new Set(
  (
    "add apply ask arrange back book bring build buy call cancel change charge check clean clear collect confirm contact " +
    "copy cut debug deliver deposit do donate download draft drop email empty file fill find finish fix fold follow " +
    "get give go grab hang install invite iron join learn look mail make measure message mop move mow order organize " +
    "pack paint pay phone pick plan post practice prepare print put read rebook refill register remind remove renew " +
    "rent repair replace reply request research reschedule reserve return review ring schedule scan sell send set " +
    "ship sign sort start study submit sweep take talk tell text throw tidy transfer try update upload vacuum visit " +
    "wash watch water wipe wrap write"
  ).split(" "),
);

const LEAD_IN = /^(?:buy|get|grab|pick up|restock|(?:we |i )?need|(?:we're |we are |i'm |i am )?out of)\s+(?:some |more )?/i;
const QUANTITY = /^(?:\d+(?:[.,/]\d+)?\s*x?|an?|some|more|one|two|three|four|five|six|half a|a few|(?:a )?couple(?: of)?|(?:a )?dozen)\s+/i;
const UNIT =
  /^(?:lbs?|pounds?|oz|ounces?|kg|g|grams?|packs?|packages?|bags?|box(?:es)?|bottles?|cans?|jars?|bunch(?:es)?|cartons?|loaf|loaves|gallons?|lit(?:er|re)s?|cups?|heads?|sticks?|cases?|rolls?|pints?|quarts?|dozen)\s+(?:of\s+)?/i;
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_WORD = new RegExp(`(?:^|\\s)(?:(?:on|by|this)\\s+)?(today|tonight|tomorrow|next week|${DAYS.join("|")})$`, "i");

function takeTags(raw: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = raw
    .replace(TAG, (_, lead: string, tag: string) => {
      const lower = tag.toLowerCase();
      if (!tags.includes(lower)) tags.push(lower);
      return lead;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, tags };
}

function takeDue(text: string, today: string): { text: string; due: string | null } {
  const match = DAY_WORD.exec(text);
  if (!match) return { text, due: null };
  const rest = text.slice(0, match.index).trim();
  if (!rest) return { text, due: null };
  const word = match[1]!.toLowerCase();
  let due: string;
  if (word === "today" || word === "tonight") due = today;
  else if (word === "tomorrow") due = addDays(today, 1);
  else if (word === "next week") due = addDays(today, 7);
  else {
    const [y, m, d] = today.split("-").map(Number);
    const from = new Date(y!, m! - 1, d!).getDay();
    due = addDays(today, ((DAYS.indexOf(word) - from + 6) % 7) + 1);
  }
  return { text: rest, due };
}

function singulars(word: string): string[] {
  const out = [word];
  if (word.endsWith("ies")) out.push(word.slice(0, -3) + "y");
  if (word.endsWith("oes")) out.push(word.slice(0, -2));
  if (word.endsWith("es")) out.push(word.slice(0, -2));
  if (word.endsWith("s")) out.push(word.slice(0, -1));
  return out;
}

/** The store section for a grocery phrase such as "2 lbs chicken thighs", or null when it is not a known grocery. */
export function grocerySection(phrase: string): string | null {
  const words = phrase
    .toLowerCase()
    .replace(QUANTITY, "")
    .replace(UNIT, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 5 || /[,;]/.test(phrase)) return null;
  const last = words.at(-1)!;
  // The longest match wins, so "ice cream" is Frozen and not Dairy.
  for (let take = Math.min(3, words.length); take >= 1; take--) {
    const lead = words.slice(-take, -1);
    for (const end of singulars(last)) {
      const section = GROCERIES.get([...lead, end].join(" "));
      if (section) return section;
    }
  }
  return null;
}

function splitParts(text: string, pattern: RegExp): string[] {
  return text
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The parts of `text` if every one is a known grocery, else null. */
function allGroceries(text: string): string[] | null {
  if (!text) return null;
  if (grocerySection(text)) return [text];
  const parts = splitParts(text, /[,;&\n]|\s+and\s+/i);
  return parts.length > 1 && parts.every((part) => grocerySection(part)) ? parts : null;
}

function shoppingDrafts(parts: string[], tags: string[]): Draft[] {
  return parts.map((text) => ({ kind: "shopping", text, tags, due: null, section: grocerySection(text) ?? OTHER_SECTION }));
}

/**
 * Turns captured text into drafts. With `force` the kind is given and only the
 * details are worked out; without it the rules above pick the kind.
 */
export function parseCapture(raw: string, today: string, force?: ItemKind): Draft[] {
  const { text, tags } = takeTags(raw.trim());
  if (!text) return [];

  if (force === "shopping") return shoppingDrafts(splitParts(text, /[,;\n]/), tags);
  if (force === "note") return [{ kind: "note", text, tags, due: null, section: null }];

  const todo = (): Draft[] => {
    const { text: rest, due } = takeDue(text, today);
    return [{ kind: "todo", text: rest, tags, due, section: null }];
  };
  if (force === "todo") return todo();

  const leadIn = LEAD_IN.exec(text);
  if (leadIn) {
    const parts = allGroceries(text.slice(leadIn[0].length).trim());
    if (parts) return shoppingDrafts(parts, tags);
  }

  const words = text.split(/\s+/);
  if (words.length > 1 && VERBS.has(words[0]!.toLowerCase())) return todo();

  const parts = allGroceries(text);
  if (parts) return shoppingDrafts(parts, tags);

  return [{ kind: "note", text, tags, due: null, section: null }];
}

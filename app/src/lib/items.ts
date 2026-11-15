// Rules for items: creating, completing, repeating, sorting and grouping.
// Pure functions over plain records. The data layer decides what to store.

import { OTHER_SECTION, SECTION_ORDER } from "../../content/groceries.ts";
import { grocerySection } from "./capture.ts";
import { nextDue } from "./dates.ts";
import { homeList, newId, type Activity, type Item, type ItemKind } from "./model.ts";

export function makeItem(fields: Partial<Item> & Pick<Item, "kind" | "text" | "listId">, now: number): Item {
  return {
    id: newId(),
    tags: [],
    createdAt: now,
    updatedAt: now,
    doneAt: null,
    pinned: false,
    due: null,
    time: null,
    repeat: null,
    priority: 0,
    subtasks: [],
    focusOn: null,
    section: fields.kind === "shopping" ? OTHER_SECTION : null,
    staple: false,
    tripId: null,
    ...fields,
  };
}

/** A bought staple is done but stays on its list, waiting to be restocked. */
export function isStocked(item: Item): boolean {
  return item.doneAt !== null && item.kind === "shopping" && item.staple;
}

export function isOpen(item: Item): boolean {
  return item.doneAt === null;
}

export function isArchived(item: Item): boolean {
  return item.doneAt !== null && !isStocked(item);
}

export interface Completion {
  /** The completed item, and the next occurrence when it repeats. */
  items: Item[];
  activity: Activity;
}

/**
 * Completes an item. A repeating to-do is archived like any other and a fresh
 * copy takes its place with the next due date, so the archive keeps one entry
 * per time it was done.
 */
export function completeItem(item: Item, now: number, today: string, points = 0): Completion {
  const done: Item = { ...item, doneAt: now, updatedAt: now, repeat: null };
  const items = [done];
  if (item.kind === "todo" && item.repeat) {
    items.push({
      ...item,
      id: newId(),
      createdAt: now,
      updatedAt: now,
      due: nextDue(item.due, item.repeat, today),
      focusOn: null,
      subtasks: item.subtasks.map((step) => ({ ...step, done: false })),
    });
  }
  const activity: Activity = { id: newId(), at: now, type: "done", itemId: item.id, kind: item.kind, text: title(item), points };
  return { items, activity };
}

export function reopenItem(item: Item, now: number): Item {
  return { ...item, doneAt: null, updatedAt: now };
}

/** Changes what an item is, moving it to that kind's built-in list. Nothing is discarded, so changing back loses nothing. */
export function retype(item: Item, kind: ItemKind, now: number): Item {
  return {
    ...item,
    kind,
    listId: homeList(kind),
    section: kind === "shopping" ? (item.section ?? grocerySection(item.text) ?? OTHER_SECTION) : item.section,
    updatedAt: now,
  };
}

/** The first line, which stands in for a title. */
export function title(item: Pick<Item, "text">): string {
  return item.text.split("\n", 1)[0]!.trim();
}

/** Dated to-dos first by date, then by priority, then oldest first. */
export function compareTodos(a: Item, b: Item): number {
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return b.priority - a.priority || a.createdAt - b.createdAt;
}

/** Pinned notes first, then most recently edited. */
export function compareNotes(a: Item, b: Item): number {
  return Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
}

export interface ShoppingView {
  /** Entries still to buy, by store section in walking order. */
  sections: { section: string; items: Item[] }[];
  /** Bought staples, ready to restock. */
  stocked: Item[];
}

export function shoppingView(items: Item[]): ShoppingView {
  const bySection = new Map<string, Item[]>();
  const stocked: Item[] = [];
  for (const item of items) {
    if (isStocked(item)) stocked.push(item);
    else if (isOpen(item)) {
      const section = item.section ?? OTHER_SECTION;
      bySection.set(section, [...(bySection.get(section) ?? []), item]);
    }
  }
  const rank = (section: string) => {
    const index = SECTION_ORDER.indexOf(section);
    return index === -1 ? SECTION_ORDER.length : index;
  };
  const byName = (a: Item, b: Item) => a.text.localeCompare(b.text);
  return {
    sections: [...bySection.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([section, list]) => ({ section, items: list.sort((a, b) => a.createdAt - b.createdAt) })),
    stocked: stocked.sort(byName),
  };
}

/** Tags in use, most used first. */
export function tagCounts(items: Item[]): [tag: string, count: number][] {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Turns "home, urgent #later" into clean tags. */
export function parseTags(text: string): string[] {
  const tags = text
    .toLowerCase()
    .split(/[\s,#]+/)
    .filter(Boolean);
  return [...new Set(tags)];
}

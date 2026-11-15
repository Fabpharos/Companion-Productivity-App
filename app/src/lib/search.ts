// One search across every item, active and archived.

import { isArchived, title } from "./items.ts";
import type { Item, List } from "./model.ts";

export interface Hit {
  item: Item;
  list: List | undefined;
  archived: boolean;
}

const LIMIT = 60;

/**
 * Every word of the query must appear somewhere in the item: its text, steps,
 * tags or list name. A word starting with # matches tags only. Active items
 * come before archived ones, and matches at the start of the title come first.
 */
export function search(items: Item[], lists: List[], query: string): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const listById = new Map(lists.map((list) => [list.id, list]));

  const scored: { hit: Hit; score: number }[] = [];
  for (const item of items) {
    const list = listById.get(item.listId);
    const head = title(item).toLowerCase();
    const body = [item.text, ...item.subtasks.map((step) => step.text), list?.name ?? ""].join("\n").toLowerCase();
    let score = 0;
    const matched = terms.every((term) => {
      if (term.length > 1 && term.startsWith("#")) {
        return item.tags.some((tag) => tag.startsWith(term.slice(1)));
      }
      if (head.startsWith(term)) score += 3;
      else if (head.includes(term)) score += 2;
      else if (body.includes(term) || item.tags.some((tag) => tag.includes(term))) score += 1;
      else return false;
      return true;
    });
    if (matched) scored.push({ hit: { item, list, archived: isArchived(item) }, score });
  }

  return scored
    .sort(
      (a, b) =>
        Number(a.hit.archived) - Number(b.hit.archived) || b.score - a.score || b.hit.item.updatedAt - a.hit.item.updatedAt,
    )
    .slice(0, LIMIT)
    .map(({ hit }) => hit);
}

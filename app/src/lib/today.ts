// What the Today tab shows, worked out from the items and the date.

import { addDays, daysBetween } from "./dates.ts";
import { compareNotes, compareTodos, isOpen } from "./items.ts";
import { INBOX, type Item } from "./model.ts";

export const FOCUS_SLOTS = 3;
const UPCOMING_DAYS = 7;

export interface TodayView {
  /** Today's three, done ones included so finishing them shows. */
  focus: Item[];
  overdue: Item[];
  dueToday: Item[];
  upcoming: Item[];
  pinned: Item[];
  inboxCount: number;
}

export function todayView(items: Item[], today: string): TodayView {
  const view: TodayView = { focus: [], overdue: [], dueToday: [], upcoming: [], pinned: [], inboxCount: 0 };
  const horizon = addDays(today, UPCOMING_DAYS);
  for (const item of items) {
    if (item.focusOn === today && item.kind === "todo") {
      view.focus.push(item);
      continue;
    }
    if (!isOpen(item)) continue;
    if (item.listId === INBOX) view.inboxCount++;
    if (item.kind === "note" && item.pinned) view.pinned.push(item);
    if (item.kind !== "todo" || item.due === null) continue;
    if (item.due < today) view.overdue.push(item);
    else if (item.due === today) view.dueToday.push(item);
    else if (item.due <= horizon) view.upcoming.push(item);
  }
  view.focus.sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || compareTodos(a, b));
  view.overdue.sort(compareTodos);
  view.dueToday.sort(compareTodos);
  view.upcoming.sort(compareTodos);
  view.pinned.sort(compareNotes);
  return view;
}

/** How strongly a to-do asks to be done today. */
function urgency(item: Item, today: string): number {
  let score = item.priority * 100;
  if (item.due !== null) {
    const days = daysBetween(today, item.due);
    if (days < 0) score += 1000 + Math.min(-days, 365);
    else if (days === 0) score += 900;
    else if (days <= 3) score += 300 - days * 50;
  }
  return score;
}

/**
 * Picks to-dos to fill the empty slots of Today's three: overdue first, then
 * due today, then high priority and due soon, then whatever has waited longest.
 */
export function suggestFocus(items: Item[], today: string): Item[] {
  const taken = items.filter((item) => item.focusOn === today && item.kind === "todo").length;
  return items
    .filter((item) => item.kind === "todo" && isOpen(item) && item.focusOn !== today)
    .sort((a, b) => urgency(b, today) - urgency(a, today) || a.createdAt - b.createdAt)
    .slice(0, Math.max(0, FOCUS_SLOTS - taken));
}

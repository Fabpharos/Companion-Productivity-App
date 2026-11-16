// What the activity log says about recent weeks, for the Companion tab and
// for the things the companion remembers.

import { daysSince, dueness } from "./chores.ts";
import { addDays, daysBetween, localDate, weekStart } from "./dates.ts";
import type { Activity, Chore } from "./model.ts";

const DAY = 86_400_000;

/** A whole to-do, shopping entry or chore finished. Steps and rewards are not counted. */
const isCompletion = (entry: Activity) => entry.type === "done" || entry.type === "chore";

export interface WeekCount {
  /** The week's Monday. */
  week: string;
  count: number;
}

/** Completions in each of the last `weeks` weeks, oldest first, ending with this week. */
export function weeklyCounts(activity: Activity[], today: string, weeks = 8): WeekCount[] {
  const thisWeek = weekStart(today);
  const counts = new Map<string, number>();
  for (const entry of activity) {
    if (!isCompletion(entry)) continue;
    const week = weekStart(localDate(entry.at));
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return Array.from({ length: weeks }, (_, index) => {
    const week = addDays(thisWeek, (index - weeks + 1) * 7);
    return { week, count: counts.get(week) ?? 0 };
  });
}

/** This week's count when it has passed last week's, else null. Only an upward trend is ever remarked on. */
export function trendUp(counts: WeekCount[]): number | null {
  const now = counts.at(-1)?.count ?? 0;
  const before = counts.at(-2)?.count ?? 0;
  return now >= 3 && now > before ? now : null;
}

export interface Waiting {
  chore: Chore;
  days: number;
}

/** The chores that have gone longest past their interval, for a plain list with no judgment attached. */
export function waitingLongest(chores: Chore[], now: number, limit = 3): Waiting[] {
  return chores
    .filter((chore) => dueness(chore, now) > 1)
    .sort((a, b) => dueness(b, now) - dueness(a, now) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((chore) => ({ chore, days: daysSince(chore, now) ?? 0 }));
}

export interface Win {
  name: string;
  /** Days ago. */
  days: number;
}

/**
 * Something worth remembering: the completion that earned the most in the
 * last month, today's left out since it is not a memory yet. Null when there
 * is none.
 */
export function recentWin(activity: Activity[], now: number): Win | null {
  const today = localDate(now);
  const best = activity
    .filter((entry) => isCompletion(entry) && entry.at > now - 30 * DAY && localDate(entry.at) < today && entry.text.trim())
    .sort((a, b) => b.points - a.points || b.at - a.at)[0];
  return best ? { name: best.text, days: daysBetween(localDate(best.at), today) } : null;
}

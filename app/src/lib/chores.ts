// Rules for chores. A chore has no due date: it is tracked by how long it has
// been since it was last done, measured against how often it should be.

import { daysBetween, localDate } from "./dates.ts";
import { newId, type Chore } from "./model.ts";

export const DEFAULT_EVERY_DAYS = 7;

export function makeChore(fields: Partial<Chore> & Pick<Chore, "name">, now: number): Chore {
  return { id: newId(), everyDays: DEFAULT_EVERY_DAYS, lastDoneAt: null, createdAt: now, effort: 2, dislike: 0, steps: [], ...fields };
}

/** Whole days since the chore was last done, or null if it never has been. */
export function daysSince(chore: Chore, now: number): number | null {
  return chore.lastDoneAt === null ? null : Math.max(0, daysBetween(localDate(chore.lastDoneAt), localDate(now)));
}

/**
 * How due a chore is: 0 just done, 1 exactly due, 2 a whole interval overdue.
 * A chore that has never been done counts as exactly due.
 */
export function dueness(chore: Chore, now: number): number {
  const days = daysSince(chore, now);
  return days === null ? 1 : days / Math.max(1, chore.everyDays);
}

export function isOverdue(chore: Chore, now: number): boolean {
  return dueness(chore, now) > 1;
}

/** The hue for a chore's colour: green when fresh, yellow when due, red from three-quarters of an interval overdue. */
export function hue(chore: Chore, now: number): number {
  return Math.round(140 * (1 - Math.min(1, dueness(chore, now) / 1.75)));
}

export function describeSince(chore: Chore, now: number): string {
  const days = daysSince(chore, now);
  if (days === null) return "Not done yet";
  if (days === 0) return "Done today";
  if (days === 1) return "Done yesterday";
  return `${days} days ago`;
}

export function describeEvery(days: number): string {
  if (days === 1) return "Daily";
  if (days === 7) return "Weekly";
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  if (days === 30) return "Monthly";
  return `Every ${days} days`;
}

/** Most due first. */
export function compareChores(now: number): (a: Chore, b: Chore) => number {
  return (a, b) => dueness(b, now) - dueness(a, now) || a.name.localeCompare(b.name);
}

/** The chores to show: all of them, or only the easy ones in low-energy mode. */
export function visibleChores(chores: Chore[], lowEnergy: boolean, now: number): Chore[] {
  return chores.filter((chore) => !lowEnergy || chore.effort === 1).sort(compareChores(now));
}

/**
 * Picks one chore at random, favouring the most overdue: a chore twice as due
 * is four times as likely. `random` is a number from 0 up to 1.
 */
export function spin(chores: Chore[], now: number, random: number): Chore | null {
  const weights = chores.map((chore) => Math.max(0.2, dueness(chore, now)) ** 2);
  let at = random * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, chore] of chores.entries()) {
    at -= weights[index]!;
    if (at < 0) return chore;
  }
  return chores.at(-1) ?? null;
}

const EVERY = /\s+(?:(daily|weekly|monthly)|every\s+(?:(\d+)\s+)?(day|week|month)s?)$/i;
const UNIT_DAYS = { day: 1, daily: 1, week: 7, weekly: 7, month: 30, monthly: 30 };

/** Reads a typed chore such as "Vacuum weekly" or "Change sheets every 2 weeks". */
export function parseChore(raw: string): { name: string; everyDays: number } | null {
  const text = raw.trim();
  const match = EVERY.exec(text);
  const name = (match ? text.slice(0, match.index) : text).trim();
  if (!name) return null;
  if (!match) return { name, everyDays: DEFAULT_EVERY_DAYS };
  const unit = (match[1] ?? match[3]!).toLowerCase() as keyof typeof UNIT_DAYS;
  return { name, everyDays: Math.max(1, Number(match[2] ?? 1)) * UNIT_DAYS[unit] };
}

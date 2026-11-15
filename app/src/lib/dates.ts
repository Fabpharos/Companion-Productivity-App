// Calendar dates are strings, YYYY-MM-DD, in the phone's local time. Strings
// compare correctly with < and >, and never shift across time zones.

import type { Repeat } from "./model.ts";

export function localDate(at: Date | number = new Date()): string {
  const d = typeof at === "number" ? new Date(at) : at;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m!, d!];
}

function toDate(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(y, m - 1, d);
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(toDate(value)) === value;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return localDate(new Date(y, m - 1, d + days));
}

/** Adds months, keeping the day where the month has it and using the last day where it doesn't. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return localDate(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** The Monday of the week a date falls in. Weeks run Monday to Sunday. */
export function weekStart(date: string): string {
  return addDays(date, -((toDate(date).getDay() + 6) % 7));
}

function step(date: string, repeat: Repeat, times: number): string {
  const n = Math.max(1, Math.floor(repeat.every)) * times;
  switch (repeat.unit) {
    case "day":
      return addDays(date, n);
    case "week":
      return addDays(date, n * 7);
    case "month":
      return addMonths(date, n);
    case "year":
      return addMonths(date, n * 12);
  }
}

/**
 * The next due date of a repeating to-do completed on `today`: the first date
 * on its schedule that is after today. A to-do finished late skips the
 * occurrences it missed, so they never pile up.
 */
export function nextDue(due: string | null, repeat: Repeat, today: string): string {
  const base = due ?? today;
  // Stepping from the original date each time keeps "the 31st" from drifting to the 28th.
  for (let times = 1; ; times++) {
    const next = step(base, repeat, times);
    if (next > today) return next;
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayName(date: string): string {
  return WEEKDAYS[toDate(date).getDay()]!;
}

/** "Sat, Nov 14", with the year when it is not this year. */
export function formatDate(date: string, today: string): string {
  const [y, m, d] = parts(date);
  const text = `${weekdayName(date).slice(0, 3)}, ${MONTHS[m - 1]} ${d}`;
  return y === parts(today)[0] ? text : `${text}, ${y}`;
}

/** A short label for a due date relative to today. */
export function describeDue(due: string, today: string): string {
  const days = daysBetween(today, due);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < -1) return `${-days} days ago`;
  if (days < 7) return weekdayName(due);
  return formatDate(due, today);
}

export function describeRepeat(repeat: Repeat): string {
  const { every, unit } = repeat;
  if (every === 1) return unit === "day" ? "Daily" : `${unit[0]!.toUpperCase()}${unit.slice(1)}ly`;
  return `Every ${every} ${unit}s`;
}

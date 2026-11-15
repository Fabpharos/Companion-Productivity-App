// Which notifications are coming, and what they say.
//
// The phone cannot send itself a notification later, so it works out the next
// two weeks of them and hands the whole list to the Worker. The list is built
// as if nothing more gets done. That is exactly right for as long as the app
// stays closed, because the data only changes when it is open, and every
// change makes a new list that replaces the old one.

import type { DialogueStyle, LineEvent } from "../../content/dialogue.ts";
import { BACKUP_EVERY_DAYS } from "./backup.ts";
import { dueness } from "./chores.ts";
import { outfitFor, say, type Vars } from "./companion.ts";
import { addDays, atLocal, localDate } from "./dates.ts";
import { streakFor } from "./game.ts";
import { isOpen, title } from "./items.ts";
import type { Activity, Chore, Item, NotifyKind, NotifySettings, Settings, Trip, TripEntry } from "./model.ts";
import { compareStops, countdown, COUNTDOWN_MILESTONES, currentTrip, tasksView, travellingOn } from "./trips.ts";

export interface Planned {
  /** The same notification keeps the same id from one list to the next. */
  id: string;
  kind: NotifyKind;
  at: number;
  title: string;
  body: string;
  /** Where the app opens when it is tapped, as a place in the app such as "#/item/abc". */
  open: string;
  /** The number for the app icon when it arrives: to-dos due by that day. */
  badge: number;
}

export interface PlanInput {
  items: Item[];
  chores: Chore[];
  activity: Activity[];
  trips: Trip[];
  tripEntries: TripEntry[];
  settings: Settings;
}

/** Whose words the notifications use. */
export interface Voice {
  style: DialogueStyle;
  bond: number;
}

export const HORIZON_DAYS = 14;
const MAX_PLANNED = 200;
/** When chore nudges, trip tasks and the backup reminder arrive. The morning and evening times are settings. */
const CHORES_AT = "17:00";
const TRIP_TASKS_AT = "12:30";
const BACKUP_AT = "11:00";
const DAY = 86_400_000;
/**
 * A notification stays in the list for a while after its time. The Worker
 * checks once a minute, so one that has just come due may not have gone out
 * yet, and a list without it would cancel it. The Worker never sends one twice.
 */
const KEEP_AFTER_DUE = 3 * 60_000;

/** Kinds held back by the daily cap. A reminder that was asked for and the morning summary always arrive. */
const NUDGES: readonly NotifyKind[] = ["chore", "streak", "trip", "backup"];

export const PRIVATE_TITLE = "Companion";
export const PRIVATE_BODY = "You have a reminder.";

/** A number from 0 up to 1 that is always the same for the same text, so a notification keeps its wording between lists. */
function seeded(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  // A final stir, so texts that differ only in their last character still land far apart.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
}

/** "a", "a and b", "a, b and 2 more". */
function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A time moved out of the quiet hours to the moment they end. Times outside them are unchanged. */
export function afterQuiet(at: number, quietFrom: string, quietTo: string): number {
  const from = minutesOf(quietFrom);
  const to = minutesOf(quietTo);
  if (from === to) return at;
  const date = new Date(at);
  const minute = date.getHours() * 60 + date.getMinutes();
  const quiet = from < to ? minute >= from && minute < to : minute >= from || minute < to;
  if (!quiet) return at;
  // Quiet hours that run past midnight end on the next day for a time before midnight.
  const day = from > to && minute >= from ? addDays(localDate(at), 1) : localDate(at);
  return atLocal(day, quietTo);
}

/** The number for the app icon: open to-dos due on or before a day. */
export function badgeCount(items: Item[], day: string): number {
  return items.filter((item) => item.kind === "todo" && isOpen(item) && item.due !== null && item.due <= day).length;
}

/** What the morning summary says about a day, or null when there is nothing to say. */
function morningBody(input: PlanInput, day: string, today: string): string | null {
  const { items, chores, trips, tripEntries } = input;
  const travelling = travellingOn(trips, day);
  if (travelling) {
    const stops = tripEntries.filter((entry) => entry.tripId === travelling.id && entry.kind === "stop" && entry.day === day).sort(compareStops);
    const first = stops[0];
    const parts = [`${travelling.name}, ${countdown(travelling, day).text}.`];
    if (first) parts.push(`First: ${first.time ? `${first.time} ` : ""}${first.text}.`);
    if (stops.length > 1) parts.push(`${stops.length} stops today.`);
    return parts.join(" ");
  }

  const todos = items.filter((item) => item.kind === "todo" && isOpen(item));
  const parts: string[] = [];
  const focus = day === today ? todos.filter((item) => item.focusOn === today) : [];
  if (focus.length) parts.push(`Today: ${focus.map(title).join(", ")}.`);
  const due = todos.filter((item) => item.due === day).length;
  if (due) parts.push(`${due} due today.`);
  const earlier = todos.filter((item) => item.due !== null && item.due < day).length;
  if (earlier) parts.push(`${earlier} still open from earlier.`);
  const ready = chores.filter((chore) => dueness(chore, atLocal(day, "12:00")) >= 1).length;
  if (ready) parts.push(`${ready} ${ready === 1 ? "chore" : "chores"} ready.`);
  const trip = currentTrip(trips, day);
  if (trip) parts.push(`${trip.name} ${countdown(trip, day).text}.`);
  return parts.length ? parts.join(" ") : null;
}

/**
 * The evening on which a streak is worth a reminder: the first day with
 * nothing done yet, and only if leaving it empty would shorten the streak.
 * A day the week's grace still covers gets no reminder.
 */
function streakDay(activity: Activity[], today: string): { day: string; days: number } | null {
  const active = new Set(activity.filter((entry) => entry.type !== "reward").map((entry) => localDate(entry.at)));
  const day = active.has(today) ? addDays(today, 1) : today;
  const days = streakFor(active, day).days;
  if (days < 2 || streakFor(active, addDays(day, 1)).days >= days) return null;
  return { day, days };
}

/**
 * Every notification from now (and the last few minutes) until two weeks out, soonest first, already
 * moved out of quiet hours, held to the daily cap, and worded in the
 * companion's voice (or not worded at all, with private text on).
 */
export function plan(input: PlanInput, now: number, voice: Voice): Planned[] {
  const { items, chores, trips, tripEntries, settings } = input;
  const notify: NotifySettings = settings.notify;
  const today = localDate(now);
  const days = Array.from({ length: HORIZON_DAYS }, (_, index) => addDays(today, index));
  const inRange = (day: string) => day >= today && day <= days.at(-1)!;
  const line = (id: string, event: LineEvent, vars: Vars = {}, outfit = "") => say(voice.style, event, vars, voice.bond, seeded(id), outfit).text;

  const planned: Omit<Planned, "badge">[] = [];
  const add = (kind: NotifyKind, id: string, at: number, heading: string, body: string, open: string) => {
    if (notify.kinds[kind]) planned.push({ id, kind, at, title: heading, body, open });
  };

  // Task reminders: a to-do with a due date and a time.
  for (const item of items) {
    if (item.kind !== "todo" || !isOpen(item) || !item.due || !item.time || !inRange(item.due)) continue;
    const id = `task:${item.id}:${item.due}`;
    add("task", id, atLocal(item.due, item.time), title(item), line(id, "pushTask"), `#/item/${item.id}`);
  }

  for (const day of days) {
    // Morning summary.
    const body = morningBody(input, day, today);
    if (body) add("morning", `morning:${day}`, atLocal(day, notify.morningAt), line(`morning:${day}`, "pushMorning"), body, "#/today");

    // Chores, on the day each one goes past due. Not while travelling, and only easy ones in low-energy mode.
    if (!travellingOn(trips, day)) {
      const crossing = chores
        .filter((chore) => chore.lastDoneAt !== null && addDays(localDate(chore.lastDoneAt), chore.everyDays + 1) === day)
        .filter((chore) => !settings.lowEnergy || chore.effort === 1)
        .sort((a, b) => a.name.localeCompare(b.name));
      const id = `chores:${day}`;
      const [first] = crossing;
      if (crossing.length === 1 && first) add("chore", id, atLocal(day, CHORES_AT), first.name, line(id, "pushChore"), "#/chores");
      else if (crossing.length > 1) {
        add("chore", id, atLocal(day, CHORES_AT), "Chores", line(id, "pushChores", { task: listNames(crossing.map((chore) => chore.name)) }), "#/chores");
      }
    }
  }

  // Streak saver.
  const streak = streakDay(input.activity, today);
  if (streak) {
    const id = `streak:${streak.day}`;
    add("streak", id, atLocal(streak.day, notify.eveningAt), `${streak.days} days running`, line(id, "pushStreak", { n: streak.days }), "#/today");
  }

  // Trips: countdown marks, and tasks before leaving on the day they are due.
  for (const trip of trips) {
    if (trip.start <= today) continue;
    // With the morning summary on, the countdown is already in it.
    if (!notify.kinds.morning) {
      for (const n of COUNTDOWN_MILESTONES) {
        const day = addDays(trip.start, -n);
        if (!inRange(day)) continue;
        const id = `trip:${trip.id}:${n}`;
        const body = line(id, n === 1 ? "tripTomorrow" : "tripCountdown", { name: trip.name, n }, outfitFor(trip, day));
        add("trip", id, atLocal(day, notify.morningAt), trip.name, body, `#/trips/${trip.id}`);
      }
    }
    const byDay = new Map<string, string[]>();
    for (const row of tasksView(trip, tripEntries, today)) {
      if (row.entry.done || !inRange(row.due)) continue;
      byDay.set(row.due, [...(byDay.get(row.due) ?? []), row.entry.text]);
    }
    for (const [day, names] of byDay) {
      const id = `triptasks:${trip.id}:${day}`;
      add("trip", id, atLocal(day, TRIP_TASKS_AT), trip.name, line(id, "pushTripTask", { task: listNames(names) }), `#/trips/${trip.id}/tasks`);
    }
  }

  // Backup reminder: once, when two weeks have passed since the last backup.
  if (items.length) {
    const since = settings.lastBackupAt ?? Math.min(...items.map((item) => item.createdAt));
    const due = Math.max(since + BACKUP_EVERY_DAYS * DAY, settings.backupSnoozedUntil ?? 0);
    let at = atLocal(localDate(due), BACKUP_AT);
    if (at < due) at = atLocal(addDays(localDate(due), 1), BACKUP_AT);
    add("backup", `backup:${localDate(at)}`, at, "Backup", line(`backup:${localDate(at)}`, "pushBackup"), "#/settings");
  }

  const horizon = now + HORIZON_DAYS * DAY;
  const perDay = new Map<string, number>();
  return planned
    .map((entry) => ({ ...entry, at: afterQuiet(entry.at, notify.quietFrom, notify.quietTo) }))
    .filter((entry) => entry.at > now - KEEP_AFTER_DUE && entry.at <= horizon)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    .filter((entry) => {
      if (!NUDGES.includes(entry.kind)) return true;
      const day = localDate(entry.at);
      const count = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, count);
      return count <= notify.dailyCap;
    })
    .slice(0, MAX_PLANNED)
    .map((entry) => ({
      ...entry,
      ...(notify.privateText ? { title: PRIVATE_TITLE, body: PRIVATE_BODY } : {}),
      badge: badgeCount(items, localDate(entry.at)),
    }));
}

/** One entry of the list the Worker is given. */
export interface Reminder {
  id: string;
  at: number;
  title: string;
  body: string;
  url: string;
  badge: number;
}

/** The plan in the shape the Worker stores: nothing but a time, the text to show, and where to open. */
export function toReminders(planned: Planned[]): Reminder[] {
  return planned.map(({ id, at, title: heading, body, open, badge }) => ({ id, at, title: heading, body, url: `./${open}`, badge }));
}

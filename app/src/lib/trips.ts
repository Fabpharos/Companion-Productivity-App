// Rules for trips: countdowns, what a template fills in, and how each
// section of a trip is grouped and added up.

import type { TripTemplate } from "../../content/trips.ts";
import { addDays, daysBetween } from "./dates.ts";
import { newId, type Trip, type TripEntry, type TripEntryKind } from "./model.ts";

export function makeTrip(fields: Partial<Trip> & Pick<Trip, "name" | "start" | "end">, now: number): Trip {
  return {
    id: newId(),
    destination: "",
    homeCurrency: "USD",
    localCurrency: "",
    rate: null,
    rateAt: null,
    budget: null,
    outfit: "",
    createdAt: now,
    ...fields,
    // A trip cannot end before it starts.
    end: fields.end < fields.start ? fields.start : fields.end,
  };
}

export function makeEntry(tripId: string, kind: TripEntryKind, text: string, fields: Partial<TripEntry>, now: number): TripEntry {
  return {
    id: newId(),
    tripId,
    kind,
    text,
    done: false,
    createdAt: now,
    category: null,
    daysBefore: null,
    day: null,
    time: null,
    place: null,
    note: "",
    amount: null,
    reading: null,
    meaning: null,
    forWhom: null,
    ...fields,
  };
}

/** The entries a new trip starts with: the template's packing list, tasks and phrase cards. */
export function fromTemplate(template: TripTemplate, tripId: string, now: number): TripEntry[] {
  let order = 0;
  // Each entry is a millisecond after the last, so lists keep the template's order.
  const make = (kind: TripEntryKind, text: string, fields: Partial<TripEntry>) => makeEntry(tripId, kind, text, fields, now + order++);
  return [
    ...Object.entries(template.packing).flatMap(([category, items]) => items.map((text) => make("packing", text, { category }))),
    ...template.tasks.map(([text, daysBefore]) => make("task", text, { daysBefore })),
    ...Object.entries(template.phrases).flatMap(([category, phrases]) =>
      phrases.map(([text, reading, meaning]) => make("phrase", text, { category, reading, meaning })),
    ),
  ];
}

// ---------- Dates ----------

export function tripDays(trip: Trip): string[] {
  const length = Math.max(1, daysBetween(trip.start, trip.end) + 1);
  return Array.from({ length }, (_, index) => addDays(trip.start, index));
}

export type TripPhase = "upcoming" | "underway" | "over";

export interface Countdown {
  phase: TripPhase;
  /** Days until the trip starts. Zero or negative once it has. */
  days: number;
  /** A short phrase: "in 103 days", "tomorrow", "day 3 of 11", "ended". */
  text: string;
}

export function countdown(trip: Trip, today: string): Countdown {
  const days = daysBetween(today, trip.start);
  if (today > trip.end) return { phase: "over", days, text: "ended" };
  if (days > 0) return { phase: "upcoming", days, text: days === 1 ? "tomorrow" : `in ${days} days` };
  return { phase: "underway", days, text: `day ${1 - days} of ${tripDays(trip).length}` };
}

/** The trip that matters now: the one under way, else the next to start. */
export function currentTrip(trips: Trip[], today: string): Trip | null {
  const live = trips.filter((trip) => today <= trip.end).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return live.find((trip) => trip.start <= today) ?? live[0] ?? null;
}

/** The trip under way today, if there is one. While travelling, Today leads with the itinerary and chores are left unmentioned. */
export function travellingOn(trips: Trip[], today: string): Trip | null {
  return trips.find((trip) => trip.start <= today && today <= trip.end) ?? null;
}

/** Days-to-go worth announcing. */
export const COUNTDOWN_MILESTONES = [100, 60, 30, 14, 7, 3, 2, 1];

// ---------- Before I leave ----------

export interface TaskRow {
  entry: TripEntry;
  due: string;
  late: boolean;
}

export function taskDue(trip: Trip, entry: TripEntry): string {
  return addDays(trip.start, -(entry.daysBefore ?? 0));
}

/** A trip's tasks, soonest first, with done ones last. */
export function tasksView(trip: Trip, entries: TripEntry[], today: string): TaskRow[] {
  return entries
    .filter((entry) => entry.tripId === trip.id && entry.kind === "task")
    .map((entry) => ({ entry, due: taskDue(trip, entry), late: !entry.done && taskDue(trip, entry) < today }))
    .sort((a, b) => Number(a.entry.done) - Number(b.entry.done) || (a.due < b.due ? -1 : a.due > b.due ? 1 : a.entry.createdAt - b.entry.createdAt));
}

/** Open tasks across upcoming trips that are due within `within` days or already late, soonest first. */
export function tasksComingDue(trips: Trip[], entries: TripEntry[], today: string, within = 7): (TaskRow & { trip: Trip })[] {
  const horizon = addDays(today, within);
  return trips
    .filter((trip) => today <= trip.start)
    .flatMap((trip) => tasksView(trip, entries, today).map((row) => ({ ...row, trip })))
    .filter((row) => !row.entry.done && row.due <= horizon)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

// ---------- Lists ----------

export interface Group {
  name: string;
  entries: TripEntry[];
}

const byCreated = (a: TripEntry, b: TripEntry) => a.createdAt - b.createdAt;

/** A trip's entries of one kind grouped by category, in the order the categories first appear. */
export function byCategory(entries: TripEntry[], tripId: string, kind: TripEntryKind, fallback = "Other"): Group[] {
  const groups = new Map<string, TripEntry[]>();
  for (const entry of entries.filter((e) => e.tripId === tripId && e.kind === kind).sort(byCreated)) {
    const name = entry.category?.trim() || fallback;
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  return [...groups.entries()].map(([name, list]) => ({ name, entries: list }));
}

export function ofKind(entries: TripEntry[], tripId: string, kind: TripEntryKind): TripEntry[] {
  return entries.filter((entry) => entry.tripId === tripId && entry.kind === kind).sort(byCreated);
}

// ---------- Itinerary ----------

export interface ItineraryDay {
  day: string;
  /** 1 for the first day of the trip. Null for a day outside the trip's dates. */
  number: number | null;
  stops: TripEntry[];
}

/** Timed stops in order, then untimed ones in the order they were added. */
export function compareStops(a: TripEntry, b: TripEntry): number {
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

/**
 * Every day of the trip with its stops. A stop dated outside the trip (after
 * the trip's dates were changed, say) keeps its own day, so nothing vanishes.
 */
export function itinerary(trip: Trip, entries: TripEntry[]): ItineraryDay[] {
  const stops = entries.filter((entry) => entry.tripId === trip.id && entry.kind === "stop" && entry.day !== null);
  const inTrip = tripDays(trip);
  const stray = [...new Set(stops.map((stop) => stop.day!))].filter((day) => !inTrip.includes(day)).sort();
  return [...inTrip, ...stray]
    .sort()
    .map((day) => ({
      day,
      number: inTrip.includes(day) ? inTrip.indexOf(day) + 1 : null,
      stops: stops.filter((stop) => stop.day === day).sort(compareStops),
    }));
}

/**
 * The trip with a new start date, and its stops moved by the same number of
 * days, so what was planned for day 2 is still on day 2. The trip keeps its
 * length. Expenses and journal entries are records of real days and stay put.
 */
export function moveTrip(trip: Trip, entries: TripEntry[], start: string): { trip: Trip; stops: TripEntry[] } {
  const shift = daysBetween(trip.start, start);
  return {
    trip: { ...trip, start, end: addDays(trip.end, shift) },
    stops: entries
      .filter((entry) => entry.tripId === trip.id && entry.kind === "stop" && entry.day !== null)
      .map((entry) => ({ ...entry, day: addDays(entry.day!, shift) })),
  };
}

/** A link that opens a stop in a maps app. A place that is already a link is used as it is. */
export function mapLink(entry: Pick<TripEntry, "text" | "place">): string {
  const place = entry.place?.trim();
  if (place && /^https?:\/\//i.test(place)) return place;
  return `https://maps.apple.com/?q=${encodeURIComponent(place || entry.text)}`;
}

// ---------- Money ----------

export interface Spending {
  /** Total spent, in the local currency. */
  local: number;
  /** The same in home currency, or null without an exchange rate. */
  home: number | null;
  /** What is left of the budget in home currency, or null without a budget or a rate. */
  left: number | null;
}

export function toHome(local: number, rate: number | null): number | null {
  return rate ? local / rate : null;
}

export function toLocal(home: number, rate: number | null): number | null {
  return rate ? home * rate : null;
}

export function spending(trip: Trip, entries: TripEntry[]): Spending {
  const local = ofKind(entries, trip.id, "expense").reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  // Without a local currency everything is entered in home currency already.
  const home = trip.localCurrency && trip.localCurrency !== trip.homeCurrency ? toHome(local, trip.rate) : local;
  return { local, home, left: trip.budget !== null && home !== null ? trip.budget - home : null };
}

/** Reads a typed amount such as "1,200" or "12.50". Null when it is not a positive number. */
export function parseAmount(text: string): number | null {
  const value = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : undefined }).format(amount);
  } catch {
    // Not a currency code the phone knows.
    return `${Math.round(amount * 100) / 100} ${currency}`.trim();
  }
}

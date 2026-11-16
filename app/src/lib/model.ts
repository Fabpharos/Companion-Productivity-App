// The records the app stores. Everything here is plain data: it goes into
// IndexedDB and into the backup file unchanged.

import type { Framing } from "./portrait.ts";

export type ItemKind = "note" | "todo" | "shopping";
export type ListKind = ItemKind | "inbox";
export type Priority = 0 | 1 | 2 | 3;
export type RepeatUnit = "day" | "week" | "month" | "year";

export interface Repeat {
  every: number;
  unit: RepeatUnit;
}

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

/** A note, to-do or shopping entry. One shape for all three keeps moving an item between kinds lossless. */
export interface Item {
  id: string;
  kind: ItemKind;
  listId: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Set when a to-do is completed or a shopping entry is bought. */
  doneAt: number | null;
  pinned: boolean;
  /** Local calendar date, YYYY-MM-DD. */
  due: string | null;
  /** Time of day on the due date to be reminded, HH:MM. Only means something with a due date. */
  time: string | null;
  repeat: Repeat | null;
  priority: Priority;
  subtasks: Subtask[];
  /** The date this item was chosen as one of Today's three. */
  focusOn: string | null;
  /** Store section, shopping entries only. */
  section: string | null;
  /** A staple stays on the shopping list when bought and can be restocked. */
  staple: boolean;
  tripId: string | null;
}

export interface List {
  id: string;
  name: string;
  kind: ListKind;
  builtin: boolean;
  order: number;
  createdAt: number;
}

/** A recurring household job, tracked by how long it has been since it was last done. */
export interface Chore {
  id: string;
  name: string;
  /** How often it should be done. */
  everyDays: number;
  lastDoneAt: number | null;
  createdAt: number;
  /** 1 easy, 2 medium, 3 hard. Sets the base points. */
  effort: 1 | 2 | 3;
  /** 0 fine, 1 disliked, 2 hated. Disliked chores earn a bonus. */
  dislike: 0 | 1 | 2;
  /** Small steps. Their done marks clear each time the chore is completed. */
  steps: Subtask[];
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  /** First and last day, as local calendar dates. */
  start: string;
  end: string;
  /** Three-letter currency codes: what you think in, and what is spent there. */
  homeCurrency: string;
  localCurrency: string;
  /** How much local currency one unit of home currency buys, and when that was fetched or typed. */
  rate: number | null;
  rateAt: number | null;
  /** The budget for the trip, in home currency. */
  budget: number | null;
  /** What the companion wears for this trip, as a tag such as "kimono". */
  outfit: string;
  createdAt: number;
}

export type TripEntryKind = "packing" | "task" | "stop" | "wish" | "expense" | "phrase" | "souvenir" | "journal";

/**
 * One thing belonging to a trip. One shape for every kind, so a wish can
 * become an itinerary stop without losing anything. Which fields matter:
 *   packing   text, category, done
 *   task      text, daysBefore, done
 *   stop      text, day, time, place, note
 *   wish      text, place, note
 *   expense   text, amount, day
 *   phrase    text (in the local language), reading, meaning, category (the situation)
 *   souvenir  text, forWhom, done
 *   journal   text, day
 */
export interface TripEntry {
  id: string;
  tripId: string;
  kind: TripEntryKind;
  text: string;
  done: boolean;
  createdAt: number;
  category: string | null;
  /** A task is due this many days before the trip starts. */
  daysBefore: number | null;
  day: string | null;
  /** Time of day, HH:MM. */
  time: string | null;
  /** A place name to look up in a maps app, or a link. */
  place: string | null;
  note: string;
  /** An expense's amount, in the trip's local currency. */
  amount: number | null;
  reading: string | null;
  meaning: string | null;
  forWhom: string | null;
}

/** Something on the wish-list that points can buy. */
export interface Reward {
  id: string;
  name: string;
  price: number;
  createdAt: number;
}

export type QuestKind = "chore" | "item" | "count" | "points" | "chores";

/**
 * A small goal for a day or a week. "chore" and "item" name one thing to do
 * (`ref`); "count", "points" and "chores" are met by reaching `target`.
 */
export interface Quest {
  id: string;
  kind: QuestKind;
  ref: string | null;
  target: number;
  text: string;
  bonus: number;
}

/** The quests of one day ("d:2026-11-14") or one week ("w:2026-11-09", its Monday). */
export interface QuestSet {
  id: string;
  quests: Quest[];
}

export type Theme = "system" | "light" | "dark";

export const NOTIFY_KINDS = ["task", "morning", "chore", "streak", "trip", "backup"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** Which notifications are wanted and when. Times are HH:MM on the phone's clock. */
export interface NotifySettings {
  kinds: Record<NotifyKind, boolean>;
  /** When the morning summary arrives. */
  morningAt: string;
  /** When the streak saver arrives. */
  eveningAt: string;
  /** Nothing arrives between these times: it waits until the quiet hours end. The same time twice means no quiet hours. */
  quietFrom: string;
  quietTo: string;
  /** The most nudges in one day. Task reminders and the morning summary are not nudges. */
  dailyCap: number;
  /** Sends "You have a reminder" in place of any text, so no task wording leaves the phone. */
  privateText: boolean;
}

export interface Settings {
  theme: Theme;
  lastBackupAt: number | null;
  /** The backup reminder stays hidden until this time. */
  backupSnoozedUntil: number | null;
  /** Shows only easy chores and has the companion speak more gently. */
  lowEnergy: boolean;
  notify: NotifySettings;
}

export type ActivityType = "done" | "chore" | "step" | "reward";

/**
 * A dated record of something completed, or of points spent on a reward.
 * The log is the only place points are stored: the balance, level, streak and
 * quest progress are all worked out from it, so undoing a completion takes
 * back everything it earned.
 */
export interface Activity {
  id: string;
  at: number;
  /** "done" is an item, "chore" a whole chore, "step" one step of a chore, "reward" a purchase. */
  type: ActivityType;
  /** The item, chore or reward this is about. */
  itemId: string;
  kind?: ItemKind;
  text: string;
  /** Points earned, or a negative number for points spent. */
  points: number;
}

/** What the companion wears in some situation. Used once NovelAI draws it. */
export interface OutfitRule {
  context: string;
  tags: string;
}

/**
 * Who the companion is. This is what a character card file holds, so it is
 * identity only: bond level and unlocks are progress and live in the log.
 */
export interface CompanionCard {
  name: string;
  description: string;
  personality: string;
  /** Example lines in the character's voice. */
  examples: string;
  /** Which set of pre-written lines it speaks with. */
  styleId: string;
  /** The appearance prompt and default outfit, for NovelAI later. */
  basePrompt: string;
  defaultOutfit: string;
  outfitRules: OutfitRule[];
  /** Where the face is in its pictures, for the close-up. */
  framing: Framing;
  /** Fields of an imported card that this app does not use, kept so the card exports as it came. */
  other: Record<string, unknown>;
}

export type PoseName = "idle" | "happy" | "proud" | "sleepy" | "concerned";

/** One of the companion's own pictures. "idle" is the main one, and stands in for any pose without its own. */
export interface StoredImage {
  id: PoseName;
  /** The picture itself, as a data: address. */
  data: string;
  width: number;
  height: number;
}

/** Everything the app stores, as one value. */
export interface Snapshot {
  items: Item[];
  lists: List[];
  activity: Activity[];
  chores: Chore[];
  rewards: Reward[];
  quests: QuestSet[];
  trips: Trip[];
  tripEntries: TripEntry[];
  settings: Settings;
  companion: CompanionCard;
  images: StoredImage[];
}

export const INBOX = "inbox";
export const TODOS = "todos";
export const SHOPPING = "shopping";
export const NOTES = "notes";

export const BUILTIN_LISTS: List[] = [
  { id: INBOX, name: "Inbox", kind: "inbox", builtin: true, order: 0, createdAt: 0 },
  { id: TODOS, name: "To-dos", kind: "todo", builtin: true, order: 1, createdAt: 0 },
  { id: SHOPPING, name: "Shopping", kind: "shopping", builtin: true, order: 2, createdAt: 0 },
  { id: NOTES, name: "Notes", kind: "note", builtin: true, order: 3, createdAt: 0 },
];

export const DEFAULT_NOTIFY: NotifySettings = {
  kinds: { task: true, morning: true, chore: true, streak: true, trip: true, backup: true },
  morningAt: "08:00",
  eveningAt: "20:00",
  quietFrom: "22:00",
  quietTo: "07:00",
  dailyCap: 3,
  privateText: false,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  lastBackupAt: null,
  backupSnoozedUntil: null,
  lowEnergy: false,
  notify: DEFAULT_NOTIFY,
};

/**
 * Where this phone's notifications are sent from. It is about this phone, not
 * part of the data: it is never written to a backup, and the key is a secret.
 */
export interface Connection {
  /** The Worker's address. */
  url: string;
  /** The Worker's shared secret. */
  key: string;
  /** True once this phone has subscribed and the Worker has the subscription. */
  on: boolean;
}

export const NO_CONNECTION: Connection = { url: "", key: "", on: false };

/** The built-in list an item of this kind goes to when nothing else says where. */
export function homeList(kind: ItemKind): string {
  return kind === "todo" ? TODOS : kind === "shopping" ? SHOPPING : NOTES;
}

export function newId(): string {
  return crypto.randomUUID();
}

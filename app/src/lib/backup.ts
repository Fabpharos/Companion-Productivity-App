// The backup file: everything the app stores, as one JSON document.
//
// Reading a backup trusts nothing in it. Every record is rebuilt field by
// field with defaults for whatever is missing, which is also how a file from
// an older version of the app is brought up to date.

import { isDate, localDate } from "./dates.ts";
import {
  BUILTIN_LISTS,
  DEFAULT_SETTINGS,
  INBOX,
  type Activity,
  type Item,
  type ItemKind,
  type List,
  type ListKind,
  type Priority,
  type Repeat,
  type Settings,
  type Snapshot,
  type Subtask,
} from "./model.ts";

export const APP_ID = "companion-productivity-app";
/** Raise this when the shape of the stored data changes, and teach `readBackup` the old shape. */
export const BACKUP_FORMAT = 1;
export const BACKUP_EVERY_DAYS = 14;

const DAY = 86_400_000;

export class BackupError extends Error {}

export function makeBackup(snapshot: Snapshot, now: number): string {
  return JSON.stringify({ app: APP_ID, format: BACKUP_FORMAT, exportedAt: new Date(now).toISOString(), data: snapshot });
}

export function backupFileName(now: number): string {
  return `companion-backup-${localDate(now)}.json`;
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const ITEM_KINDS: readonly ItemKind[] = ["note", "todo", "shopping"];
const LIST_KINDS: readonly ListKind[] = ["inbox", "note", "todo", "shopping"];

function readRepeat(raw: unknown): Repeat | null {
  if (!isObject(raw)) return null;
  const every = Math.floor(num(raw.every, 0));
  if (every < 1) return null;
  return { every, unit: oneOf(raw.unit, ["day", "week", "month", "year"] as const, "week") };
}

function readSubtask(raw: unknown): Subtask | null {
  if (!isObject(raw) || !str(raw.id) || typeof raw.text !== "string") return null;
  return { id: str(raw.id), text: raw.text, done: raw.done === true };
}

function readItem(raw: unknown, listIds: Set<string>, now: number): Item | null {
  if (!isObject(raw) || !str(raw.id) || typeof raw.text !== "string") return null;
  const createdAt = num(raw.createdAt, now);
  return {
    id: str(raw.id),
    kind: oneOf(raw.kind, ITEM_KINDS, "note"),
    listId: listIds.has(str(raw.listId)) ? str(raw.listId) : INBOX,
    text: raw.text,
    tags: array(raw.tags).filter((tag): tag is string => typeof tag === "string"),
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
    doneAt: numOrNull(raw.doneAt),
    pinned: raw.pinned === true,
    due: isDate(raw.due) ? raw.due : null,
    repeat: readRepeat(raw.repeat),
    priority: Math.min(3, Math.max(0, Math.floor(num(raw.priority, 0)))) as Priority,
    subtasks: array(raw.subtasks).map(readSubtask).filter((step) => step !== null),
    focusOn: isDate(raw.focusOn) ? raw.focusOn : null,
    section: strOrNull(raw.section),
    staple: raw.staple === true,
    tripId: strOrNull(raw.tripId),
  };
}

function readList(raw: unknown, now: number): List | null {
  if (!isObject(raw) || !str(raw.id) || !str(raw.name)) return null;
  return {
    id: str(raw.id),
    name: str(raw.name),
    kind: oneOf(raw.kind, LIST_KINDS, "todo"),
    builtin: false,
    order: num(raw.order, now),
    createdAt: num(raw.createdAt, now),
  };
}

function readActivity(raw: unknown): Activity | null {
  if (!isObject(raw) || !str(raw.id) || numOrNull(raw.at) === null) return null;
  return {
    id: str(raw.id),
    at: num(raw.at, 0),
    type: "done",
    itemId: str(raw.itemId),
    kind: oneOf(raw.kind, ITEM_KINDS, "todo"),
    text: str(raw.text),
  };
}

function readSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  return {
    theme: oneOf(raw.theme, ["system", "light", "dark"] as const, "system"),
    lastBackupAt: numOrNull(raw.lastBackupAt),
    backupSnoozedUntil: numOrNull(raw.backupSnoozedUntil),
  };
}

function unique<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

/** Reads a backup file's text. Throws a BackupError with a message fit to show when the file cannot be used. */
export function readBackup(text: string, now: number): { snapshot: Snapshot; exportedAt: number } {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError("This file is not a backup: it could not be read as JSON.");
  }
  if (!isObject(file) || file.app !== APP_ID || !isObject(file.data)) {
    throw new BackupError("This file is not a backup from this app.");
  }
  const format = num(file.format, 0);
  if (format < 1) throw new BackupError("This backup has no format number, so it cannot be read safely.");
  if (format > BACKUP_FORMAT) {
    throw new BackupError("This backup was made by a newer version of the app. Update the app, then import it again.");
  }

  const data = file.data;
  // Built-in lists always exist and are never taken from the file.
  const builtinIds = new Set(BUILTIN_LISTS.map((list) => list.id));
  const custom = unique(
    array(data.lists)
      .map((raw) => readList(raw, now))
      .filter((list) => list !== null)
      .filter((list) => !builtinIds.has(list.id) && list.kind !== "inbox"),
  );
  const lists = [...BUILTIN_LISTS, ...custom];
  const listIds = new Set(lists.map((list) => list.id));

  const exported = Date.parse(str(file.exportedAt));
  const exportedAt = Number.isFinite(exported) ? exported : now;
  return {
    exportedAt,
    snapshot: {
      lists,
      items: unique(
        array(data.items)
          .map((raw) => readItem(raw, listIds, now))
          .filter((item) => item !== null),
      ),
      activity: unique(
        array(data.activity)
          .map(readActivity)
          .filter((entry) => entry !== null),
      ),
      settings: readSettings(data.settings),
    },
  };
}

/**
 * True when it has been two weeks since the last backup, or since the oldest
 * item was written if there has never been one, and the reminder is not snoozed.
 */
export function backupReminderDue(settings: Settings, items: Item[], now: number): boolean {
  if (items.length === 0) return false;
  if (settings.backupSnoozedUntil !== null && now < settings.backupSnoozedUntil) return false;
  const since = settings.lastBackupAt ?? Math.min(...items.map((item) => item.createdAt));
  return now - since >= BACKUP_EVERY_DAYS * DAY;
}

// The records the app stores. Everything here is plain data: it goes into
// IndexedDB and into the backup file unchanged.

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

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  lastBackupAt: number | null;
  /** The backup reminder stays hidden until this time. */
  backupSnoozedUntil: number | null;
}

/** A dated record of something completed. Later phases build streaks and reviews on it. */
export interface Activity {
  id: string;
  at: number;
  type: "done";
  itemId: string;
  kind: ItemKind;
  text: string;
}

/** Everything the app stores, as one value. */
export interface Snapshot {
  items: Item[];
  lists: List[];
  activity: Activity[];
  settings: Settings;
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

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  lastBackupAt: null,
  backupSnoozedUntil: null,
};

/** The built-in list an item of this kind goes to when nothing else says where. */
export function homeList(kind: ItemKind): string {
  return kind === "todo" ? TODOS : kind === "shopping" ? SHOPPING : NOTES;
}

export function newId(): string {
  return crypto.randomUUID();
}

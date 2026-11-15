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

export interface Settings {
  theme: Theme;
  lastBackupAt: number | null;
  /** The backup reminder stays hidden until this time. */
  backupSnoozedUntil: number | null;
  /** Shows only easy chores and has the companion speak more gently. */
  lowEnergy: boolean;
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

/** Everything the app stores, as one value. */
export interface Snapshot {
  items: Item[];
  lists: List[];
  activity: Activity[];
  chores: Chore[];
  rewards: Reward[];
  quests: QuestSet[];
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
  lowEnergy: false,
};

/** The built-in list an item of this kind goes to when nothing else says where. */
export function homeList(kind: ItemKind): string {
  return kind === "todo" ? TODOS : kind === "shopping" ? SHOPPING : NOTES;
}

export function newId(): string {
  return crypto.randomUUID();
}

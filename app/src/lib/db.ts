// The on-device database. Everything the app knows lives here, in IndexedDB.
//
// All writes to the record tables go through `apply`, which returns a function
// that puts back exactly what was there before. That one mechanism is what
// makes every completion and delete undoable.

import Dexie, { type Table } from "dexie";
import { readNotify } from "./backup.ts";
import { readCard } from "./card.ts";
import {
  BUILTIN_LISTS,
  DEFAULT_SETTINGS,
  NO_CONNECTION,
  NO_NOVELAI,
  type Activity,
  type Chore,
  type CompanionCard,
  type Connection,
  type Item,
  type List,
  type NovelAi,
  type QuestSet,
  type Reward,
  type Settings,
  type Snapshot,
  type StoredImage,
  type Trip,
  type TripEntry,
} from "./model.ts";

class AppDb extends Dexie {
  items!: Table<Item, string>;
  lists!: Table<List, string>;
  activity!: Table<Activity, string>;
  chores!: Table<Chore, string>;
  rewards!: Table<Reward, string>;
  quests!: Table<QuestSet, string>;
  trips!: Table<Trip, string>;
  tripEntries!: Table<TripEntry, string>;
  images!: Table<StoredImage, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("companion");
    // Adding a table or an index means adding a version() below the last one,
    // with an upgrade() if existing rows need changing. Never edit a shipped version.
    this.version(1).stores({ items: "id", lists: "id", activity: "id, at", meta: "key" });
    // Phase 2: chores, rewards, quests, and points on every log entry.
    this.version(2)
      .stores({ chores: "id", rewards: "id", quests: "id" })
      .upgrade((tx) =>
        tx
          .table("activity")
          .toCollection()
          .modify((entry: Partial<Activity>) => {
            entry.points ??= 0;
          }),
      );
    // Phase 3: trips and everything that belongs to them.
    this.version(3).stores({ trips: "id", tripEntries: "id, tripId" });
    // Phase 4: a reminder time on items.
    this.version(4).upgrade((tx) =>
      tx
        .table("items")
        .toCollection()
        .modify((item: Partial<Item>) => {
          item.time ??= null;
        }),
    );
    // Phase 5: the companion's own pictures.
    this.version(5).stores({ images: "id" });
    this.on("populate", (tx) => {
      void tx.table("lists").bulkAdd(BUILTIN_LISTS);
    });
  }
}

export const db = new AppDb();

interface Records {
  items: Item;
  lists: List;
  activity: Activity;
  chores: Chore;
  rewards: Reward;
  quests: QuestSet;
  trips: Trip;
  tripEntries: TripEntry;
}
const TABLES = ["items", "lists", "activity", "chores", "rewards", "quests", "trips", "tripEntries"] as const;
const recordTables = () => TABLES.map((name) => db.table(name));

export interface Change {
  put?: { [K in keyof Records]?: Records[K][] };
  remove?: { [K in keyof Records]?: string[] };
}

export type Undo = () => Promise<void>;

/** Writes a change in one transaction and returns the function that reverses it. */
export async function apply(change: Change): Promise<Undo> {
  const before: { table: (typeof TABLES)[number]; id: string; row: unknown }[] = [];
  await db.transaction("rw", recordTables(), async () => {
    for (const name of TABLES) {
      const table = db.table(name);
      const put: { id: string }[] = change.put?.[name] ?? [];
      const remove = change.remove?.[name] ?? [];
      const ids = [...put.map((row) => row.id), ...remove];
      if (ids.length === 0) continue;
      const rows = await table.bulkGet(ids);
      ids.forEach((id, index) => before.push({ table: name, id, row: rows[index] }));
      await table.bulkDelete(remove);
      await table.bulkPut(put);
    }
  });
  return async () => {
    await db.transaction("rw", recordTables(), async () => {
      for (const { table, id, row } of before) {
        if (row === undefined) await db.table(table).delete(id);
        else await db.table(table).put(row);
      }
    });
  };
}

export async function readSettings(): Promise<Settings> {
  const row = await db.meta.get("settings");
  const stored = row?.value as Partial<Settings> | undefined;
  // Notification choices are filled in one by one, so a choice added later gets its default.
  return { ...DEFAULT_SETTINGS, ...stored, notify: readNotify(stored?.notify) };
}

/** Where notifications are sent from. Kept apart from the settings, so it is never in a backup and a restore leaves it alone. */
export async function readConnection(): Promise<Connection> {
  const row = await db.meta.get("connection");
  return { ...NO_CONNECTION, ...(row?.value as Partial<Connection> | undefined) };
}

export async function saveConnection(connection: Connection): Promise<void> {
  await db.meta.put({ key: "connection", value: connection });
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    await db.meta.put({ key: "settings", value: { ...(await readSettings()), ...patch } });
  });
}

/** The NovelAI account. Kept apart from the settings, like the connection, so the token is never in a backup. */
export async function readNovelAi(): Promise<NovelAi> {
  const row = await db.meta.get("novelai");
  return { ...NO_NOVELAI, ...(row?.value as Partial<NovelAi> | undefined) };
}

export async function saveNovelAi(patch: Partial<NovelAi>): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    await db.meta.put({ key: "novelai", value: { ...(await readNovelAi()), ...patch } });
  });
}

/** Who the companion is. Stored whole, like the settings. */
export async function readCompanion(): Promise<CompanionCard> {
  return readCard((await db.meta.get("companion"))?.value);
}

export async function saveCompanion(card: CompanionCard): Promise<void> {
  await db.meta.put({ key: "companion", value: card });
}

/** Stores a picture for a pose, replacing the one it had. */
export async function saveImage(image: StoredImage): Promise<void> {
  await db.images.put(image);
}

/** Removes one picture, or every picture whose name passes the test. */
export async function removeImages(which: string | ((id: string) => boolean)): Promise<void> {
  if (typeof which === "string") await db.images.delete(which);
  else await db.images.bulkDelete((await db.images.toCollection().primaryKeys()).filter(which));
}

/** Replaces the companion with another: its card, and its main picture if it came with one. */
export async function replaceCompanion(card: CompanionCard, images: StoredImage[] | null): Promise<void> {
  await db.transaction("rw", db.meta, db.images, async () => {
    await db.meta.put({ key: "companion", value: card });
    if (images) {
      await db.images.clear();
      await db.images.bulkPut(images);
    }
  });
}

export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction("r", [...recordTables(), db.meta, db.images], async () => ({
    items: await db.items.toArray(),
    lists: await db.lists.toArray(),
    activity: await db.activity.toArray(),
    chores: await db.chores.toArray(),
    rewards: await db.rewards.toArray(),
    quests: await db.quests.toArray(),
    trips: await db.trips.toArray(),
    tripEntries: await db.tripEntries.toArray(),
    settings: await readSettings(),
    companion: await readCompanion(),
    images: await db.images.toArray(),
  }));
}

/** Replaces everything stored with the snapshot. */
export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await db.transaction("rw", [...recordTables(), db.meta, db.images], async () => {
    for (const name of TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkAdd(snapshot[name]);
    }
    await db.images.clear();
    await db.images.bulkAdd(snapshot.images);
    await db.meta.put({ key: "settings", value: snapshot.settings });
    await db.meta.put({ key: "companion", value: snapshot.companion });
  });
}

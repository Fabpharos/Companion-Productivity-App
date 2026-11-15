// The on-device database. Everything the app knows lives here, in IndexedDB.
//
// All writes to items, lists and the activity log go through `apply`, which
// returns a function that puts back exactly what was there before. That one
// mechanism is what makes every completion and delete undoable.

import Dexie, { type Table } from "dexie";
import { BUILTIN_LISTS, DEFAULT_SETTINGS, type Activity, type Item, type List, type Settings, type Snapshot } from "./model.ts";

class AppDb extends Dexie {
  items!: Table<Item, string>;
  lists!: Table<List, string>;
  activity!: Table<Activity, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("companion");
    // Adding a table or an index means adding a version() below this one, with
    // an upgrade() if existing rows need changing. Never edit a shipped version.
    this.version(1).stores({ items: "id", lists: "id", activity: "id, at", meta: "key" });
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
}
const TABLES = ["items", "lists", "activity"] as const;

export interface Change {
  put?: { [K in keyof Records]?: Records[K][] };
  remove?: { [K in keyof Records]?: string[] };
}

export type Undo = () => Promise<void>;

/** Writes a change in one transaction and returns the function that reverses it. */
export async function apply(change: Change): Promise<Undo> {
  const before: { table: (typeof TABLES)[number]; id: string; row: unknown }[] = [];
  await db.transaction("rw", db.items, db.lists, db.activity, async () => {
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
    await db.transaction("rw", db.items, db.lists, db.activity, async () => {
      for (const { table, id, row } of before) {
        if (row === undefined) await db.table(table).delete(id);
        else await db.table(table).put(row);
      }
    });
  };
}

export async function readSettings(): Promise<Settings> {
  const row = await db.meta.get("settings");
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    await db.meta.put({ key: "settings", value: { ...(await readSettings()), ...patch } });
  });
}

export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction("r", db.items, db.lists, db.activity, db.meta, async () => ({
    items: await db.items.toArray(),
    lists: await db.lists.toArray(),
    activity: await db.activity.toArray(),
    settings: await readSettings(),
  }));
}

/** Replaces everything stored with the snapshot. */
export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await db.transaction("rw", db.items, db.lists, db.activity, db.meta, async () => {
    await Promise.all([db.items.clear(), db.lists.clear(), db.activity.clear()]);
    await db.items.bulkAdd(snapshot.items);
    await db.lists.bulkAdd(snapshot.lists);
    await db.activity.bulkAdd(snapshot.activity);
    await db.meta.put({ key: "settings", value: snapshot.settings });
  });
}

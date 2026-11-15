// Everything the screens can do to the data. Each action that changes items
// returns an Undo, so the screen can offer to reverse it.

import { BackupError, makeBackup, readBackup } from "./backup.ts";
import { parseCapture } from "./capture.ts";
import { localDate } from "./dates.ts";
import { apply, db, readSnapshot, saveSettings, writeSnapshot, type Undo } from "./db.ts";
import { completeItem, isArchived, isStocked, makeItem, reopenItem, retype } from "./items.ts";
import { homeList, INBOX, newId, type Item, type ItemKind, type List } from "./model.ts";
import { FOCUS_SLOTS } from "./today.ts";

export interface Captured {
  items: Item[];
  undo: Undo;
}

/**
 * Adds what was typed in the capture box. Inside a list, entries take that
 * list's kind. Elsewhere the capture rules decide, and a plain note waits in
 * the Inbox. `force` overrides the guess and files a note straight into Notes.
 */
export async function capture(raw: string, where: { list?: List; force?: ItemKind } = {}): Promise<Captured> {
  const now = Date.now();
  const list = where.list && where.list.kind !== "inbox" ? where.list : undefined;
  const force = where.force ?? (list?.kind as ItemKind | undefined);
  const items = parseCapture(raw, localDate(now), force).map((draft, index) =>
    makeItem(
      {
        ...draft,
        listId: list && list.kind === draft.kind ? list.id : draft.kind === "note" && !force ? INBOX : homeList(draft.kind),
      },
      // Entries captured together keep their typed order.
      now + index,
    ),
  );
  return { items, undo: await apply({ put: { items } }) };
}

export async function saveItem(item: Item): Promise<Undo> {
  return apply({ put: { items: [{ ...item, updatedAt: Date.now() }] } });
}

export async function complete(item: Item): Promise<Undo> {
  const now = Date.now();
  const { items, activity } = completeItem(item, now, localDate(now));
  return apply({ put: { items, activity: [activity] } });
}

export async function reopen(item: Item): Promise<Undo> {
  return apply({ put: { items: [reopenItem(item, Date.now())] } });
}

export async function remove(items: Item[]): Promise<Undo> {
  return apply({ remove: { items: items.map((item) => item.id) } });
}

export async function changeKind(item: Item, kind: ItemKind): Promise<Undo> {
  return apply({ put: { items: [retype(item, kind, Date.now())] } });
}

/** Puts an item into Today's three, or takes it out. Returns null when the three slots are full. */
export async function setFocus(item: Item, on: boolean): Promise<Undo | null> {
  const today = localDate();
  if (on) {
    const taken = await db.items.filter((other) => other.focusOn === today && other.kind === "todo").count();
    if (taken >= FOCUS_SLOTS) return null;
  }
  return apply({ put: { items: [{ ...item, focusOn: on ? today : null }] } });
}

export async function focusAll(items: Item[]): Promise<Undo> {
  const today = localDate();
  return apply({ put: { items: items.map((item) => ({ ...item, focusOn: today })) } });
}

/** Puts every bought staple of a list back on it. */
export async function restockStaples(listId: string): Promise<{ count: number; undo: Undo }> {
  const now = Date.now();
  const stocked = await db.items.filter((item) => item.listId === listId && isStocked(item)).toArray();
  return { count: stocked.length, undo: await apply({ put: { items: stocked.map((item) => reopenItem(item, now)) } }) };
}

export async function addList(name: string, kind: ItemKind): Promise<List> {
  const now = Date.now();
  const list: List = { id: newId(), name: name.trim(), kind, builtin: false, order: now, createdAt: now };
  await apply({ put: { lists: [list] } });
  return list;
}

export async function renameList(list: List, name: string): Promise<void> {
  if (name.trim()) await apply({ put: { lists: [{ ...list, name: name.trim() }] } });
}

/** Deletes a custom list and everything on it. */
export async function deleteList(list: List): Promise<Undo> {
  if (list.builtin) throw new Error("Built-in lists cannot be deleted.");
  const ids = await db.items.filter((item) => item.listId === list.id).primaryKeys();
  return apply({ remove: { lists: [list.id], items: ids } });
}

export async function emptyArchive(): Promise<{ count: number; undo: Undo }> {
  const ids = await db.items.filter(isArchived).primaryKeys();
  return { count: ids.length, undo: await apply({ remove: { items: ids } }) };
}

/** The backup file's contents. Call `markBackedUp` once the file has actually been saved. */
export async function exportBackup(): Promise<string> {
  return makeBackup(await readSnapshot(), Date.now());
}

export async function markBackedUp(): Promise<void> {
  await saveSettings({ lastBackupAt: Date.now(), backupSnoozedUntil: null });
}

export async function snoozeBackupReminder(days: number): Promise<void> {
  await saveSettings({ backupSnoozedUntil: Date.now() + days * 86_400_000 });
}

/**
 * Replaces everything on the phone with the contents of a backup file.
 * Throws a BackupError, leaving the stored data untouched, if the file is unusable.
 */
export async function importBackup(text: string): Promise<{ items: number }> {
  const { snapshot, exportedAt } = readBackup(text, Date.now());
  // The restored data matches a file that exists, so the reminder counts from when that file was made.
  await writeSnapshot({ ...snapshot, settings: { ...snapshot.settings, lastBackupAt: exportedAt, backupSnoozedUntil: null } });
  return { items: snapshot.items.length };
}

export { BackupError };

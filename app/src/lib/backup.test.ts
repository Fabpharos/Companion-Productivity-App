import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_ID, BackupError, backupFileName, backupReminderDue, makeBackup, readBackup } from "./backup.ts";
import { makeItem } from "./items.ts";
import { BUILTIN_LISTS, DEFAULT_SETTINGS, INBOX, TODOS, type Snapshot } from "./model.ts";

const DAY = 86_400_000;

const snapshot: Snapshot = {
  lists: [...BUILTIN_LISTS, { id: "trip", name: "Trip prep", kind: "todo", builtin: false, order: 9, createdAt: 9 }],
  items: [
    makeItem(
      {
        kind: "todo",
        listId: "trip",
        text: "Order eSIM",
        due: "2027-02-19",
        repeat: { every: 2, unit: "week" },
        priority: 2,
        tags: ["japan"],
        subtasks: [{ id: "s1", text: "compare plans", done: true }],
      },
      100,
    ),
    makeItem({ kind: "shopping", listId: "shopping", text: "Milk", staple: true, section: "Dairy & eggs", doneAt: 300 }, 200),
    makeItem({ kind: "note", listId: INBOX, text: "Line one\nline two, ünïcödé 日本", pinned: true }, 300),
  ],
  activity: [
    { id: "a1", at: 300, type: "done", itemId: "x", kind: "shopping", text: "Milk", points: 1 },
    { id: "a2", at: 400, type: "chore", itemId: "c1", text: "Dishes", points: 10 },
    { id: "a3", at: 500, type: "reward", itemId: "r1", text: "Movie night", points: -40 },
  ],
  chores: [
    { id: "c1", name: "Dishes", everyDays: 1, lastDoneAt: 400, createdAt: 1, effort: 1, dislike: 2, steps: [{ id: "s", text: "Dry", done: false }] },
  ],
  rewards: [{ id: "r1", name: "Movie night", price: 40, createdAt: 2 }],
  quests: [{ id: "d:2026-11-14", quests: [{ id: "chore:c1", kind: "chore", ref: "c1", target: 1, text: 'Do "Dishes"', bonus: 5 }] }],
  settings: { theme: "dark", lastBackupAt: 50, backupSnoozedUntil: null, lowEnergy: true },
};

test("a backup reads back exactly as it was written", () => {
  const { snapshot: restored, exportedAt } = readBackup(makeBackup(snapshot, 1_800_000_000_000), 0);
  assert.deepEqual(restored, snapshot);
  assert.equal(exportedAt, 1_800_000_000_000);
});

test("files that are not backups are refused with a reason", () => {
  const bad = ["not json", "[]", JSON.stringify({ app: "other", format: 1, data: {} }), JSON.stringify({ app: APP_ID, data: {} })];
  for (const text of bad) assert.throws(() => readBackup(text, 0), BackupError);
  assert.throws(() => readBackup(JSON.stringify({ app: APP_ID, format: 99, data: {} }), 0), /newer version/);
});

test("missing and wrong fields are filled with defaults, and broken records are dropped", () => {
  const odd = {
    id: "2",
    text: "odd",
    kind: "spell",
    listId: "gone",
    due: "2027-02-30",
    priority: 9,
    tags: ["ok", 3],
    repeat: { every: 0 },
    subtasks: [{ id: "s", text: "t" }, 5],
  };
  const file = (items: unknown[]) =>
    JSON.stringify({
      app: APP_ID,
      format: 1,
      data: {
        lists: [{ id: "inbox", name: "Hijacked", kind: "todo" }, { id: "x", name: "Mine", kind: "nonsense" }, { name: "no id" }],
        items,
        activity: "nope",
      },
    });

  const { snapshot: read } = readBackup(file([{ id: "1", text: "bare" }, odd, { id: "2", text: "the later duplicate wins" }, { text: "no id" }, "junk"]), 777);
  assert.deepEqual(
    read.lists.map((list) => [list.id, list.name, list.kind]),
    [
      ["inbox", "Inbox", "inbox"],
      ["todos", "To-dos", "todo"],
      ["shopping", "Shopping", "shopping"],
      ["notes", "Notes", "note"],
      ["x", "Mine", "todo"],
    ],
  );
  assert.deepEqual(
    read.items.map((item) => item.text),
    ["bare", "the later duplicate wins"],
  );
  assert.deepEqual(read.items[0], { ...makeItem({ kind: "note", listId: INBOX, text: "bare" }, 777), id: "1" });
  assert.deepEqual([read.activity, read.chores, read.rewards, read.quests], [[], [], [], []]);
  assert.deepEqual(read.settings, DEFAULT_SETTINGS);

  const [fixed] = readBackup(file([odd]), 777).snapshot.items;
  assert.deepEqual(
    [fixed?.kind, fixed?.listId, fixed?.due, fixed?.priority, fixed?.tags, fixed?.repeat, fixed?.subtasks],
    ["note", INBOX, null, 3, ["ok"], null, [{ id: "s", text: "t", done: false }]],
  );
});

test("a backup from before Phase 2 still reads, with no points and no chores", () => {
  const old = {
    app: APP_ID,
    format: 1,
    data: {
      items: [{ id: "1", text: "x", kind: "todo", listId: "todos" }],
      activity: [{ id: "a", at: 5, type: "done", itemId: "1", kind: "todo", text: "x" }],
      settings: { theme: "light" },
    },
  };
  const { snapshot: read } = readBackup(JSON.stringify(old), 0);
  assert.deepEqual(read.activity, [{ id: "a", at: 5, type: "done", itemId: "1", kind: "todo", text: "x", points: 0 }]);
  assert.deepEqual([read.chores, read.rewards, read.quests, read.settings.lowEnergy], [[], [], [], false]);
});

test("broken Phase 2 records are repaired or dropped", () => {
  const file = {
    app: APP_ID,
    format: 2,
    data: {
      chores: [{ id: "c", name: "Mop", everyDays: 0, effort: 9, dislike: -1, steps: "x" }, { id: "nameless" }],
      rewards: [{ id: "r", name: "Treat", price: -5 }],
      quests: [{ id: "d:2026-11-14", quests: [{ id: "q", kind: "odd", target: 0 }, 7] }, { id: "yesterday", quests: [] }],
    },
  };
  const { snapshot: read } = readBackup(JSON.stringify(file), 9);
  assert.deepEqual(read.chores, [{ id: "c", name: "Mop", everyDays: 1, lastDoneAt: null, createdAt: 9, effort: 3, dislike: 0, steps: [] }]);
  assert.deepEqual(read.rewards, [{ id: "r", name: "Treat", price: 1, createdAt: 9 }]);
  assert.deepEqual(read.quests, [{ id: "d:2026-11-14", quests: [{ id: "q", kind: "count", ref: null, target: 1, text: "", bonus: 0 }] }]);
});

test("the reminder comes two weeks after the last backup, or after the first item", () => {
  const items = [makeItem({ kind: "todo", listId: TODOS, text: "x" }, 10 * DAY)];
  assert.equal(backupReminderDue(DEFAULT_SETTINGS, [], 100 * DAY), false, "nothing to lose yet");
  assert.equal(backupReminderDue(DEFAULT_SETTINGS, items, 23 * DAY), false);
  assert.equal(backupReminderDue(DEFAULT_SETTINGS, items, 24 * DAY), true);
  assert.equal(backupReminderDue({ ...DEFAULT_SETTINGS, lastBackupAt: 20 * DAY }, items, 33 * DAY), false);
  assert.equal(backupReminderDue({ ...DEFAULT_SETTINGS, lastBackupAt: 20 * DAY }, items, 34 * DAY), true);
  assert.equal(backupReminderDue({ ...DEFAULT_SETTINGS, backupSnoozedUntil: 40 * DAY }, items, 39 * DAY), false);
  assert.equal(backupReminderDue({ ...DEFAULT_SETTINGS, backupSnoozedUntil: 40 * DAY }, items, 40 * DAY), true);
});

test("the file is named by date", () => {
  assert.equal(backupFileName(new Date(2026, 10, 14, 9).getTime()), "companion-backup-2026-11-14.json");
});

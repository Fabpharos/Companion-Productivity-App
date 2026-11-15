import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import * as actions from "./actions.ts";
import { addDays, localDate } from "./dates.ts";
import { db, readSettings, readSnapshot, saveSettings } from "./db.ts";
import { BUILTIN_LISTS, INBOX, NOTES, SHOPPING, TODOS } from "./model.ts";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const texts = async () =>
  (await db.items.toArray()).sort((a, b) => a.createdAt - b.createdAt).map((item) => `${item.listId}:${item.text}`);
const byText = async (text: string) => (await db.items.toArray()).find((item) => item.text === text)!;

test("a new database starts with the built-in lists", async () => {
  const ids = (await db.lists.toArray()).map((list) => list.id).sort();
  assert.deepEqual(ids, BUILTIN_LISTS.map((list) => list.id).sort());
});

test("capture files entries by the rules, and undo takes them back", async () => {
  await actions.capture("call mom tomorrow #family");
  await actions.capture("an idea about the garden");
  const { items, undo } = await actions.capture("milk, eggs");
  assert.equal(items.length, 2);
  assert.deepEqual(
    (await texts()).sort(),
    [`${TODOS}:call mom`, `${INBOX}:an idea about the garden`, `${SHOPPING}:milk`, `${SHOPPING}:eggs`].sort(),
  );
  const todo = await byText("call mom");
  assert.deepEqual([todo.due, todo.tags], [addDays(localDate(), 1), ["family"]]);
  await undo();
  assert.equal((await texts()).length, 2);
});

test("capture inside a list takes that list's kind, and a forced note goes to Notes", async () => {
  const list = await actions.addList("Costco", "shopping");
  await actions.capture("call mom", { list });
  await actions.capture("milk", { force: "note" });
  await actions.capture("milk", { list: BUILTIN_LISTS[0] });
  // The three were added within the same millisecond, so their order is not meaningful.
  assert.deepEqual((await texts()).sort(), [`${list.id}:call mom`, `${NOTES}:milk`, `${SHOPPING}:milk`].sort());
});

test("completing can be undone, including the next occurrence and the log entry", async () => {
  const { items } = await actions.capture("pay rent", { force: "todo" });
  const rent = { ...items[0]!, repeat: { every: 1, unit: "month" as const }, due: localDate() };
  await actions.saveItem(rent);
  const { undo, entry } = await actions.complete(rent);
  assert.equal(entry.points, 5);
  assert.equal(await db.items.count(), 2);
  assert.equal(await db.activity.count(), 1);
  await undo();
  const all = await db.items.toArray();
  assert.equal(all.length, 1);
  assert.equal(all[0]?.doneAt, null);
  assert.deepEqual(all[0]?.repeat, { every: 1, unit: "month" });
  assert.equal(await db.activity.count(), 0);
});

test("delete can be undone", async () => {
  const { items } = await actions.capture("keep me", { force: "note" });
  const undo = await actions.remove(items);
  assert.equal(await db.items.count(), 0);
  await undo();
  assert.deepEqual(await db.items.toArray(), items);
});

test("Today's three stop at three", async () => {
  const { items } = await actions.capture("a\nb\nc\nd", { force: "shopping" });
  const todos = items.map((item) => ({ ...item, kind: "todo" as const }));
  for (const todo of todos) await actions.saveItem(todo);
  for (const todo of todos.slice(0, 3)) assert.ok(await actions.setFocus(todo, true));
  assert.equal(await actions.setFocus(todos[3]!, true), null);
});

test("staples restock in one go", async () => {
  const { items } = await actions.capture("milk, eggs, cake", { force: "shopping" });
  for (const item of items) await actions.complete({ ...item, staple: item.text !== "cake" });
  const { count } = await actions.restockStaples(SHOPPING);
  assert.equal(count, 2);
  const open = (await db.items.toArray()).filter((item) => item.doneAt === null).map((item) => item.text);
  assert.deepEqual(open.sort(), ["eggs", "milk"]);
});

test("deleting a list removes its items, and undo restores both", async () => {
  const list = await actions.addList("Trip prep", "todo");
  await actions.capture("order esim", { list });
  await actions.capture("elsewhere", { force: "note" });
  const undo = await actions.deleteList(list);
  assert.deepEqual(await texts(), [`${NOTES}:elsewhere`]);
  assert.equal(await db.lists.get(list.id), undefined);
  await undo();
  assert.equal((await texts()).length, 2);
  assert.equal((await db.lists.get(list.id))?.name, "Trip prep");
  await assert.rejects(actions.deleteList(BUILTIN_LISTS[0]!));
});

test("emptying the archive leaves open items and stocked staples", async () => {
  const { items } = await actions.capture("milk, cake, bread", { force: "shopping" });
  await actions.complete({ ...items[0]!, staple: true });
  await actions.complete(items[1]!);
  const { count } = await actions.emptyArchive();
  assert.equal(count, 1);
  assert.deepEqual((await db.items.toArray()).map((item) => item.text).sort(), ["bread", "milk"]);
});

test("a backup restores everything after the app's data is cleared", async () => {
  const list = await actions.addList("Trip prep", "todo");
  await actions.capture("order esim friday #japan", { list });
  await actions.capture("milk, eggs");
  const { items } = await actions.capture("wifi password\nhunter2", { force: "note" });
  await actions.saveItem({ ...items[0]!, pinned: true });
  await actions.complete(await byText("milk"));
  await saveSettings({ theme: "dark" });
  const before = await readSnapshot();
  const file = await actions.exportBackup();

  await db.delete();
  await db.open();
  assert.equal(await db.items.count(), 0);

  const result = await actions.importBackup(file);
  assert.equal(result.items, 4);
  const after = await readSnapshot();
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(after.items), byId(before.items));
  assert.deepEqual(byId(after.lists), byId(before.lists));
  assert.deepEqual(after.activity, before.activity);
  assert.equal(after.settings.theme, "dark");
  assert.ok(after.settings.lastBackupAt, "restoring counts as having a backup");
});

test("a typed chore is added, and nothing is added for an empty name", async () => {
  const added = await actions.addChore("Vacuum every 2 weeks");
  assert.deepEqual([added?.chore.name, added?.chore.everyDays, added?.chore.lastDoneAt], ["Vacuum", 14, null]);
  assert.equal(await actions.addChore("  "), null);
  assert.equal(await db.chores.count(), 1);
});

test("completing a chore restarts its clock and earns its points, and undo takes both back", async () => {
  const { chore } = (await actions.addChore("Dishes daily"))!;
  const { undo, entry } = await actions.completeChore(chore);
  assert.deepEqual([entry.type, entry.itemId, entry.text, entry.points], ["chore", chore.id, "Dishes", 10]);
  const done = (await db.chores.get(chore.id))!;
  assert.ok(done.lastDoneAt);
  assert.equal((await actions.completeChore(done)).entry.points, 1, "doing it again at once earns a token point");
  await db.activity.clear();
  await undo();
  assert.equal((await db.chores.get(chore.id))?.lastDoneAt, null);
});

test("steps earn their share, the last one completes the chore, and unticking gives the share back", async () => {
  const { chore: bare } = (await actions.addChore("Clean kitchen"))!;
  const chore = { ...bare, steps: ["a", "b", "c"].map((id) => ({ id, text: id.toUpperCase(), done: false })) };
  await actions.saveChore(chore);
  const points = async () => (await db.activity.toArray()).reduce((sum, entry) => sum + entry.points, 0);
  const stored = async () => (await db.chores.get(chore.id))!;

  const first = await actions.toggleStep(chore, "a");
  assert.deepEqual([first?.entry.type, first?.entry.points, first?.entry.text], ["step", 3, "Clean kitchen: A"]);
  await actions.toggleStep(await stored(), "b");
  assert.equal(await points(), 6);

  assert.equal(await actions.toggleStep(await stored(), "b"), null);
  assert.equal(await points(), 3, "unticking returns the step's points");
  assert.deepEqual((await stored()).steps.map((step) => step.done), [true, false, false]);

  await actions.toggleStep(await stored(), "b");
  const last = await actions.toggleStep(await stored(), "c");
  assert.deepEqual([last?.entry.type, last?.entry.points], ["chore", 4]);
  assert.equal(await points(), 10, "steps and completion add up to the chore's points");
  const after = await stored();
  assert.ok(after.lastDoneAt);
  assert.deepEqual(after.steps.map((step) => step.done), [false, false, false]);

  await last!.undo();
  assert.deepEqual((await stored()).steps.map((step) => step.done), [true, true, false]);
  assert.equal(await points(), 6);
});

test("quests are made once a day and once a week, then left alone", async () => {
  await actions.addChore("Dishes daily");
  await actions.ensureQuests("2026-11-14");
  const first = await db.quests.toArray();
  assert.deepEqual(first.map((set) => [set.id, set.quests.length]).sort(), [
    ["d:2026-11-14", 3],
    ["w:2026-11-09", 1],
  ]);
  await actions.addChore("Mop");
  await actions.ensureQuests("2026-11-14");
  assert.deepEqual(await db.quests.toArray(), first);
  await actions.ensureQuests("2026-11-15");
  assert.equal(await db.quests.count(), 3, "a new day in the same week adds only the day");
});

test("buying a reward spends points and keeps the reward", async () => {
  await actions.addReward(" Movie night ", 40.9);
  const [reward] = await db.rewards.toArray();
  assert.deepEqual([reward?.name, reward?.price], ["Movie night", 40]);
  const undo = await actions.buyReward(reward!);
  assert.deepEqual((await db.activity.toArray()).map((entry) => [entry.type, entry.points, entry.text]), [["reward", -40, "Movie night"]]);
  assert.equal(await db.rewards.count(), 1);
  await undo();
  assert.equal(await db.activity.count(), 0);
});

test("a backup carries chores, rewards, quests and points", async () => {
  const { chore } = (await actions.addChore("Dishes daily"))!;
  await actions.completeChore(chore);
  await actions.addReward("Treat", 5);
  await actions.ensureQuests("2026-11-14");
  await actions.setLowEnergy(true);
  const before = await readSnapshot();
  const file = await actions.exportBackup();
  await db.delete();
  await db.open();
  await actions.importBackup(file);
  const after = await readSnapshot();
  assert.deepEqual([after.chores, after.rewards, after.activity], [before.chores, before.rewards, before.activity]);
  assert.deepEqual(after.quests.sort((a, b) => a.id.localeCompare(b.id)), before.quests.sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(after.settings.lowEnergy, true);
});

test("a bad backup file changes nothing", async () => {
  await actions.capture("precious", { force: "note" });
  await assert.rejects(actions.importBackup("{}"), actions.BackupError);
  assert.equal(await db.items.count(), 1);
  assert.equal((await readSettings()).lastBackupAt, null);
});

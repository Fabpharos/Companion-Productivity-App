import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareNotes,
  compareTodos,
  completeItem,
  isArchived,
  isStocked,
  makeItem,
  parseTags,
  retype,
  shoppingView,
  tagCounts,
  title,
} from "./items.ts";
import { NOTES, SHOPPING, TODOS, type Item } from "./model.ts";

const todo = (text: string, fields: Partial<Item> = {}) => makeItem({ kind: "todo", listId: TODOS, text, ...fields }, 1000);
const shop = (text: string, fields: Partial<Item> = {}) => makeItem({ kind: "shopping", listId: SHOPPING, text, ...fields }, 1000);

test("completing a to-do archives it and logs it", () => {
  const item = todo("Call the dentist\nask about x-rays");
  const { items, activity } = completeItem(item, 5000, "2026-11-14");
  assert.equal(items.length, 1);
  assert.equal(items[0]?.doneAt, 5000);
  assert.ok(isArchived(items[0]!));
  assert.deepEqual({ ...activity, id: "" }, { id: "", at: 5000, type: "done", itemId: item.id, kind: "todo", text: "Call the dentist" });
});

test("completing a repeating to-do leaves the next one in its place", () => {
  const item = todo("Pay rent", {
    due: "2026-11-01",
    repeat: { every: 1, unit: "month" },
    priority: 2,
    tags: ["bills"],
    focusOn: "2026-11-14",
    subtasks: [{ id: "a", text: "transfer", done: true }],
  });
  const [done, next] = completeItem(item, 5000, "2026-11-14").items;
  assert.equal(done?.id, item.id);
  assert.equal(done?.repeat, null, "the archived copy does not repeat, so restoring it cannot double the schedule");
  assert.notEqual(next?.id, item.id);
  assert.equal(next?.due, "2026-12-01");
  assert.equal(next?.doneAt, null);
  assert.equal(next?.focusOn, null);
  assert.deepEqual(next?.repeat, { every: 1, unit: "month" });
  assert.deepEqual(next?.subtasks, [{ id: "a", text: "transfer", done: false }]);
  assert.deepEqual([next?.priority, next?.tags], [2, ["bills"]]);
});

test("a bought staple is stocked, not archived", () => {
  const milk = completeItem(shop("Milk", { staple: true }), 5000, "2026-11-14").items[0]!;
  const cake = completeItem(shop("Cake"), 5000, "2026-11-14").items[0]!;
  assert.ok(isStocked(milk) && !isArchived(milk));
  assert.ok(!isStocked(cake) && isArchived(cake));
});

test("the shopping list is grouped in store order with stocked staples apart", () => {
  const view = shoppingView([
    shop("Shampoo", { section: "Personal care" }),
    shop("Apples", { section: "Produce" }),
    shop("Gift wrap"),
    shop("Kiwi", { section: "Produce", createdAt: 2000 }),
    shop("Something", { section: "Garden centre" }),
    { ...shop("Milk", { staple: true }), doneAt: 1 },
    { ...shop("Cake"), doneAt: 1 },
  ]);
  assert.deepEqual(
    view.sections.map((group) => [group.section, group.items.map((item) => item.text)]),
    [
      ["Produce", ["Apples", "Kiwi"]],
      ["Personal care", ["Shampoo"]],
      ["Other", ["Gift wrap"]],
      ["Garden centre", ["Something"]],
    ],
  );
  assert.deepEqual(
    view.stocked.map((item) => item.text),
    ["Milk"],
  );
});

test("to-dos sort by date, then priority, then age", () => {
  const sorted = [
    todo("undated low", { createdAt: 1 }),
    todo("undated high", { priority: 3, createdAt: 2 }),
    todo("later", { due: "2026-12-01" }),
    todo("sooner", { due: "2026-11-15" }),
    todo("sooner urgent", { due: "2026-11-15", priority: 2 }),
  ].sort(compareTodos);
  assert.deepEqual(
    sorted.map((item) => item.text),
    ["sooner urgent", "sooner", "later", "undated high", "undated low"],
  );
});

test("notes sort pinned first, then newest edit", () => {
  const note = (text: string, fields: Partial<Item>) => makeItem({ kind: "note", listId: NOTES, text, ...fields }, 1);
  const sorted = [note("old", { updatedAt: 1 }), note("new", { updatedAt: 9 }), note("pinned", { pinned: true, updatedAt: 0 })].sort(
    compareNotes,
  );
  assert.deepEqual(
    sorted.map((item) => item.text),
    ["pinned", "new", "old"],
  );
});

test("changing kind moves the item home and keeps its details", () => {
  const note = makeItem({ kind: "note", listId: "inbox", text: "eggs", tags: ["x"] }, 1);
  const asShopping = retype(note, "shopping", 2);
  assert.deepEqual([asShopping.kind, asShopping.listId, asShopping.section], ["shopping", SHOPPING, "Dairy & eggs"]);
  const back = retype(asShopping, "note", 3);
  assert.deepEqual([back.kind, back.listId, back.tags], ["note", NOTES, ["x"]]);
});

test("small helpers", () => {
  assert.equal(title({ text: "  First line \nsecond" }), "First line");
  assert.deepEqual(parseTags("Home, #urgent  home"), ["home", "urgent"]);
  assert.deepEqual(tagCounts([todo("a", { tags: ["x", "y"] }), todo("b", { tags: ["y"] })]), [
    ["y", 2],
    ["x", 1],
  ]);
});

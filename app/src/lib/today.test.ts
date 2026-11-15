import assert from "node:assert/strict";
import { test } from "node:test";
import { makeItem } from "./items.ts";
import { INBOX, NOTES, TODOS, type Item } from "./model.ts";
import { suggestFocus, todayView } from "./today.ts";

const TODAY = "2026-11-14";
let clock = 0;
const todo = (text: string, fields: Partial<Item> = {}) => makeItem({ kind: "todo", listId: TODOS, text, ...fields }, ++clock);
const names = (items: Item[]) => items.map((item) => item.text);

test("to-dos are sorted into overdue, today and the week ahead", () => {
  const view = todayView(
    [
      todo("late", { due: "2026-11-10" }),
      todo("now", { due: TODAY }),
      todo("soon", { due: "2026-11-21" }),
      todo("far", { due: "2026-11-22" }),
      todo("someday"),
      todo("finished", { due: TODAY, doneAt: 1 }),
    ],
    TODAY,
  );
  assert.deepEqual([names(view.overdue), names(view.dueToday), names(view.upcoming)], [["late"], ["now"], ["soon"]]);
});

test("Today's three hold today's picks only, done ones last, and are not listed twice", () => {
  const view = todayView(
    [
      todo("picked and done", { focusOn: TODAY, doneAt: 5 }),
      todo("picked", { focusOn: TODAY, due: "2026-11-01" }),
      todo("picked yesterday", { focusOn: "2026-11-13", due: "2026-11-13" }),
    ],
    TODAY,
  );
  assert.deepEqual(names(view.focus), ["picked", "picked and done"]);
  assert.deepEqual(names(view.overdue), ["picked yesterday"]);
});

test("pinned notes and the inbox count are included", () => {
  const view = todayView(
    [
      makeItem({ kind: "note", listId: NOTES, text: "wifi", pinned: true }, 1),
      makeItem({ kind: "note", listId: NOTES, text: "loose" }, 1),
      makeItem({ kind: "note", listId: INBOX, text: "unsorted" }, 1),
      makeItem({ kind: "note", listId: INBOX, text: "sorted away", doneAt: 2 }, 1),
    ],
    TODAY,
  );
  assert.deepEqual(names(view.pinned), ["wifi"]);
  assert.equal(view.inboxCount, 1);
});

test("suggestions favour overdue, then today, then priority, then age", () => {
  const items = [
    todo("old and undated"),
    todo("high priority", { priority: 3 }),
    todo("due today", { due: TODAY }),
    todo("a week late", { due: "2026-11-07" }),
    todo("a day late", { due: "2026-11-13" }),
    todo("done", { due: "2026-11-01", doneAt: 1 }),
  ];
  assert.deepEqual(names(suggestFocus(items, TODAY)), ["a week late", "a day late", "due today"]);
  assert.deepEqual(names(suggestFocus(items.slice(0, 2), TODAY)), ["high priority", "old and undated"]);
});

test("suggestions only fill the slots that are free", () => {
  const items = [todo("picked", { focusOn: TODAY }), todo("picked too", { focusOn: TODAY, doneAt: 3 }), todo("a"), todo("b")];
  assert.deepEqual(names(suggestFocus(items, TODAY)), ["a"]);
});

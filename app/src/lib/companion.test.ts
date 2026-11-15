import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_STYLE, type DialogueStyle, type LineEvent } from "../../content/dialogue.ts";
import { makeChore } from "./chores.ts";
import { completionEvent, greetingEvent, nudge, say, suggestNext } from "./companion.ts";
import { makeItem } from "./items.ts";
import { TODOS } from "./model.ts";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 14, 12).getTime();
const TODAY = "2026-11-14";

test("a line is filled in and comes with a pose", () => {
  const style = { ...DEFAULT_STYLE, lines: { ...DEFAULT_STYLE.lines, choreDone: ['"{name}" is done. +{points}.'] } };
  assert.deepEqual(say(style, "choreDone", { name: "Dishes", points: 10 }, 1, 0), { pose: "happy", text: '"Dishes" is done. +10.' });
  assert.equal(say(DEFAULT_STYLE, "levelUp", { n: 3 }, 1, 0.99).pose, "proud");
});

test("lines unlock with bond level", () => {
  const style: DialogueStyle = { ...DEFAULT_STYLE, lines: { ...DEFAULT_STYLE.lines, tap: ["plain", { text: "close", bond: 3 }] } };
  assert.equal(say(style, "tap", {}, 1, 0.99).text, "plain");
  assert.equal(say(style, "tap", {}, 3, 0.99).text, "close");
});

test("every event has a line at bond level 1, and every placeholder is one the app fills", () => {
  for (const [event, lines] of Object.entries(DEFAULT_STYLE.lines)) {
    assert.ok(
      lines.some((line) => typeof line === "string"),
      `${event} needs a line that is always available`,
    );
    for (const line of lines) {
      const text = typeof line === "string" ? line : line.text;
      for (const [, key] of text.matchAll(/\{(\w+)\}/g)) assert.ok(["name", "n", "points"].includes(key!), `${event}: {${key}}`);
    }
  }
});

test("the companion never scolds", () => {
  const banned = /\b(should have|shouldn't|lazy|failed|failure|behind|neglect|finally|missed|forgot|again\?|disappoint|guilt|shame|overdue)\b/i;
  for (const [event, lines] of Object.entries(DEFAULT_STYLE.lines)) {
    for (const line of lines) assert.doesNotMatch(typeof line === "string" ? line : line.text, banned, event);
  }
});

test("the greeting fits the hour, a long absence, and low energy", () => {
  const events = [3, 8, 14, 20, 23].map((hour) => greetingEvent(hour, 0, false));
  assert.deepEqual(events, ["night", "morning", "day", "evening", "night"] satisfies LineEvent[]);
  assert.equal(greetingEvent(8, 3, true), "absence");
  assert.equal(greetingEvent(8, 2, true), "lowGreeting");
});

test("a completion is answered with its biggest milestone, else a well-done", () => {
  const what = { chore: true, name: "Dishes", points: 10 };
  assert.deepEqual(completionEvent([], what, false), { event: "choreDone", vars: { name: "Dishes", points: 10 } });
  assert.equal(completionEvent([], { ...what, chore: false }, false).event, "done");
  assert.equal(completionEvent([], what, true).event, "lowDone");
  assert.deepEqual(completionEvent([{ type: "levelUp", level: 2 }, { type: "streak", days: 3 }], what, true), { event: "levelUp", vars: { n: 2 } });
  assert.deepEqual(completionEvent([{ type: "quest", text: "Do any chore", bonus: 5 }], what, false), {
    event: "quest",
    vars: { name: "Do any chore", points: 5 },
  });
});

test("the next suggestion is the most overdue chore, then a to-do, then rest", () => {
  const late = makeChore({ name: "Bathroom", everyDays: 7, lastDoneAt: NOW - 20 * DAY, effort: 3 }, 0);
  const due = makeChore({ name: "Dishes", everyDays: 1, lastDoneAt: NOW - DAY, effort: 1 }, 0);
  const fresh = makeChore({ name: "Mop", everyDays: 7, lastDoneAt: NOW }, 0);
  const todo = makeItem({ kind: "todo", listId: TODOS, text: "Pay rent", focusOn: TODAY }, 0);

  assert.equal(suggestNext([fresh, due, late], [todo], NOW, TODAY, false).chore?.name, "Bathroom");
  assert.equal(suggestNext([fresh, due, late], [todo], NOW, TODAY, true).chore?.name, "Dishes", "low energy keeps to easy chores");
  assert.equal(suggestNext([fresh], [todo], NOW, TODAY, false).item?.text, "Pay rent");
  assert.equal(suggestNext([fresh], [todo], NOW, TODAY, true).event, "nothingToDo");
  assert.equal(suggestNext([], [], NOW, TODAY, false).event, "nothingToDo");
});

test("a nudge mentions only a chore that is past due", () => {
  const due = makeChore({ name: "Dishes", everyDays: 7, lastDoneAt: NOW - 7 * DAY }, 0);
  const late = makeChore({ name: "Bathroom", everyDays: 7, lastDoneAt: NOW - 9 * DAY }, 0);
  assert.equal(nudge([due], NOW, false), null);
  assert.deepEqual(nudge([due, late], NOW, false)?.vars, { name: "Bathroom" });
  assert.equal(nudge([late], NOW, true), null, "low energy leaves harder chores unmentioned");
});

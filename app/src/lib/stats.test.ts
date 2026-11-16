import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChore } from "./chores.ts";
import { atLocal } from "./dates.ts";
import type { Activity } from "./model.ts";
import { recentWin, trendUp, waitingLongest, weeklyCounts } from "./stats.ts";

const TODAY = "2026-11-18"; // a Wednesday
const NOW = atLocal(TODAY, "12:00");
const DAY = 86_400_000;

let n = 0;
const entry = (day: string, fields: Partial<Activity> = {}): Activity => ({
  id: `a${++n}`,
  at: atLocal(day, "10:00"),
  type: "done",
  itemId: "x",
  text: "Thing",
  points: 5,
  ...fields,
});

test("completions are counted by week, with steps and rewards left out", () => {
  const log = [
    entry("2026-11-16"),
    entry("2026-11-18", { type: "chore" }),
    entry("2026-11-18", { type: "step" }),
    entry("2026-11-18", { type: "reward", points: -10 }),
    entry("2026-11-15"),
    entry("2026-10-01"),
  ];
  const counts = weeklyCounts(log, TODAY, 4);
  assert.deepEqual(counts, [
    { week: "2026-10-26", count: 0 },
    { week: "2026-11-02", count: 0 },
    { week: "2026-11-09", count: 1 },
    { week: "2026-11-16", count: 2 },
  ]);
  assert.equal(weeklyCounts([], TODAY).length, 8);
});

test("only a rising week is remarked on", () => {
  const weeks = (before: number, now: number) => [
    { week: "a", count: before },
    { week: "b", count: now },
  ];
  assert.equal(trendUp(weeks(2, 5)), 5);
  assert.equal(trendUp(weeks(5, 5)), null);
  assert.equal(trendUp(weeks(9, 4)), null);
  assert.equal(trendUp(weeks(0, 2)), null, "too few to call a trend");
  assert.equal(trendUp([]), null);
});

test("the chores waiting longest are those furthest past their interval", () => {
  const chores = [
    makeChore({ name: "Fresh", everyDays: 7, lastDoneAt: NOW - 2 * DAY }, 0),
    makeChore({ name: "Oven", everyDays: 30, lastDoneAt: NOW - 45 * DAY }, 0),
    makeChore({ name: "Dishes", everyDays: 1, lastDoneAt: NOW - 4 * DAY }, 0),
    makeChore({ name: "Never", everyDays: 7 }, 0),
  ];
  assert.deepEqual(
    waitingLongest(chores, NOW).map((row) => [row.chore.name, row.days]),
    [
      ["Dishes", 4],
      ["Oven", 45],
    ],
  );
});

test("the companion remembers the biggest recent win, never today's", () => {
  const log = [
    entry("2026-11-10", { text: "Taxes", points: 14 }),
    entry("2026-11-15", { text: "Dishes", points: 5, type: "chore" }),
    entry("2026-11-18", { text: "Today's", points: 99 }),
    entry("2026-10-01", { text: "Too old", points: 50 }),
    entry("2026-11-12", { text: "Movie", points: -40, type: "reward" }),
  ];
  assert.deepEqual(recentWin(log, NOW), { name: "Taxes", days: 8 });
  assert.equal(recentWin([entry(TODAY)], NOW), null);
});

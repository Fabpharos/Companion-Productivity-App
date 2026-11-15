import assert from "node:assert/strict";
import { test } from "node:test";
import { daysSince, describeEvery, describeSince, dueness, hue, makeChore, parseChore, spin, visibleChores } from "./chores.ts";
import type { Chore } from "./model.ts";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 14, 12).getTime();
const chore = (name: string, everyDays: number, doneDaysAgo: number | null, fields: Partial<Chore> = {}) =>
  makeChore({ name, everyDays, lastDoneAt: doneDaysAgo === null ? null : NOW - doneDaysAgo * DAY, ...fields }, 0);

test("a chore is measured by days since it was done against its interval", () => {
  assert.equal(daysSince(chore("a", 7, 3), NOW), 3);
  assert.equal(dueness(chore("a", 7, 0), NOW), 0);
  assert.equal(dueness(chore("a", 7, 7), NOW), 1);
  assert.equal(dueness(chore("a", 7, 14), NOW), 2);
  assert.equal(dueness(chore("never", 7, null), NOW), 1, "a chore never done counts as due");
});

test("days are calendar days, not 24-hour periods", () => {
  const lateLastNight = makeChore({ name: "a", lastDoneAt: new Date(2026, 10, 13, 23, 50).getTime() }, 0);
  assert.equal(daysSince(lateLastNight, new Date(2026, 10, 14, 0, 10).getTime()), 1);
});

test("colour runs from green through yellow to red", () => {
  assert.equal(hue(chore("a", 7, 0), NOW), 140);
  assert.equal(hue(chore("a", 7, 7), NOW), 60);
  assert.equal(hue(chore("a", 4, 7), NOW), 0);
  assert.equal(hue(chore("a", 1, 30), NOW), 0);
});

test("descriptions read plainly", () => {
  assert.equal(describeSince(chore("a", 7, null), NOW), "Not done yet");
  assert.equal(describeSince(chore("a", 7, 0), NOW), "Done today");
  assert.equal(describeSince(chore("a", 7, 1), NOW), "Done yesterday");
  assert.equal(describeSince(chore("a", 7, 9), NOW), "9 days ago");
  assert.deepEqual([1, 7, 14, 30, 3].map(describeEvery), ["Daily", "Weekly", "Every 2 weeks", "Monthly", "Every 3 days"]);
});

test("the list shows the most due first, and only easy chores in low-energy mode", () => {
  const chores = [chore("fresh", 7, 1), chore("late", 7, 20, { effort: 3 }), chore("due", 7, 7, { effort: 1 })];
  assert.deepEqual(
    visibleChores(chores, false, NOW).map((c) => c.name),
    ["late", "due", "fresh"],
  );
  assert.deepEqual(
    visibleChores(chores, true, NOW).map((c) => c.name),
    ["due"],
  );
});

test("roulette favours the most overdue", () => {
  const chores = [chore("fresh", 7, 0), chore("late", 7, 21)];
  // Weights are 0.04 and 9, so "fresh" holds well under 1% of the wheel.
  assert.equal(spin(chores, NOW, 0)?.name, "fresh");
  assert.equal(spin(chores, NOW, 0.01)?.name, "late");
  assert.equal(spin(chores, NOW, 0.999)?.name, "late");
  assert.equal(spin([], NOW, 0.5), null);
});

test("a typed chore can say how often", () => {
  assert.deepEqual(parseChore("Vacuum"), { name: "Vacuum", everyDays: 7 });
  assert.deepEqual(parseChore("Dishes daily"), { name: "Dishes", everyDays: 1 });
  assert.deepEqual(parseChore("Change sheets every 2 weeks"), { name: "Change sheets", everyDays: 14 });
  assert.deepEqual(parseChore("Clean fridge monthly"), { name: "Clean fridge", everyDays: 30 });
  assert.deepEqual(parseChore("Water plants every 3 days"), { name: "Water plants", everyDays: 3 });
  assert.deepEqual(parseChore("Mop every week"), { name: "Mop", everyDays: 7 });
  assert.equal(parseChore("   "), null);
  assert.deepEqual(parseChore("weekly"), { name: "weekly", everyDays: 7 }, "a name is never swallowed whole");
});

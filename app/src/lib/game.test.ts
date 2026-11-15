import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChore } from "./chores.ts";
import {
  bondFor,
  chorePoints,
  itemPoints,
  levelFor,
  makeDailyQuests,
  makeWeeklyQuest,
  milestones,
  questState,
  remainingChorePoints,
  stepPoints,
  streakFor,
  summarize,
} from "./game.ts";
import { makeItem } from "./items.ts";
import { TODOS, type Activity, type Chore, type Quest } from "./model.ts";

const DAY = 86_400_000;
const TODAY = "2026-11-14"; // a Saturday
const NOW = new Date(2026, 10, 14, 12).getTime();
const at = (date: string) => new Date(`${date}T12:00:00`).getTime();
const chore = (everyDays: number, doneDaysAgo: number | null, fields: Partial<Chore> = {}) =>
  makeChore({ name: "c", everyDays, lastDoneAt: doneDaysAgo === null ? null : NOW - doneDaysAgo * DAY, ...fields }, 0);
let seq = 0;
const entry = (date: string, type: Activity["type"], points: number, itemId = "x"): Activity => ({
  id: `e${++seq}`,
  at: at(date),
  type,
  itemId,
  text: "",
  points,
});

test("chore points follow effort, with bonuses for overdue and disliked", () => {
  assert.deepEqual([1, 2, 3].map((effort) => chorePoints(chore(7, 7, { effort: effort as 1 | 2 | 3 }), NOW)), [5, 10, 20]);
  assert.equal(chorePoints(chore(7, 8), NOW), 15, "overdue adds half");
  assert.equal(chorePoints(chore(7, 14), NOW), 20, "a whole interval overdue doubles it");
  assert.equal(chorePoints(chore(7, 7, { dislike: 1 }), NOW), 15);
  assert.equal(chorePoints(chore(7, 14, { dislike: 2 }), NOW), 30, "bonuses add up");
  assert.equal(chorePoints(chore(7, null), NOW), 10, "the first time is worth the base");
});

test("redoing a chore straight away earns a token point", () => {
  assert.equal(chorePoints(chore(7, 0), NOW), 1);
  assert.equal(chorePoints(chore(7, 1), NOW), 1);
  assert.equal(chorePoints(chore(7, 2), NOW), 10);
  assert.equal(chorePoints(chore(1, 0), NOW), 1, "a daily chore pays once a day");
  assert.equal(chorePoints(chore(1, 1), NOW), 10);
});

test("steps share a chore's points and the rest is paid on completion", () => {
  const steps = ["a", "b", "c"].map((id, index) => ({ id, text: id, done: index < 2 }));
  const withSteps = chore(7, 7, { steps });
  assert.equal(stepPoints(withSteps, NOW), 3);
  assert.equal(remainingChorePoints(withSteps, NOW), 4, "10 less two steps of 3");
  assert.equal(remainingChorePoints(chore(7, 7), NOW), 10);
});

test("to-dos earn by priority and lateness, shopping a point, notes nothing", () => {
  const item = (fields: object) => makeItem({ kind: "todo", listId: TODOS, text: "t", ...fields }, 0);
  assert.equal(itemPoints(item({}), TODAY), 5);
  assert.equal(itemPoints(item({ priority: 3 }), TODAY), 11);
  assert.equal(itemPoints(item({ due: "2026-11-13" }), TODAY), 8);
  assert.equal(itemPoints(item({ due: TODAY }), TODAY), 5);
  assert.equal(itemPoints(item({ kind: "shopping" }), TODAY), 1);
  assert.equal(itemPoints(item({ kind: "note" }), TODAY), 0);
});

test("levels need a little more each time", () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, span: 50 });
  assert.deepEqual(levelFor(49), { level: 1, into: 49, span: 50 });
  assert.deepEqual(levelFor(50), { level: 2, into: 0, span: 100 });
  assert.deepEqual(levelFor(149), { level: 2, into: 99, span: 100 });
  assert.deepEqual(levelFor(150), { level: 3, into: 0, span: 150 });
  assert.equal(bondFor(4, 2).level, 2, "bond counts completions and days together");
});

test("a streak counts back from today, and today not being done yet does not break it", () => {
  const days = (...list: string[]) => new Set(list);
  assert.deepEqual(streakFor(days(), TODAY), { days: 0, pending: true, graceLeft: 1 });
  assert.equal(streakFor(days(TODAY), TODAY).days, 1);
  assert.deepEqual(streakFor(days("2026-11-13", "2026-11-12"), TODAY), { days: 2, pending: true, graceLeft: 1 });
  assert.equal(streakFor(days(TODAY, "2026-11-13", "2026-11-12"), TODAY).days, 3);
});

test("one missed day a week is forgiven, a second is not", () => {
  const days = (...list: string[]) => new Set(list);
  // Thursday the 12th missed.
  assert.deepEqual(streakFor(days(TODAY, "2026-11-13", "2026-11-11", "2026-11-10"), TODAY), { days: 4, pending: false, graceLeft: 0 });
  // Thursday and Wednesday both missed: the streak starts again on Friday.
  assert.deepEqual(streakFor(days(TODAY, "2026-11-13", "2026-11-10"), TODAY), { days: 2, pending: false, graceLeft: 1 });
  // A miss in each of two weeks is covered by each week's own grace. Monday is the 9th.
  const twoWeeks = days(TODAY, "2026-11-13", "2026-11-11", "2026-11-10", "2026-11-09", "2026-11-08", "2026-11-06");
  assert.equal(streakFor(twoWeeks, TODAY).days, 7);
  // Missing yesterday with nothing done yet today leaves the streak alive on grace.
  assert.deepEqual(streakFor(days("2026-11-12", "2026-11-11"), TODAY), { days: 2, pending: true, graceLeft: 0 });
});

test("daily quests come from what is overdue, then general goals", () => {
  const late = makeChore({ name: "Bathroom", everyDays: 7, lastDoneAt: NOW - 20 * DAY }, 0);
  const fresh = makeChore({ name: "Dishes", everyDays: 7, lastDoneAt: NOW }, 0);
  const todo = makeItem({ kind: "todo", listId: TODOS, text: "Pay rent", due: "2026-11-10" }, 0);
  const future = makeItem({ kind: "todo", listId: TODOS, text: "Later", due: "2026-12-01" }, 0);
  const texts = (quests: Quest[]) => quests.map((quest) => quest.text);

  assert.deepEqual(texts(makeDailyQuests([fresh, late], [future, todo], TODAY, NOW)), ['Do "Bathroom"', 'Finish "Pay rent"', "Complete 3 things"]);
  assert.deepEqual(texts(makeDailyQuests([fresh], [future], TODAY, NOW)), ["Do any chore", "Complete 3 things", "Earn 20 points"]);
  assert.deepEqual(texts(makeDailyQuests([], [], TODAY, NOW)), ["Complete 3 things", "Earn 20 points"]);
  assert.equal(makeWeeklyQuest([]).text, "Complete 10 things this week");
  assert.equal(makeWeeklyQuest([fresh, late]).text, "Do 3 chores this week");
  assert.equal(makeWeeklyQuest(Array(12).fill(fresh)).text, "Do 7 chores this week");
});

test("quest progress is read from the log", () => {
  const quest = (kind: Quest["kind"], ref: string | null, target: number): Quest => ({ id: "q", kind, ref, target, text: "", bonus: 5 });
  const log = [entry(TODAY, "chore", 10, "c1"), entry(TODAY, "step", 3, "c2"), entry(TODAY, "done", 5, "i1"), entry(TODAY, "done", 1, "i2")];
  assert.equal(questState(quest("chore", "c1", 1), log).done, true);
  assert.equal(questState(quest("chore", "c2", 1), log).done, false, "a step is not the whole chore");
  assert.equal(questState(quest("item", "i1", 1), log).done, true);
  assert.deepEqual([questState(quest("count", null, 5), log).have, questState(quest("count", null, 3), log).done], [3, true]);
  assert.deepEqual([questState(quest("points", null, 20), log).have, questState(quest("points", null, 19), log).done], [19, true]);
  assert.equal(questState(quest("chores", null, 2), log).have, 1);
});

test("the summary adds up points, quest bonuses and spending", () => {
  const sets = [
    { id: "d:2026-11-13", quests: [{ id: "a", kind: "count" as const, ref: null, target: 1, text: "", bonus: 5 }] },
    { id: `d:${TODAY}`, quests: [{ id: "b", kind: "points" as const, ref: null, target: 20, text: "Earn 20 points", bonus: 5 }] },
    { id: "w:2026-11-09", quests: [{ id: "w", kind: "chores" as const, ref: null, target: 2, text: "", bonus: 25 }] },
  ];
  const log = [entry("2026-11-13", "chore", 10), entry(TODAY, "chore", 20), entry(TODAY, "reward", -30)];
  const game = summarize(log, sets, TODAY);
  assert.equal(game.earned, 10 + 20 + 5 + 5 + 25);
  assert.equal(game.balance, 65 - 30);
  assert.equal(game.today, 25);
  assert.equal(game.level.level, 2);
  assert.equal(game.streak.days, 2);
  assert.deepEqual([game.daily[0]?.done, game.weekly?.done, game.weekly?.have], [true, true, 2]);

  // Taking back today's chore takes back its points, both bonuses it completed, and the streak day.
  const undone = summarize(log.filter((e) => e.points !== 20), sets, TODAY);
  assert.deepEqual([undone.earned, undone.balance, undone.today, undone.streak.days], [15, -15, 0, 1]);
});

test("milestones report what a completion newly reached", () => {
  const sets = [{ id: `d:${TODAY}`, quests: [{ id: "b", kind: "count" as const, ref: null, target: 1, text: "Complete 1 thing", bonus: 5 }] }];
  const before = summarize([entry("2026-11-13", "done", 44), entry("2026-11-12", "done", 0)], sets, TODAY);
  const after = summarize([entry("2026-11-13", "done", 44), entry("2026-11-12", "done", 0), entry(TODAY, "done", 5)], sets, TODAY);
  assert.deepEqual(milestones(before, after), [
    { type: "levelUp", level: 2 },
    { type: "streak", days: 3 },
    { type: "bond", level: 2 },
    { type: "quest", text: "Complete 1 thing", bonus: 5 },
  ]);
  assert.deepEqual(milestones(after, after), []);
});

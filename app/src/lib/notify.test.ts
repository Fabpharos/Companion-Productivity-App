import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_STYLE } from "../../content/dialogue.ts";
import { makeChore } from "./chores.ts";
import { atLocal } from "./dates.ts";
import { makeItem } from "./items.ts";
import { DEFAULT_SETTINGS, TODOS, type Activity, type Item, type NotifySettings, type Settings } from "./model.ts";
import { afterQuiet, badgeCount, plan, PRIVATE_BODY, PRIVATE_TITLE, toReminders, type PlanInput } from "./notify.ts";
import { makeEntry, makeTrip } from "./trips.ts";

const TODAY = "2026-11-16"; // a Monday
const NOW = atLocal(TODAY, "06:00");
const DAY = 86_400_000;
const voice = { style: DEFAULT_STYLE, bond: 1 };

const settings = (notify: Partial<NotifySettings> = {}, rest: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  lastBackupAt: NOW,
  ...rest,
  notify: { ...DEFAULT_SETTINGS.notify, ...notify },
});
const input = (fields: Partial<PlanInput> = {}): PlanInput => ({
  items: [],
  chores: [],
  activity: [],
  trips: [],
  tripEntries: [],
  settings: settings(),
  ...fields,
});
const todo = (text: string, fields: Partial<Item> = {}) => makeItem({ kind: "todo", listId: TODOS, text, ...fields }, NOW - 5 * DAY);
const done = (day: string): Activity => ({ id: `a:${day}`, at: atLocal(day, "12:00"), type: "done", itemId: "x", text: "x", points: 5 });
const only = (kind: string, list: ReturnType<typeof plan>) => list.filter((entry) => entry.kind === kind);
const when = (day: string, time: string) => atLocal(day, time);

test("nothing stored means nothing planned", () => {
  assert.deepEqual(plan(input(), NOW, voice), []);
});

test("a to-do with a due date and a time is reminded at that time, and opens on itself", () => {
  const call = todo("Call the bank\nask about fees", { due: TODAY, time: "14:30" });
  const items = [call, todo("No time", { due: TODAY }), todo("Done", { due: TODAY, time: "15:00", doneAt: NOW }), todo("Far", { due: "2026-12-25", time: "09:00" })];
  const tasks = only("task", plan(input({ items }), NOW, voice));
  assert.equal(tasks.length, 1);
  assert.deepEqual([tasks[0]?.at, tasks[0]?.title, tasks[0]?.open, tasks[0]?.badge], [when(TODAY, "14:30"), "Call the bank", `#/item/${call.id}`, 2]);
  assert.ok(DEFAULT_STYLE.lines.pushTask.includes(tasks[0]!.body));
  assert.equal(only("task", plan(input({ items: [call] }), when(TODAY, "14:31"), voice)).length, 1, "kept until the Worker has had time to send it");
  assert.deepEqual(only("task", plan(input({ items: [call] }), when(TODAY, "14:34"), voice)), [], "then dropped");
});

test("the wording of a notification does not change from one list to the next", () => {
  const items = [todo("A", { due: TODAY, time: "14:30" })];
  assert.deepEqual(plan(input({ items }), NOW, voice), plan(input({ items }), NOW + 60_000, voice));
});

test("the morning summary says what the day holds, and stays away when it holds nothing", () => {
  const items = [todo("Pay rent", { due: TODAY, focusOn: TODAY }), todo("Book flights", { due: "2026-11-14" }), todo("Later", { due: "2026-11-18" })];
  const chores = [makeChore({ name: "Dishes", everyDays: 1, lastDoneAt: NOW - 2 * DAY }, 0)];
  const trips = [makeTrip({ name: "Japan", start: "2027-02-26", end: "2027-03-08" }, 0)];
  const mornings = only("morning", plan(input({ items, chores, trips }), NOW, voice));
  assert.equal(mornings.length, 14);
  assert.deepEqual([mornings[0]?.at, mornings[0]?.open], [when(TODAY, "08:00"), "#/today"]);
  assert.equal(mornings[0]?.body, "Today: Pay rent. 1 due today. 1 still open from earlier. 1 chore ready. Japan in 102 days.");
  assert.equal(mornings[2]?.body, "1 due today. 2 still open from earlier. 1 chore ready. Japan in 100 days.");
  assert.ok(DEFAULT_STYLE.lines.pushMorning.includes(mornings[0]!.title));

  assert.deepEqual(only("morning", plan(input({ items: [todo("No date")] }), NOW, voice)), []);
  assert.equal(only("morning", plan(input({ items }), when(TODAY, "09:00"), voice))[0]?.at, when("2026-11-17", "08:00"), "today's has passed");
});

test("while travelling the morning summary leads with the day's stops and leaves chores out", () => {
  const trip = makeTrip({ name: "Japan", start: "2026-11-17", end: "2026-11-20" }, 0);
  const tripEntries = [
    makeEntry(trip.id, "stop", "Dinner", { day: "2026-11-18", time: "19:00" }, 1),
    makeEntry(trip.id, "stop", "Senso-ji", { day: "2026-11-18", time: "09:30" }, 2),
  ];
  const chores = [makeChore({ name: "Dishes", everyDays: 1, lastDoneAt: atLocal("2026-11-16", "05:00") }, 0)];
  const list = plan(input({ trips: [trip], tripEntries, chores }), NOW, voice);
  const mornings = only("morning", list);
  assert.equal(mornings[1]?.body, "Japan, day 1 of 4.");
  assert.equal(mornings[2]?.body, "Japan, day 2 of 4. First: 09:30 Senso-ji. 2 stops today.");
  assert.deepEqual(only("chore", list), [], "the chore goes past due during the trip");
});

test("a chore is mentioned once, on the day it goes past due", () => {
  const dishes = makeChore({ name: "Dishes", everyDays: 3, lastDoneAt: atLocal("2026-11-15", "20:00"), effort: 1 }, 0);
  const sheets = makeChore({ name: "Sheets", everyDays: 3, lastDoneAt: atLocal("2026-11-15", "09:00"), effort: 3 }, 0);
  const never = makeChore({ name: "Windows", everyDays: 30 }, 0);
  const old = makeChore({ name: "Oven", everyDays: 7, lastDoneAt: NOW - 30 * DAY }, 0);

  const one = only("chore", plan(input({ chores: [dishes, never, old] }), NOW, voice));
  assert.deepEqual(one.map((entry) => [entry.at, entry.title, entry.open]), [[when("2026-11-19", "17:00"), "Dishes", "#/chores"]]);
  assert.ok(DEFAULT_STYLE.lines.pushChore.includes(one[0]!.body));

  const two = only("chore", plan(input({ chores: [dishes, sheets] }), NOW, voice));
  assert.deepEqual([two.length, two[0]?.title], [1, "Chores"]);
  assert.match(two[0]!.body, /Dishes and Sheets/);

  const low = only("chore", plan(input({ chores: [dishes, sheets], settings: settings({}, { lowEnergy: true }) }), NOW, voice));
  assert.equal(low[0]?.title, "Dishes", "only easy chores in low-energy mode");
});

test("the streak saver comes only on an evening that would shorten the streak", () => {
  // Thursday to Sunday done, nothing yet on Monday: the new week's grace covers today.
  const run = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"].map(done);
  assert.deepEqual(only("streak", plan(input({ activity: run }), NOW, voice)), []);

  // Wednesday: Monday was skipped, so this week's grace is spent and tonight matters.
  const wednesday = "2026-11-18";
  const spent = [...run, done("2026-11-17")];
  const saver = only("streak", plan(input({ activity: spent }), when(wednesday, "06:00"), voice));
  assert.deepEqual(saver.map((entry) => [entry.at, entry.title]), [[when(wednesday, "20:00"), "5 days running"]]);
  assert.match(saver[0]!.body, /5 days/);

  // Something done on Wednesday: the reminder moves to Thursday evening.
  const moved = only("streak", plan(input({ activity: [...spent, done(wednesday)] }), when(wednesday, "13:00"), voice));
  assert.deepEqual(moved.map((entry) => entry.at), [when("2026-11-19", "20:00")]);

  assert.deepEqual(only("streak", plan(input({ activity: [done("2026-11-17")] }), when(wednesday, "06:00"), voice)), [], "one day is not a streak");
});

test("a trip's tasks are announced on the day they are due, and its countdown only without the morning summary", () => {
  const trip = makeTrip({ name: "Japan", start: "2026-12-16", end: "2026-12-26", outfit: "kimono" }, 0);
  const tripEntries = [
    makeEntry(trip.id, "task", "Order eSIM", { daysBefore: 28 }, 1),
    makeEntry(trip.id, "task", "Tell the bank", { daysBefore: 28 }, 2),
    makeEntry(trip.id, "task", "Already done", { daysBefore: 28, done: true }, 3),
    makeEntry(trip.id, "task", "Pack", { daysBefore: 1 }, 4),
  ];
  const withSummary = only("trip", plan(input({ trips: [trip], tripEntries }), NOW, voice));
  assert.deepEqual(withSummary.map((entry) => [entry.at, entry.title, entry.open]), [[when("2026-11-18", "12:30"), "Japan", `#/trips/${trip.id}/tasks`]]);
  assert.match(withSummary[0]!.body, /Order eSIM and Tell the bank/);

  const noMorning = settings({ kinds: { ...DEFAULT_SETTINGS.notify.kinds, morning: false } });
  const alone = only("trip", plan(input({ trips: [trip], settings: noMorning }), NOW, voice));
  assert.deepEqual(alone.map((entry) => [entry.at, entry.title]), [[when("2026-11-16", "08:00"), "Japan"]]);
  assert.match(alone[0]!.body, /30 days/);
});

test("the backup reminder comes once, two weeks after the last backup or when a snooze ends", () => {
  const items = [todo("x")];
  const last = atLocal("2026-11-05", "15:00");
  const backups = (rest: Partial<Settings>) => only("backup", plan(input({ items, settings: settings({}, rest) }), NOW, voice));
  assert.deepEqual(backups({ lastBackupAt: last }).map((entry) => [entry.at, entry.open]), [[when("2026-11-20", "11:00"), "#/settings"]]);
  assert.deepEqual(backups({ lastBackupAt: last, backupSnoozedUntil: atLocal("2026-11-22", "09:00") }).map((entry) => entry.at), [when("2026-11-22", "11:00")]);
  assert.deepEqual(backups({ lastBackupAt: NOW - 40 * DAY }), [], "already due: the banner in the app covers it");
  assert.deepEqual(only("backup", plan(input({ settings: settings({}, { lastBackupAt: last }) }), NOW, voice)), [], "nothing to back up");
});

test("quiet hours hold a notification until they end", () => {
  assert.equal(afterQuiet(when(TODAY, "23:15"), "22:00", "07:00"), when("2026-11-17", "07:00"));
  assert.equal(afterQuiet(when(TODAY, "03:00"), "22:00", "07:00"), when(TODAY, "07:00"));
  assert.equal(afterQuiet(when(TODAY, "07:00"), "22:00", "07:00"), when(TODAY, "07:00"));
  assert.equal(afterQuiet(when(TODAY, "13:30"), "13:00", "14:00"), when(TODAY, "14:00"));
  assert.equal(afterQuiet(when(TODAY, "03:00"), "09:00", "09:00"), when(TODAY, "03:00"), "the same time twice means none");

  const late = todo("Take medicine", { due: TODAY, time: "23:30" });
  assert.equal(only("task", plan(input({ items: [late] }), NOW, voice))[0]?.at, when("2026-11-17", "07:00"));
});

test("the daily cap holds back nudges, never a task reminder or the morning summary", () => {
  const trip = makeTrip({ name: "Japan", start: "2026-12-16", end: "2026-12-26" }, 0);
  const fields: Partial<PlanInput> = {
    items: [todo("Call", { due: "2026-11-18", time: "10:00" })],
    chores: [makeChore({ name: "Dishes", everyDays: 1, lastDoneAt: atLocal("2026-11-16", "05:00") }, 0)],
    trips: [trip],
    tripEntries: [makeEntry(trip.id, "task", "Order eSIM", { daysBefore: 28 }, 1)],
    activity: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-17"].map(done),
  };
  const wednesday = when("2026-11-18", "06:00");
  const on = (cap: number) =>
    plan(input({ ...fields, settings: settings({ dailyCap: cap }) }), wednesday, voice)
      .filter((entry) => entry.at < when("2026-11-19", "00:00"))
      .map((entry) => entry.kind);
  assert.deepEqual(on(3), ["morning", "task", "trip", "chore", "streak"]);
  assert.deepEqual(on(1), ["morning", "task", "trip"]);
  assert.deepEqual(on(0), ["morning", "task"]);
});

test("a kind that is switched off is left out", () => {
  const items = [todo("Call", { due: TODAY, time: "10:00" }), todo("Due", { due: TODAY })];
  const kinds = { ...DEFAULT_SETTINGS.notify.kinds, task: false };
  assert.deepEqual([...new Set(plan(input({ items, settings: settings({ kinds }) }), NOW, voice).map((entry) => entry.kind))], ["morning"]);
});

test("private text sends no wording, only that there is a reminder", () => {
  const call = todo("Call the clinic", { due: TODAY, time: "10:00" });
  const list = plan(input({ items: [call], settings: settings({ privateText: true }) }), NOW, voice);
  assert.ok(list.length > 1);
  for (const reminder of toReminders(list)) {
    assert.deepEqual([reminder.title, reminder.body], [PRIVATE_TITLE, PRIVATE_BODY]);
    assert.doesNotMatch(JSON.stringify(reminder), /clinic/i);
  }
});

test("the Worker is given a time, the text, where to open and the badge, and nothing else", () => {
  const call = todo("Call", { due: TODAY, time: "10:00" });
  const [first] = toReminders(only("task", plan(input({ items: [call, todo("Old", { due: "2026-11-01" })] }), NOW, voice)));
  assert.deepEqual(Object.keys(first!).sort(), ["at", "badge", "body", "id", "title", "url"]);
  assert.deepEqual([first?.id, first?.url, first?.badge], [`task:${call.id}:${TODAY}`, `./#/item/${call.id}`, 2]);
  assert.equal(badgeCount([call, todo("Later", { due: "2026-11-30" }), todo("None")], TODAY), 1);
});

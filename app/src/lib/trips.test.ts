import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERAL, JAPAN } from "../../content/trips.ts";
import { makeCalendar } from "./ics.ts";
import { fetchRate } from "./rates.ts";
import {
  byCategory,
  countdown,
  currentTrip,
  formatMoney,
  fromTemplate,
  itinerary,
  makeEntry,
  makeTrip,
  mapLink,
  moveTrip,
  parseAmount,
  spending,
  tasksComingDue,
  tasksView,
  travellingOn,
  tripDays,
} from "./trips.ts";

const japan = makeTrip({ name: "Japan", start: "2027-02-26", end: "2027-03-08", localCurrency: "JPY", rate: 160, budget: 3000 }, 0);
let clock = 0;
const entry = (kind: Parameters<typeof makeEntry>[1], text: string, fields: Parameters<typeof makeEntry>[3] = {}) =>
  makeEntry(japan.id, kind, text, fields, ++clock);

test("a trip counts down, then counts its days, then is over", () => {
  assert.equal(tripDays(japan).length, 11);
  assert.deepEqual(countdown(japan, "2026-11-15"), { phase: "upcoming", days: 103, text: "in 103 days" });
  assert.equal(countdown(japan, "2027-02-25").text, "tomorrow");
  assert.deepEqual(countdown(japan, "2027-02-26"), { phase: "underway", days: 0, text: "day 1 of 11" });
  assert.equal(countdown(japan, "2027-03-08").text, "day 11 of 11");
  assert.equal(countdown(japan, "2027-03-09").phase, "over");
  assert.equal(makeTrip({ name: "x", start: "2027-03-08", end: "2027-03-01" }, 0).end, "2027-03-08", "a trip cannot end before it starts");
});

test("the current trip is the one under way, else the next to start", () => {
  const weekend = makeTrip({ name: "Weekend", start: "2026-12-05", end: "2026-12-06" }, 0);
  const old = makeTrip({ name: "Old", start: "2026-01-01", end: "2026-01-05" }, 0);
  assert.equal(currentTrip([japan, old, weekend], "2026-11-15")?.name, "Weekend");
  assert.equal(currentTrip([japan, old, weekend], "2026-12-06")?.name, "Weekend");
  assert.equal(currentTrip([japan, old, weekend], "2026-12-07")?.name, "Japan");
  assert.equal(currentTrip([old], "2026-11-15"), null);
  assert.equal(travellingOn([japan, weekend], "2026-11-15"), null);
  assert.equal(travellingOn([japan, weekend], "2027-03-01")?.name, "Japan");
});

test("a template fills a new trip, and Japan adds to the general one", () => {
  const general = fromTemplate(GENERAL, "t", 1000);
  const forJapan = fromTemplate(JAPAN, "t", 1000);
  const count = (list: typeof general, kind: string) => list.filter((e) => e.kind === kind).length;
  assert.ok(count(general, "packing") > 10 && count(general, "task") >= 8);
  assert.equal(count(general, "phrase"), 0);
  assert.ok(count(forJapan, "packing") > count(general, "packing"));
  assert.ok(count(forJapan, "task") > count(general, "task"));
  assert.ok(count(forJapan, "phrase") >= 20);
  const phrase = forJapan.find((e) => e.text === "すみません");
  assert.deepEqual([phrase?.category, phrase?.reading, phrase?.meaning], ["Basics", "Sumimasen", "Excuse me / Sorry"]);
  assert.equal(new Set(forJapan.map((e) => e.createdAt)).size, forJapan.length, "each entry keeps its place in the order");
  assert.deepEqual(byCategory(forJapan, "t", "packing").map((g) => g.name), ["Documents", "Clothes", "Toiletries", "Electronics", "Other"]);
});

test("tasks are due a number of days before departure", () => {
  const entries = [entry("task", "bank", { daysBefore: 7 }), entry("task", "passport", { daysBefore: 60 }), entry("task", "done", { daysBefore: 90, done: true })];
  const rows = tasksView(japan, entries, "2027-01-01");
  assert.deepEqual(
    rows.map((row) => [row.entry.text, row.due, row.late]),
    [
      ["passport", "2026-12-28", true],
      ["bank", "2027-02-19", false],
      ["done", "2026-11-28", false],
    ],
  );
  const later = { ...japan, start: "2027-03-05", end: "2027-03-15" };
  assert.equal(tasksView(later, entries, "2027-01-01")[1]?.due, "2027-02-26", "moving the trip moves its tasks");
});

test("Today is told about tasks that are late or due within a week", () => {
  const entries = [entry("task", "soon", { daysBefore: 100 }), entry("task", "late", { daysBefore: 120 }), entry("task", "far", { daysBefore: 7 })];
  assert.deepEqual(
    tasksComingDue([japan], entries, "2026-11-15").map((row) => row.entry.text),
    ["late", "soon"],
  );
  assert.deepEqual(tasksComingDue([japan], entries, "2027-03-01"), [], "nothing once the trip has started");
});

test("the itinerary has every day of the trip, stops in time order, and keeps stray stops", () => {
  const entries = [
    entry("stop", "Dinner", { day: "2027-02-27", time: "19:00" }),
    entry("stop", "Wander", { day: "2027-02-27" }),
    entry("stop", "Shrine", { day: "2027-02-27", time: "09:30" }),
    entry("stop", "Extra night", { day: "2027-03-09" }),
    entry("wish", "Not placed"),
  ];
  const days = itinerary(japan, entries);
  assert.equal(days.length, 12);
  assert.deepEqual([days[0]?.day, days[0]?.number, days[0]?.stops.length], ["2027-02-26", 1, 0]);
  assert.deepEqual(days[1]?.stops.map((stop) => stop.text), ["Shrine", "Dinner", "Wander"]);
  assert.deepEqual([days[11]?.day, days[11]?.number, days[11]?.stops[0]?.text], ["2027-03-09", null, "Extra night"]);
});

test("moving a trip's start moves its stops with it and keeps its length", () => {
  const entries = [
    entry("stop", "Shrine", { day: "2027-02-27", time: "09:30" }),
    entry("expense", "Deposit", { day: "2026-12-01", amount: 5 }),
    entry("wish", "Somewhere"),
  ];
  const moved = moveTrip(japan, entries, "2027-03-05");
  assert.deepEqual([moved.trip.start, moved.trip.end], ["2027-03-05", "2027-03-15"]);
  assert.deepEqual(moved.stops.map((stop) => [stop.text, stop.day, stop.time]), [["Shrine", "2027-03-06", "09:30"]]);
  assert.equal(itinerary(moved.trip, moved.stops)[1]?.stops[0]?.text, "Shrine", "still on day 2");
});

test("a stop links to a maps app", () => {
  assert.equal(mapLink({ text: "Senso-ji", place: null }), "https://maps.apple.com/?q=Senso-ji");
  assert.equal(mapLink({ text: "Lunch", place: "Tsukiji Outer Market, Tokyo" }), "https://maps.apple.com/?q=Tsukiji%20Outer%20Market%2C%20Tokyo");
  assert.equal(mapLink({ text: "x", place: " https://maps.app.goo.gl/abc " }), "https://maps.app.goo.gl/abc");
});

test("spending adds up in both currencies against the budget", () => {
  const entries = [entry("expense", "Ramen", { amount: 1200 }), entry("expense", "Hotel", { amount: 46800 }), entry("stop", "not money", { amount: 999 })];
  assert.deepEqual(spending(japan, entries), { local: 48000, home: 300, left: 2700 });
  assert.deepEqual(spending({ ...japan, rate: null }, entries), { local: 48000, home: null, left: null });
  assert.deepEqual(spending({ ...japan, budget: null }, entries), { local: 48000, home: 300, left: null });
  assert.deepEqual(spending({ ...japan, localCurrency: "", rate: null }, entries), { local: 48000, home: 48000, left: -45000 }, "one currency needs no rate");
});

test("amounts are read and shown plainly", () => {
  assert.deepEqual(["1,200", " 12.50 ", "0", "abc", "-4"].map(parseAmount), [1200, 12.5, null, null, null]);
  assert.equal(formatMoney(1200, "JPY"), "¥1,200");
  assert.equal(formatMoney(12.5, "USD"), "$12.50");
  assert.equal(formatMoney(5, "not-a-code"), "5 not-a-code");
});

test("a calendar file has timed and all-day events, escaped", () => {
  const file = makeCalendar(
    [
      { uid: "a", title: "Shrine; then tea, maybe", date: "2027-02-27", time: "09:30", location: "Asakusa", notes: "Line one\nline two" },
      { uid: "b", title: "Wander", date: "2027-02-28" },
      { uid: "c", title: "Late show", date: "2027-02-28", time: "23:30", minutes: 90 },
    ],
    Date.UTC(2026, 10, 15, 8, 0, 0),
  );
  const lines = file.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-2), "END:VCALENDAR");
  assert.ok(file.includes("DTSTAMP:20261115T080000Z"));
  assert.ok(file.includes("DTSTART:20270227T093000\r\nDTEND:20270227T103000"), "no time zone: the time on the clock");
  assert.ok(file.includes("SUMMARY:Shrine\\; then tea\\, maybe"));
  assert.ok(file.includes("LOCATION:Asakusa") && file.includes("DESCRIPTION:Line one\\nline two"));
  assert.ok(file.includes("DTSTART;VALUE=DATE:20270228\r\nDTEND;VALUE=DATE:20270301"), "an all-day event ends the next day");
  assert.ok(file.includes("DTSTART:20270228T233000\r\nDTEND:20270301T010000"), "an event can run past midnight");
});

test("long calendar lines are folded at 75 bytes", () => {
  const file = makeCalendar([{ uid: "a", title: "寺".repeat(40), date: "2027-02-27" }], 0);
  for (const line of file.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(file.replace(/\r\n /g, "").match(/SUMMARY:(.*)/)?.[1], "寺".repeat(40), "unfolding gives the title back");
});

test("the rate comes from the first source that answers, and failure is reported", async () => {
  const calls: string[] = [];
  const answer = (rates: object | null) => async (url: string) => {
    calls.push(new URL(url).host);
    if (rates === null) throw new Error("offline");
    return { ok: true, json: async () => ({ rates }) };
  };
  assert.equal(await fetchRate("usd", "jpy", answer({ JPY: 160 })), 160);
  assert.deepEqual(calls, ["api.frankfurter.dev"]);
  assert.equal(await fetchRate("USD", "USD", answer(null)), 1, "the same currency needs no lookup");
  await assert.rejects(fetchRate("USD", "JPY", answer(null)), /No rate found/);
  await assert.rejects(fetchRate("USD", "JPY", answer({ EUR: 0.9 })), /No rate found/);
  await assert.rejects(fetchRate("dollars", "JPY", answer({})), /three-letter/);

  let first = true;
  const flaky = async (url: string) => {
    if (first) {
      first = false;
      return { ok: false, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ rates: { JPY: 158.5 } }) };
  };
  assert.equal(await fetchRate("USD", "JPY", flaky), 158.5, "the second source is used when the first fails");
});

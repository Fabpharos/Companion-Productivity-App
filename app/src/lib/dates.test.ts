import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, addMonths, daysBetween, describeDue, describeRepeat, isDate, localDate, nextDue } from "./dates.ts";

test("dates are local calendar days", () => {
  assert.equal(localDate(new Date(2026, 10, 14, 23, 59)), "2026-11-14");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-03-01", -1), "2027-02-28");
  assert.equal(daysBetween("2026-11-14", "2027-02-26"), 104);
  assert.equal(daysBetween("2026-11-14", "2026-11-10"), -4);
});

test("day arithmetic is right across a daylight-saving change", () => {
  assert.equal(addDays("2027-03-13", 1), "2027-03-14");
  assert.equal(addDays("2027-03-14", 1), "2027-03-15");
  assert.equal(daysBetween("2027-03-13", "2027-03-15"), 2);
});

test("adding months clamps to the end of a short month", () => {
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
});

test("isDate accepts only real dates", () => {
  assert.ok(isDate("2027-02-26"));
  assert.ok(!isDate("2027-02-30"));
  assert.ok(!isDate("26/02/2027"));
  assert.ok(!isDate(null));
});

test("a repeat moves to the first scheduled date after today", () => {
  const weekly = { every: 1, unit: "week" } as const;
  assert.equal(nextDue("2026-11-09", weekly, "2026-11-09"), "2026-11-16", "done on time");
  assert.equal(nextDue("2026-11-16", weekly, "2026-11-14"), "2026-11-23", "done early");
  assert.equal(nextDue("2026-10-05", weekly, "2026-11-14"), "2026-11-16", "done late skips missed weeks");
  assert.equal(nextDue(null, { every: 2, unit: "day" }, "2026-11-14"), "2026-11-16", "no due date counts from today");
});

test("a monthly repeat on the 31st does not drift", () => {
  const monthly = { every: 1, unit: "month" } as const;
  assert.equal(nextDue("2027-01-31", monthly, "2027-01-31"), "2027-02-28");
  assert.equal(nextDue("2027-01-31", monthly, "2027-03-01"), "2027-03-31");
  assert.equal(nextDue("2024-02-29", { every: 1, unit: "year" }, "2024-03-01"), "2025-02-28");
});

test("due dates read relative to today", () => {
  const today = "2026-11-14";
  assert.equal(describeDue(today, today), "Today");
  assert.equal(describeDue("2026-11-15", today), "Tomorrow");
  assert.equal(describeDue("2026-11-13", today), "Yesterday");
  assert.equal(describeDue("2026-11-10", today), "4 days ago");
  assert.equal(describeDue("2026-11-18", today), "Wednesday");
  assert.equal(describeDue("2026-11-28", today), "Sat, Nov 28");
  assert.equal(describeDue("2027-02-26", today), "Fri, Feb 26, 2027");
});

test("repeats read plainly", () => {
  assert.equal(describeRepeat({ every: 1, unit: "day" }), "Daily");
  assert.equal(describeRepeat({ every: 1, unit: "month" }), "Monthly");
  assert.equal(describeRepeat({ every: 2, unit: "week" }), "Every 2 weeks");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { grocerySection, parseCapture } from "./capture.ts";

const TODAY = "2026-11-14"; // a Saturday

const summary = (raw: string, force?: "note" | "todo" | "shopping") =>
  parseCapture(raw, TODAY, force).map((d) => `${d.kind}:${d.text}`);

test("groceries go to shopping with a store section", () => {
  const [draft] = parseCapture("Milk", TODAY);
  assert.equal(draft?.kind, "shopping");
  assert.equal(draft?.section, "Dairy & eggs");
});

test("quantities, units and plurals are seen through", () => {
  assert.equal(grocerySection("2 lbs chicken thighs"), "Meat & fish");
  assert.equal(grocerySection("a dozen eggs"), "Dairy & eggs");
  assert.equal(grocerySection("3x tomatoes"), "Produce");
  assert.equal(grocerySection("blueberries"), "Produce");
  assert.equal(grocerySection("2 rolls of paper towels"), "Household");
  assert.equal(grocerySection("rolls"), "Bakery");
});

test("the longest grocery phrase wins", () => {
  assert.equal(grocerySection("ice cream"), "Frozen");
  assert.equal(grocerySection("oat milk"), "Dairy & eggs");
  assert.equal(grocerySection("half and half"), "Dairy & eggs");
});

test("a list of groceries becomes one entry each", () => {
  assert.deepEqual(summary("milk, eggs and bread"), ["shopping:milk", "shopping:eggs", "shopping:bread"]);
  assert.deepEqual(summary("mac and cheese"), ["shopping:mac and cheese"]);
  assert.deepEqual(summary("milk, a new phone"), ["note:milk, a new phone"]);
});

test("a shopping lead-in is dropped when only groceries follow", () => {
  assert.deepEqual(summary("buy milk"), ["shopping:milk"]);
  assert.deepEqual(summary("we need some eggs, butter"), ["shopping:eggs", "shopping:butter"]);
  assert.deepEqual(summary("Buy a birthday card"), ["todo:Buy a birthday card"]);
});

test("a leading verb makes a to-do, even when a grocery follows", () => {
  assert.deepEqual(summary("Call the dentist"), ["todo:Call the dentist"]);
  assert.deepEqual(summary("return milk"), ["todo:return milk"]);
  assert.deepEqual(summary("water plants"), ["todo:water plants"]);
  assert.deepEqual(summary("water"), ["shopping:water"]);
});

test("a day word at the end of a to-do sets the due date", () => {
  const due = (raw: string) => parseCapture(raw, TODAY)[0];
  assert.deepEqual([due("pay rent tomorrow")?.text, due("pay rent tomorrow")?.due], ["pay rent", "2026-11-15"]);
  assert.equal(due("call mom today")?.due, TODAY);
  assert.equal(due("send report by Friday")?.due, "2026-11-20");
  assert.equal(due("send report by Friday")?.text, "send report");
  assert.equal(due("book flights saturday")?.due, "2026-11-21", "the same weekday means next week");
  assert.equal(due("plan trip next week")?.due, "2026-11-21");
  assert.equal(due("watch The Day After Tomorrow tonight")?.text, "watch The Day After Tomorrow");
});

test("everything else is a note, and day words in notes are left alone", () => {
  assert.deepEqual(summary("Felt great today"), ["note:Felt great today"]);
  assert.equal(parseCapture("Felt great today", TODAY)[0]?.due, null);
  assert.deepEqual(summary("wifi password is hunter2"), ["note:wifi password is hunter2"]);
});

test("hashtags become tags and leave the text", () => {
  const [draft] = parseCapture("Call plumber #Home #urgent #home", TODAY);
  assert.equal(draft?.text, "Call plumber");
  assert.deepEqual(draft?.tags, ["home", "urgent"]);
  assert.equal(parseCapture("issue #12 is fixed", TODAY)[0]?.tags[0], "12");
});

test("a forced kind keeps the text and skips the guessing", () => {
  assert.deepEqual(summary("milk", "note"), ["note:milk"]);
  assert.deepEqual(summary("milk tomorrow", "todo"), ["todo:milk"]);
  assert.deepEqual(summary("cat litter, mac and cheese", "shopping"), ["shopping:cat litter", "shopping:mac and cheese"]);
  assert.equal(parseCapture("cat litter", TODAY, "shopping")[0]?.section, "Other");
});

test("empty text makes nothing", () => {
  assert.deepEqual(parseCapture("   ", TODAY), []);
  assert.deepEqual(parseCapture("#tag", TODAY), []);
});

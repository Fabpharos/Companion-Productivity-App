import assert from "node:assert/strict";
import { test } from "node:test";
import { makeItem } from "./items.ts";
import { BUILTIN_LISTS, NOTES, SHOPPING, TODOS, type Item } from "./model.ts";
import { search, searchTrips } from "./search.ts";
import { makeEntry, makeTrip } from "./trips.ts";

let clock = 0;
const item = (kind: Item["kind"], listId: string, text: string, fields: Partial<Item> = {}) =>
  makeItem({ kind, listId, text, ...fields }, ++clock);

const items = [
  item("note", NOTES, "Passport renewal\nform DS-82, two photos", { tags: ["japan"] }),
  item("todo", TODOS, "Renew passport", { subtasks: [{ id: "s", text: "book photo appointment", done: false }] }),
  item("todo", TODOS, "Old passport errand", { doneAt: 5 }),
  item("shopping", SHOPPING, "Rice"),
];
const find = (query: string) => search(items, BUILTIN_LISTS, query).map((hit) => hit.item.text.split("\n")[0]);

test("finds text in any kind of item, archived ones last", () => {
  assert.deepEqual(find("passport"), ["Passport renewal", "Renew passport", "Old passport errand"]);
  assert.equal(search(items, BUILTIN_LISTS, "errand")[0]?.archived, true);
});

test("every word must match, in any order and any case", () => {
  assert.deepEqual(find("RENEW pass"), ["Renew passport", "Passport renewal"]);
  assert.deepEqual(find("passport rice"), []);
});

test("searches the body, steps, tags and list names", () => {
  assert.deepEqual(find("ds-82"), ["Passport renewal"]);
  assert.deepEqual(find("photo appointment"), ["Renew passport"]);
  assert.deepEqual(find("#jap"), ["Passport renewal"]);
  assert.deepEqual(find("japan"), ["Passport renewal"]);
  assert.deepEqual(find("shopping"), ["Rice"]);
});

test("trips are searched too, across every field of their entries", () => {
  const trip = makeTrip({ name: "Japan", start: "2027-02-26", end: "2027-03-08" }, 0);
  const entries = [
    makeEntry(trip.id, "stop", "Senso-ji", { place: "Asakusa", note: "go early" }, 1),
    makeEntry(trip.id, "phrase", "すみません", { reading: "Sumimasen", meaning: "Excuse me" }, 2),
    makeEntry("gone", "stop", "Orphan in Asakusa", {}, 3),
  ];
  const found = (query: string) => searchTrips(entries, [trip], query).map((hit) => hit.entry.text);
  assert.deepEqual(found("asakusa"), ["Senso-ji"]);
  assert.deepEqual(found("excuse"), ["すみません"]);
  assert.deepEqual(found("japan early"), ["Senso-ji"]);
  assert.deepEqual(found(""), []);
});

test("an empty query finds nothing", () => {
  assert.deepEqual(find("  "), []);
});

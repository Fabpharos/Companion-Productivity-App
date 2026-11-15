// What the screens read and what they can ask for.
//
// `data` mirrors the database: any write, from anywhere, shows up here and the
// screens redraw. `ui` is where the user is in the app. The functions at the
// bottom run an action and offer its undo in the toast.

import { liveQuery } from "dexie";
import * as actions from "./lib/actions.ts";
import { localDate } from "./lib/dates.ts";
import { db, readSettings, saveSettings, type Undo } from "./lib/db.ts";
import { title } from "./lib/items.ts";
import { DEFAULT_SETTINGS, type Item, type ItemKind, type List, type Settings, type Theme } from "./lib/model.ts";

class Data {
  items = $state.raw<Item[]>([]);
  lists = $state.raw<List[]>([]);
  settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  ready = $state(false);
  now = $state(Date.now());
  today = $derived(localDate(this.now));

  list(id: string | null): List | undefined {
    return this.lists.find((list) => list.id === id);
  }
}

export const data = new Data();

export const TABS = ["today", "lists", "chores", "trips", "companion"] as const;
export type Tab = (typeof TABS)[number];
export type Overlay = "search" | "settings" | "archive" | null;

interface Toast {
  message: string;
  undo?: Undo;
}

export interface CaptureResult {
  raw: string;
  items: Item[];
  undo: Undo;
}

class Ui {
  tab = $state<Tab>("today");
  /** The list open on the Lists tab, or null for the index of lists. */
  listId = $state<string | null>(null);
  overlay = $state<Overlay>(null);
  /** The item open in the editor. */
  editId = $state<string | null>(null);
  toast = $state.raw<Toast | null>(null);
  /** The latest capture, shown under the capture box so its guess can be corrected. */
  captured = $state.raw<CaptureResult | null>(null);

  go(tab: Tab, listId: string | null = null) {
    this.tab = tab;
    this.listId = listId;
    this.overlay = null;
  }
}

export const ui = new Ui();

/** The address for the current place, so reopening the app returns to it. */
export function currentHash(): string {
  return ui.tab === "lists" && ui.listId ? `#/lists/${ui.listId}` : `#/${ui.tab}`;
}

function readHash() {
  const [, tab, id] = location.hash.split("/");
  if ((TABS as readonly string[]).includes(tab ?? "")) {
    ui.tab = tab as Tab;
    ui.listId = tab === "lists" && id ? decodeURIComponent(id) : null;
  }
}

export function start() {
  readHash();
  liveQuery(async () => ({
    items: await db.items.toArray(),
    lists: (await db.lists.toArray()).sort((a, b) => a.order - b.order),
    settings: await readSettings(),
  })).subscribe({
    next: (snapshot) => {
      data.items = snapshot.items;
      data.lists = snapshot.lists;
      data.settings = snapshot.settings;
      data.ready = true;
    },
    error: (error) => console.error(error),
  });

  // Keeps "today" right when the app is left open overnight or reopened.
  const tick = () => (data.now = Date.now());
  setInterval(tick, 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());

  // Asks the browser not to clear this app's storage when the phone runs low on space.
  void navigator.storage?.persist?.();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let capturedTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, undo?: Undo) {
  clearTimeout(toastTimer);
  ui.toast = { message, undo };
  toastTimer = setTimeout(() => (ui.toast = null), undo ? 6000 : 3500);
}

export async function undoToast() {
  const undo = ui.toast?.undo;
  ui.toast = null;
  await undo?.();
}

function showCaptured(result: CaptureResult | null) {
  clearTimeout(capturedTimer);
  ui.captured = result;
  if (result) capturedTimer = setTimeout(() => (ui.captured = null), 9000);
}

export async function capture(raw: string, list?: List) {
  const result = await actions.capture(raw, { list });
  showCaptured(result.items.length ? { raw, ...result } : null);
}

/** Replaces the latest capture with the same text filed as another kind. */
export async function recapture(kind: ItemKind) {
  const last = ui.captured;
  if (!last) return;
  await last.undo();
  showCaptured({ raw: last.raw, ...(await actions.capture(last.raw, { force: kind })) });
}

export function dismissCaptured() {
  showCaptured(null);
}

export async function complete(item: Item) {
  const undo = await actions.complete(item);
  toast(item.kind === "shopping" ? `Got ${title(item)}` : item.repeat ? "Done. Next one scheduled" : "Done", undo);
}

export async function reopen(item: Item) {
  toast(item.kind === "shopping" ? "Back on the list" : "Restored", await actions.reopen(item));
}

export async function remove(item: Item) {
  if (ui.editId === item.id) ui.editId = null;
  toast("Deleted", await actions.remove([item]));
}

export async function toggleFocus(item: Item) {
  const on = item.focusOn !== data.today;
  const undo = await actions.setFocus(item, on);
  if (undo === null) toast("Today's three are full. Finish or remove one first");
}

export function setTheme(theme: Theme) {
  void saveSettings({ theme });
}

export { actions };

// What the screens read and what they can ask for.
//
// `data` mirrors the database: any write, from anywhere, shows up here and the
// screens redraw. `ui` is where the user is in the app and what the companion
// is saying. The functions at the bottom run an action, offer its undo in the
// toast, and let the companion react.

import { liveQuery } from "dexie";
import { DEFAULT_STYLE, type LineEvent } from "../content/dialogue.ts";
import * as actions from "./lib/actions.ts";
import { completionEvent, greetingEvent, nudge, say, suggestNext, type Reaction, type Vars } from "./lib/companion.ts";
import { daysBetween, localDate } from "./lib/dates.ts";
import { db, readSettings, saveSettings, type Undo } from "./lib/db.ts";
import { milestones, summarize } from "./lib/game.ts";
import { title } from "./lib/items.ts";
import {
  DEFAULT_SETTINGS,
  type Activity,
  type Chore,
  type Item,
  type ItemKind,
  type List,
  type QuestSet,
  type Reward,
  type Settings,
  type Theme,
} from "./lib/model.ts";

class Data {
  items = $state.raw<Item[]>([]);
  lists = $state.raw<List[]>([]);
  chores = $state.raw<Chore[]>([]);
  rewards = $state.raw<Reward[]>([]);
  activity = $state.raw<Activity[]>([]);
  quests = $state.raw<QuestSet[]>([]);
  settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  ready = $state(false);
  now = $state(Date.now());
  today = $derived(localDate(this.now));
  /** Points, level, streak, bond and quests, all worked out from the activity log. */
  game = $derived(summarize(this.activity, this.quests, this.today));

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

/** A countdown tied to a chore or a to-do. It is kept by its end time, so it survives the app being closed. */
export interface Timer {
  kind: "chore" | "todo";
  id: string;
  name: string;
  minutes: number;
  endsAt: number;
  /** Set once the companion has said the time is up. */
  announced: boolean;
}

class Ui {
  tab = $state<Tab>("today");
  /** The list open on the Lists tab, or null for the index of lists. */
  listId = $state<string | null>(null);
  overlay = $state<Overlay>(null);
  /** The item open in the editor. */
  editId = $state<string | null>(null);
  /** The chore open in its sheet. */
  choreId = $state<string | null>(null);
  toast = $state.raw<Toast | null>(null);
  /** The latest capture, shown under the capture box so its guess can be corrected. */
  captured = $state.raw<CaptureResult | null>(null);
  /** What the companion is saying, and its pose. */
  companion = $state.raw<Reaction>({ pose: "idle", text: "" });
  /** Counts taps that play the idle animation; the avatar replays it when this changes. */
  wiggle = $state(0);
  timer = $state.raw<Timer | null>(null);
  /** The time, updated every second while a timer runs. */
  clock = $state(Date.now());

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

/** Small things remembered between launches that are about this phone, not part of the data. */
const remembered = {
  get<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

export function start() {
  readHash();
  liveQuery(async () => ({
    items: await db.items.toArray(),
    lists: (await db.lists.toArray()).sort((a, b) => a.order - b.order),
    chores: await db.chores.toArray(),
    rewards: (await db.rewards.toArray()).sort((a, b) => a.price - b.price),
    activity: await db.activity.toArray(),
    quests: await db.quests.toArray(),
    settings: await readSettings(),
  })).subscribe({
    next: (snapshot) => {
      const first = !data.ready;
      Object.assign(data, snapshot);
      data.ready = true;
      if (first) greet();
    },
    error: (error) => console.error(error),
  });

  // Keeps "today" right when the app is left open overnight or reopened, and makes the new day's quests.
  const tick = () => {
    data.now = Date.now();
    void actions.ensureQuests(localDate());
  };
  tick();
  setInterval(tick, 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());

  ui.timer = remembered.get<Timer>("timer");
  setInterval(() => {
    if (!ui.timer) return;
    ui.clock = Date.now();
    if (!ui.timer.announced && ui.clock >= ui.timer.endsAt) {
      setTimer({ ...ui.timer, announced: true });
      speak("timerEnd");
    }
  }, 1000);

  // Asks the browser not to clear this app's storage when the phone runs low on space.
  void navigator.storage?.persist?.();
}

// ---------- Toast ----------

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

// ---------- Companion ----------

export function speak(event: LineEvent, vars: Vars = {}) {
  ui.companion = say(DEFAULT_STYLE, event, vars, data.game.bond.level, Math.random());
}

/** The first line of a launch: a greeting, or a gentle mention of something overdue when it is the first launch of the day. */
function greet() {
  const lastOpen = remembered.get<string>("lastOpen");
  remembered.set("lastOpen", data.today);
  const { lowEnergy } = data.settings;
  const mention = lastOpen !== data.today && lastOpen !== null ? nudge(data.chores, data.now, lowEnergy) : null;
  // Half the time the day opens with a plain greeting even when something is overdue.
  if (mention && Math.random() < 0.5) speak(mention.event, mention.vars);
  else speak(greetingEvent(new Date().getHours(), lastOpen ? daysBetween(lastOpen, data.today) : 0, lowEnergy));
}

/** Tapping the companion gets a line, a suggestion for what to do next, or a little movement. */
export function tapCompanion() {
  const roll = Math.random();
  if (roll < 0.25) {
    ui.wiggle++;
  } else if (roll < 0.6) {
    const next = suggestNext(data.chores, data.items, data.now, data.today, data.settings.lowEnergy);
    speak(next.event, next.vars);
  } else {
    speak("tap");
  }
}

/** Has the companion answer a completion, with a milestone if this one reached it. */
function celebrate(entry: Activity, chore: boolean, name: string) {
  // The log on screen may or may not include the new entry yet, so both sides are built explicitly.
  const others = data.activity.filter((other) => other.id !== entry.id);
  const before = summarize(others, data.quests, data.today);
  const after = summarize([...others, entry], data.quests, data.today);
  const { event, vars } = completionEvent(milestones(before, after), { chore, name, points: entry.points }, data.settings.lowEnergy);
  speak(event, vars);
}

// ---------- Capture ----------

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

// ---------- Items ----------

export async function complete(item: Item) {
  const { undo, entry } = await actions.complete(item);
  toast(item.kind === "shopping" ? "Bought" : "Done", undo);
  if (item.kind === "todo") celebrate(entry, false, title(item));
  if (ui.timer?.kind === "todo" && ui.timer.id === item.id) setTimer(null);
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

// ---------- Chores ----------

export async function addChore(raw: string) {
  const added = await actions.addChore(raw);
  if (added) toast(`Added ${added.chore.name}`, added.undo);
}

export async function completeChore(chore: Chore) {
  const { undo, entry } = await actions.completeChore(chore);
  toast("Done", undo);
  celebrate(entry, true, chore.name);
  if (ui.timer?.kind === "chore" && ui.timer.id === chore.id) setTimer(null);
}

export async function toggleStep(chore: Chore, stepId: string) {
  const result = await actions.toggleStep(chore, stepId);
  if (!result) return;
  if (result.entry.type === "chore") {
    toast("Done", result.undo);
    celebrate(result.entry, true, chore.name);
  } else {
    celebrate(result.entry, true, result.entry.text);
  }
}

export async function removeChore(chore: Chore) {
  if (ui.choreId === chore.id) ui.choreId = null;
  toast(`Deleted ${chore.name}`, await actions.removeChore(chore));
}

// ---------- Timer ----------

function setTimer(timer: Timer | null) {
  ui.timer = timer;
  ui.clock = Date.now();
  remembered.set("timer", timer);
}

export function startTimer(kind: Timer["kind"], id: string, name: string, minutes: number) {
  setTimer({ kind, id, name, minutes, endsAt: Date.now() + minutes * 60_000, announced: false });
}

export function stopTimer() {
  setTimer(null);
}

// ---------- Rewards ----------

export async function buyReward(reward: Reward) {
  if (data.game.balance < reward.price) return;
  toast(`Spent ${reward.price} points`, await actions.buyReward(reward));
  speak("reward", { name: reward.name });
}

export function setTheme(theme: Theme) {
  void saveSettings({ theme });
}

export { actions };

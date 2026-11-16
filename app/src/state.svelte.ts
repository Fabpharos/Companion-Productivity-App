// What the screens read and what they can ask for.
//
// `data` mirrors the database: any write, from anywhere, shows up here and the
// screens redraw. `ui` is where the user is in the app and what the companion
// is saying. The functions at the bottom run an action, offer its undo in the
// toast, and let the companion react.

import { liveQuery } from "dexie";
import { framing, poseImage } from "../content/companion/index.ts";
import type { LineEvent } from "../content/dialogue.ts";
import { styleById } from "../content/styles.ts";
import { deliver } from "./files.ts";
import { prepareImage, toPng } from "./image.ts";
import { CardError, cardFileName, DEFAULT_CARD, embedCard, extractCard } from "./lib/card.ts";
import * as actions from "./lib/actions.ts";
import {
  completionEvent,
  greetingEvent,
  nudge,
  outfitFor,
  say,
  suggestNext,
  tripGreeting,
  type CompanionArt,
  type Reaction,
  type Vars,
} from "./lib/companion.ts";
import { daysBetween, localDate } from "./lib/dates.ts";
import {
  db,
  readCompanion,
  readConnection,
  readSettings,
  removeImages,
  replaceCompanion,
  saveCompanion,
  saveConnection,
  saveImage,
  saveSettings,
  type Undo,
} from "./lib/db.ts";
import { milestones, summarize } from "./lib/game.ts";
import { title } from "./lib/items.ts";
import {
  DEFAULT_SETTINGS,
  NO_CONNECTION,
  type Activity,
  type Chore,
  type CompanionCard,
  type Connection,
  type Item,
  type ItemKind,
  type List,
  type NotifySettings,
  type PoseName,
  type QuestSet,
  type Reward,
  type Settings,
  type StoredImage,
  type Theme,
  type Trip,
  type TripEntry,
} from "./lib/model.ts";
import { badgeCount, plan, toReminders } from "./lib/notify.ts";
import { recentWin, trendUp, weeklyCounts } from "./lib/stats.ts";
import { currentTrip, tasksComingDue, travellingOn } from "./lib/trips.ts";
import { PushError, sendReminders, sendTest, setBadge, subscribe, unsubscribe } from "./push.ts";

class Data {
  items = $state.raw<Item[]>([]);
  lists = $state.raw<List[]>([]);
  chores = $state.raw<Chore[]>([]);
  rewards = $state.raw<Reward[]>([]);
  activity = $state.raw<Activity[]>([]);
  quests = $state.raw<QuestSet[]>([]);
  trips = $state.raw<Trip[]>([]);
  tripEntries = $state.raw<TripEntry[]>([]);
  settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  /** Where notifications are sent from, and whether this phone is subscribed. */
  connection = $state.raw<Connection>(NO_CONNECTION);
  /** Who the companion is, and its own pictures if it has any. */
  card = $state.raw<CompanionCard>(DEFAULT_CARD);
  images = $state.raw<StoredImage[]>([]);
  /** The set of lines the companion speaks with. */
  style = $derived(styleById(this.card.styleId));
  ready = $state(false);
  now = $state(Date.now());
  today = $derived(localDate(this.now));
  /** Points, level, streak, bond and quests, all worked out from the activity log. */
  game = $derived(summarize(this.activity, this.quests, this.today));

  /** The trip under way or next to start, and the trip under way today if there is one. */
  trip = $derived(currentTrip(this.trips, this.today));
  travelling = $derived(travellingOn(this.trips, this.today));
  /** What the companion is wearing: the outfit of a trip that is close or under way. */
  outfit = $derived(outfitFor(this.trip, this.today));
  /** The notifications coming in the next two weeks, as the Worker will be told. */
  plan = $derived(plan(this, this.now, { style: this.style, bond: this.game.bond.level }));
  /** The number on the app icon: to-dos due today or earlier. */
  badge = $derived(badgeCount(this.items, this.today));

  list(id: string | null): List | undefined {
    return this.lists.find((list) => list.id === id);
  }
}

export const data = new Data();

export const TABS = ["today", "lists", "chores", "trips", "companion"] as const;
export type Tab = (typeof TABS)[number];
export type Overlay = "search" | "settings" | "archive" | "companion" | null;

export const TRIP_SECTIONS = ["overview", "packing", "tasks", "itinerary", "wishes", "budget", "phrases", "souvenirs", "journal"] as const;
export type TripSection = (typeof TRIP_SECTIONS)[number];

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

/** Something the companion said, kept for its history. */
export interface Said {
  at: number;
  event: LineEvent;
  text: string;
}

export type Mood = "good" | "okay" | "low";

export interface Sync {
  state: "idle" | "ok" | "error";
  message: string;
  at: number | null;
}

class Ui {
  tab = $state<Tab>("today");
  /** The list open on the Lists tab, or null for the index of lists. */
  listId = $state<string | null>(null);
  overlay = $state<Overlay>(null);
  /** The item open in the editor. */
  editId = $state<string | null>(null);
  /** The trip open on the Trips tab, or null for the list of trips, and the part of it being shown. */
  tripId = $state<string | null>(null);
  tripSection = $state<TripSection>("overview");
  /** The trip entry open in its sheet. */
  entryId = $state<string | null>(null);
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
  /** The last things the companion said, newest first. */
  said = $state.raw<Said[]>([]);
  /** Today's answer to the daily check-in, once given. */
  checkin = $state.raw<{ date: string; mood: Mood } | null>(null);
  /** How the last hand-over of notifications to the Worker went. */
  sync = $state.raw<Sync>({ state: "idle", message: "", at: null });

  go(tab: Tab, listId: string | null = null) {
    this.tab = tab;
    this.listId = listId;
    this.tripId = null;
    this.overlay = null;
  }

  openTrip(tripId: string, section: TripSection = "overview") {
    this.tab = "trips";
    this.tripId = tripId;
    this.tripSection = section;
    this.overlay = null;
  }
}

export const ui = new Ui();

/** The address for the current place, so reopening the app returns to it. */
export function currentHash(): string {
  if (ui.tab === "lists" && ui.listId) return `#/lists/${ui.listId}`;
  if (ui.tab === "trips" && ui.tripId) return `#/trips/${ui.tripId}`;
  return `#/${ui.tab}`;
}

/** Goes to the place an address names. Used at launch, and when a notification is tapped. */
export function openHash(hash: string) {
  const [, tab, rawId, section] = hash.split("/");
  const id = rawId ? decodeURIComponent(rawId) : null;
  if (tab === "item" && id) {
    ui.go("today");
    ui.editId = id;
  } else if (tab === "settings") {
    ui.overlay = "settings";
  } else if ((TABS as readonly string[]).includes(tab ?? "")) {
    ui.go(tab as Tab, tab === "lists" ? id : null);
    if (tab === "trips" && id) ui.openTrip(id, (TRIP_SECTIONS as readonly string[]).includes(section ?? "") ? (section as TripSection) : "overview");
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
  openHash(location.hash);
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "open" && typeof event.data.hash === "string") openHash(event.data.hash);
  });
  liveQuery(async () => ({
    items: await db.items.toArray(),
    lists: (await db.lists.toArray()).sort((a, b) => a.order - b.order),
    chores: await db.chores.toArray(),
    rewards: (await db.rewards.toArray()).sort((a, b) => a.price - b.price),
    activity: await db.activity.toArray(),
    quests: await db.quests.toArray(),
    trips: (await db.trips.toArray()).sort((a, b) => (a.start < b.start ? -1 : 1)),
    tripEntries: await db.tripEntries.toArray(),
    settings: await readSettings(),
    connection: await readConnection(),
  })).subscribe({
    next: (snapshot) => {
      const first = !data.ready;
      Object.assign(data, snapshot);
      data.ready = true;
      if (first) greet();
    },
    error: (error) => console.error(error),
  });

  // The companion's card and pictures are read apart from the rest, so the pictures are not reread on every change elsewhere.
  liveQuery(async () => ({ card: await readCompanion(), images: await db.images.toArray() })).subscribe({
    next: (companion) => Object.assign(data, companion),
    error: (error) => console.error(error),
  });
  ui.said = remembered.get<Said[]>("said") ?? [];
  ui.checkin = remembered.get<{ date: string; mood: Mood }>("checkin");

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

const DEFAULT_ART: CompanionArt = { image: poseImage, framing };

/**
 * The art for the companion in use. Every screen gets its pictures from here,
 * so a custom or generated companion only has to be returned from this one place.
 * An uploaded main picture replaces the default art, and stands in for any pose without its own.
 */
export function companionArt(): CompanionArt {
  const main = data.images.find((image) => image.id === "idle");
  if (!main) return DEFAULT_ART;
  const byPose = new Map(data.images.map((image) => [image.id, image.data]));
  return { image: (pose) => byPose.get(pose) ?? main.data, framing: data.card.framing };
}

/** The events worth showing as milestones in the companion's history. */
export const MILESTONE_EVENTS: readonly LineEvent[] = ["levelUp", "streak", "bond", "quest"];
const SAID_KEPT = 40;

export function speak(event: LineEvent, vars: Vars = {}) {
  ui.companion = say(data.style, event, vars, data.game.bond.level, Math.random(), data.outfit);
  if (!ui.companion.text) return;
  ui.said = [{ at: Date.now(), event, text: ui.companion.text }, ...ui.said].slice(0, SAID_KEPT);
  remembered.set("said", ui.said);
}

/** The first line of a launch: a greeting, or a gentle mention of something overdue when it is the first launch of the day. */
function greet() {
  const lastOpen = remembered.get<string>("lastOpen");
  remembered.set("lastOpen", data.today);
  const { lowEnergy } = data.settings;
  const firstToday = lastOpen !== data.today;
  // A trip comes first: its countdown days, its own days, and tasks about to fall due.
  const trip = firstToday ? tripGreeting(data.trip, data.today, tasksComingDue(data.trips, data.tripEntries, data.today, 3)) : null;
  // Chores go unmentioned while travelling.
  const mention = firstToday && lastOpen !== null && !data.travelling ? nudge(data.chores, data.now, lowEnergy) : null;
  if (trip) speak(trip.event, trip.vars);
  // Half the time the day opens with a plain greeting even when something is overdue.
  else if (mention && Math.random() < 0.5) speak(mention.event, mention.vars);
  else speak(greetingEvent(new Date().getHours(), lastOpen ? daysBetween(lastOpen, data.today) : 0, lowEnergy));
}

/** Tapping the companion gets a line, something it remembers, a suggestion for what to do next, or a little movement. */
export function tapCompanion() {
  const roll = Math.random();
  const win = roll < 0.3 ? recentWin(data.activity, data.now) : null;
  const rising = roll < 0.4 ? trendUp(weeklyCounts(data.activity, data.today, 2)) : null;
  if (roll < 0.15) {
    ui.wiggle++;
  } else if (win) {
    speak("memory", { name: win.name, n: win.days });
  } else if (roll >= 0.3 && rising !== null) {
    speak("trendUp", { n: rising });
  } else if (roll < 0.65) {
    const next = suggestNext(data.travelling ? [] : data.chores, data.items, data.now, data.today, data.settings.lowEnergy);
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

// ---------- Trips ----------

export async function toggleEntry(entry: TripEntry) {
  const result = await actions.toggleEntry(entry);
  if (result) celebrate(result.entry, false, entry.text);
}

export async function removeEntry(entry: TripEntry) {
  if (ui.entryId === entry.id) ui.entryId = null;
  toast("Deleted", await actions.removeEntry(entry));
}

export async function removeTrip(trip: Trip) {
  ui.go("trips");
  toast(`Deleted ${trip.name}`, await actions.removeTrip(trip));
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

// ---------- Companion ----------

/** Changes who the companion is. The screen updates at once, and the change is stored. */
export function saveCard(patch: Partial<CompanionCard>) {
  data.card = { ...data.card, ...patch };
  void saveCompanion(data.card);
}

/** Switches the dialogue style and says something in it straight away. */
export function setStyle(styleId: string) {
  saveCard({ styleId });
  speak("tap");
}

/** Stores a chosen picture for a pose. Returns what went wrong, or null. */
export async function uploadImage(pose: PoseName, file: Blob): Promise<string | null> {
  try {
    await saveImage({ id: pose, ...(await prepareImage(file)) });
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : "That picture could not be used.";
  }
}

/** Removes one pose's picture. Removing the main one removes them all, and the default art returns. */
export async function removeImage(pose: PoseName) {
  await removeImages(pose === "idle" ? undefined : pose);
}

/** Saves the companion as a character card: its main picture as a PNG with the card inside. */
export async function exportCard(): Promise<string | null> {
  try {
    const picture = await toPng(companionArt().image("idle"));
    const done = await deliver(embedCard(picture, data.card), cardFileName(data.card), "image/png");
    if (done) toast("Card file created");
    return null;
  } catch (reason) {
    return reason instanceof CardError ? reason.message : "The card could not be created.";
  }
}

/** Loads a character card file: the character in it, with the file's picture as its main picture. */
export async function importCard(file: File): Promise<string | null> {
  try {
    const card = extractCard(new Uint8Array(await file.arrayBuffer()));
    if (!card) return "This picture has no character in it. A character card is a PNG saved from a character tool, or exported from here.";
    await replaceCompanion(card, [{ id: "idle", ...(await prepareImage(file)) }]);
    toast(card.name ? `Loaded ${card.name}` : "Card loaded");
    return null;
  } catch (reason) {
    return reason instanceof CardError ? reason.message : "That file could not be read as a card.";
  }
}

/** Goes back to the default companion: no name, the first style, the default art. */
export async function resetCompanion() {
  await replaceCompanion(DEFAULT_CARD, []);
  toast("Back to the default companion");
}

/** Answers the daily check-in. A low day turns on low-energy mode, and any other answer turns it off. */
export function checkIn(mood: Mood) {
  ui.checkin = { date: data.today, mood };
  remembered.set("checkin", ui.checkin);
  void actions.setLowEnergy(mood === "low");
  speak(mood === "good" ? "checkinGood" : mood === "okay" ? "checkinOkay" : "checkinLow");
}

// ---------- Notifications ----------

export function setNotify(patch: Partial<NotifySettings>) {
  void saveSettings({ notify: { ...data.settings.notify, ...patch } });
}

const failure = (reason: unknown) => (reason instanceof PushError ? reason.message : "Something went wrong. Nothing was changed.");

/** Subscribes this phone through the Worker at the address given. Returns what went wrong, or null. */
export async function enableNotifications(url: string, key: string): Promise<string | null> {
  const connection = { url: url.trim(), key: key.trim(), on: true };
  try {
    await subscribe(connection, true);
  } catch (reason) {
    return failure(reason);
  }
  await saveConnection(connection);
  return null;
}

/** Turns notifications off. The address and key are kept, so turning them back on is one tap. */
export async function disableNotifications() {
  const connection = data.connection;
  await saveConnection({ ...connection, on: false });
  remembered.set("synced", null);
  ui.sync = { state: "idle", message: "", at: null };
  await unsubscribe(connection);
}

export async function testNotification(delaySeconds: number): Promise<string | null> {
  try {
    await sendTest(data.connection, delaySeconds);
    return null;
  } catch (reason) {
    return failure(reason);
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let resubscribed = false;

/**
 * Hands the Worker the current list of notifications, a moment after the last
 * change, and only when the list differs from the one it already has.
 */
export function syncSoon() {
  clearTimeout(syncTimer);
  if (!data.ready || !data.connection.on) return;
  syncTimer = setTimeout(() => void syncNow(), 2000);
}

async function syncNow() {
  const connection = data.connection;
  const reminders = toReminders(data.plan);
  const signature = JSON.stringify([connection.url, reminders]);
  if (remembered.get<string>("synced") === signature) return;
  try {
    const { subscribed } = await sendReminders(connection, reminders);
    // The Worker forgets a subscription the push service has withdrawn. One quiet attempt to renew it.
    if (!subscribed && !resubscribed) {
      resubscribed = true;
      await subscribe(connection, false);
    } else if (!subscribed) {
      throw new PushError("This phone's subscription has lapsed. Turn notifications off and on again.");
    }
    remembered.set("synced", signature);
    ui.sync = { state: "ok", message: "", at: Date.now() };
  } catch (reason) {
    ui.sync = { state: "error", message: failure(reason), at: Date.now() };
  }
}

export function showBadge() {
  if (data.ready) setBadge(data.connection.on ? data.badge : 0);
}

export { actions };

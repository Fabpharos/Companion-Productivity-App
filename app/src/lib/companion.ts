// What the companion says and how it looks while saying it.

import type { DialogueStyle, LineEvent } from "../../content/dialogue.ts";
import { dueness } from "./chores.ts";
import type { GameEvent } from "./game.ts";
import { title } from "./items.ts";
import type { Chore, Item } from "./model.ts";
import { suggestFocus } from "./today.ts";

export const POSES = ["idle", "happy", "proud", "sleepy", "concerned"] as const;
export type Pose = (typeof POSES)[number];

export interface Reaction {
  pose: Pose;
  text: string;
}

export type Vars = Record<string, string | number>;

const POSE: Record<LineEvent, Pose> = {
  morning: "idle",
  day: "idle",
  evening: "idle",
  night: "sleepy",
  absence: "happy",
  lowGreeting: "sleepy",
  done: "happy",
  choreDone: "happy",
  lowDone: "happy",
  quest: "proud",
  streak: "proud",
  levelUp: "proud",
  bond: "proud",
  nudge: "concerned",
  suggestChore: "idle",
  suggestTodo: "idle",
  nothingToDo: "happy",
  timerEnd: "proud",
  reward: "happy",
  tap: "idle",
};

/** One line for an event, chosen from those the bond level has unlocked. `random` is a number from 0 up to 1. */
export function say(style: DialogueStyle, event: LineEvent, vars: Vars, bond: number, random: number): Reaction {
  const unlocked = style.lines[event]
    .filter((line) => typeof line === "string" || line.bond <= bond)
    .map((line) => (typeof line === "string" ? line : line.text));
  const template = unlocked[Math.floor(random * unlocked.length)] ?? "";
  const text = template.replace(/\{(\w+)\}/g, (whole, key: string) => String(vars[key] ?? whole));
  return { pose: POSE[event], text };
}

/** Which greeting fits: a welcome back after three days away, a gentle one in low-energy mode, else by time of day. */
export function greetingEvent(hour: number, daysAway: number, lowEnergy: boolean): LineEvent {
  if (daysAway >= 3) return "absence";
  if (lowEnergy) return "lowGreeting";
  if (hour < 5 || hour >= 22) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

/** The line for a completion: its biggest milestone if it reached one, else a plain well-done. */
export function completionEvent(
  events: GameEvent[],
  what: { chore: boolean; name: string; points: number },
  lowEnergy: boolean,
): { event: LineEvent; vars: Vars } {
  const top = events[0];
  if (top?.type === "levelUp") return { event: "levelUp", vars: { n: top.level } };
  if (top?.type === "streak") return { event: "streak", vars: { n: top.days } };
  if (top?.type === "bond") return { event: "bond", vars: { n: top.level } };
  if (top?.type === "quest") return { event: "quest", vars: { name: top.text, points: top.bonus } };
  return { event: lowEnergy ? "lowDone" : what.chore ? "choreDone" : "done", vars: { name: what.name, points: what.points } };
}

export interface Suggestion {
  event: LineEvent;
  vars: Vars;
  chore?: Chore;
  item?: Item;
}

/** What to do next: the most overdue chore if one is due, else the most pressing to-do. */
export function suggestNext(chores: Chore[], items: Item[], now: number, today: string, lowEnergy: boolean): Suggestion {
  const chore = chores
    .filter((c) => dueness(c, now) >= 1 && (!lowEnergy || c.effort === 1))
    .sort((a, b) => dueness(b, now) - dueness(a, now))[0];
  if (chore) return { event: "suggestChore", vars: { name: chore.name }, chore };
  // Without anything due, low-energy mode suggests resting over reaching for more.
  const item = lowEnergy ? undefined : suggestFocus(items.map((i) => ({ ...i, focusOn: null })), today)[0];
  if (item) return { event: "suggestTodo", vars: { name: title(item) }, item };
  return { event: "nothingToDo", vars: {} };
}

/** A gentle mention of the most overdue chore, or null if nothing is overdue. Never more than a mention. */
export function nudge(chores: Chore[], now: number, lowEnergy: boolean): { event: LineEvent; vars: Vars } | null {
  const chore = chores
    .filter((c) => dueness(c, now) > 1 && (!lowEnergy || c.effort === 1))
    .sort((a, b) => dueness(b, now) - dueness(a, now))[0];
  return chore ? { event: "nudge", vars: { name: chore.name } } : null;
}

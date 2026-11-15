// The game loop: points, levels, streaks, quests and bond.
//
// Nothing here is stored as a running total. Every number is worked out from
// the activity log and the saved quest sets, which is what keeps undo honest:
// take back a completion and its points, streak day and quest progress go too.

import { dueness } from "./chores.ts";
import { addDays, localDate, weekStart } from "./dates.ts";
import { isOpen, title } from "./items.ts";
import type { Activity, Chore, Item, Quest, QuestSet } from "./model.ts";

// ---------- Points ----------

const EFFORT_POINTS = [5, 10, 20];
const DISLIKE_BONUS = [0, 0.5, 1];
/** Redoing a chore within this share of its interval earns a token point, so it cannot be farmed. */
const TOO_SOON = 0.25;

/** What completing a chore is worth right now: base by effort, more when overdue, more when disliked. */
export function chorePoints(chore: Chore, now: number): number {
  const due = dueness(chore, now);
  if (chore.lastDoneAt !== null && due < TOO_SOON) return 1;
  const base = EFFORT_POINTS[chore.effort - 1]!;
  const overdue = due >= 2 ? 1 : due > 1 ? 0.5 : 0;
  return Math.round(base * (1 + overdue + DISLIKE_BONUS[chore.dislike]!));
}

/** What one step of a chore is worth: an even share of the chore, with the remainder paid on completion. */
export function stepPoints(chore: Chore, now: number): number {
  return chore.steps.length ? Math.floor(chorePoints(chore, now) / chore.steps.length) : 0;
}

/** What finishing the chore pays now, after the steps already ticked this round. */
export function remainingChorePoints(chore: Chore, now: number): number {
  const paid = chore.steps.filter((step) => step.done).length * stepPoints(chore, now);
  return Math.max(0, chorePoints(chore, now) - paid);
}

export function itemPoints(item: Item, today: string): number {
  if (item.kind === "shopping") return 1;
  if (item.kind === "note") return 0;
  return 5 + item.priority * 2 + (item.due !== null && item.due < today ? 3 : 0);
}

// ---------- Levels and bond ----------

export interface Progress {
  level: number;
  /** Progress into the current level, and the size of the level. */
  into: number;
  span: number;
}

/** Levels by a total that grows by `step` more each level: 1 at 0, 2 at step, 3 at 3×step, 4 at 6×step. */
function progress(total: number, step: number): Progress {
  let level = 1;
  let floor = 0;
  while (total >= floor + level * step) {
    floor += level * step;
    level++;
  }
  return { level, into: total - floor, span: level * step };
}

export const levelFor = (earned: number): Progress => progress(earned, 50);

/** Bond grows with things done together and with days spent together. */
export const bondFor = (completions: number, activeDays: number): Progress => progress(completions + activeDays * 3, 10);

// ---------- Streak ----------

export interface Streak {
  days: number;
  /** True when nothing has been completed yet today. */
  pending: boolean;
  /** Grace days left this week: one a week covers a missed day. */
  graceLeft: number;
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

/**
 * Counts consecutive days with a completion, back from today. One missed day
 * in each Monday-to-Sunday week is forgiven. Today never breaks a streak: it
 * just is not counted until something is done.
 */
export function streakFor(activeDays: Set<string>, today: string): Streak {
  // Weeks whose grace day sits inside the streak, and weeks tried since the last active day found.
  const used = new Set<string>();
  let tentative: string[] = [];
  let days = activeDays.has(today) ? 1 : 0;
  for (let day = addDays(today, -1); ; day = addDays(day, -1)) {
    const week = weekStart(day);
    if (activeDays.has(day)) {
      days++;
      for (const spent of tentative) used.add(spent);
      tentative = [];
    } else if (!used.has(week) && !tentative.includes(week)) {
      tentative.push(week);
    } else {
      break;
    }
  }
  return { days, pending: !activeDays.has(today), graceLeft: used.has(weekStart(today)) ? 0 : 1 };
}

// ---------- Quests ----------

export const DAILY_QUESTS = 3;
const DAILY_BONUS = 5;
const WEEKLY_BONUS = 25;

export const dayQuestsId = (today: string) => `d:${today}`;
export const weekQuestsId = (today: string) => `w:${weekStart(today)}`;

/** Three quests for the day: the most overdue chore, the most overdue to-do, then general goals. */
export function makeDailyQuests(chores: Chore[], items: Item[], today: string, now: number): Quest[] {
  const quests: Quest[] = [];
  const add = (kind: Quest["kind"], ref: string | null, target: number, text: string) =>
    quests.push({ id: `${kind}:${ref ?? target}`, kind, ref, target, text, bonus: DAILY_BONUS });

  const chore = chores.filter((c) => dueness(c, now) >= 1).sort((a, b) => dueness(b, now) - dueness(a, now))[0];
  if (chore) add("chore", chore.id, 1, `Do "${chore.name}"`);

  const todo = items
    .filter((item) => item.kind === "todo" && isOpen(item) && item.due !== null && item.due <= today)
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : b.priority - a.priority))[0];
  if (todo) add("item", todo.id, 1, `Finish "${title(todo)}"`);

  if (!chore && chores.length) add("chores", null, 1, "Do any chore");
  add("count", null, 3, "Complete 3 things");
  add("points", null, 20, "Earn 20 points");
  return quests.slice(0, DAILY_QUESTS);
}

export function makeWeeklyQuest(chores: Chore[]): Quest {
  if (chores.length === 0) {
    return { id: "count:10", kind: "count", ref: null, target: 10, text: "Complete 10 things this week", bonus: WEEKLY_BONUS };
  }
  const target = Math.min(7, Math.max(3, chores.length));
  return { id: `chores:${target}`, kind: "chores", ref: null, target, text: `Do ${target} chores this week`, bonus: WEEKLY_BONUS };
}

export interface QuestState {
  quest: Quest;
  have: number;
  done: boolean;
}

/** How far along a quest is, given the log entries of its day or week. */
export function questState(quest: Quest, entries: Activity[]): QuestState {
  let have: number;
  switch (quest.kind) {
    case "chore":
      have = entries.some((entry) => entry.type === "chore" && entry.itemId === quest.ref) ? 1 : 0;
      break;
    case "item":
      have = entries.some((entry) => entry.type === "done" && entry.itemId === quest.ref) ? 1 : 0;
      break;
    case "chores":
      have = entries.filter((entry) => entry.type === "chore").length;
      break;
    case "count":
      have = entries.filter((entry) => entry.type === "chore" || entry.type === "done").length;
      break;
    case "points":
      have = entries.reduce((sum, entry) => sum + Math.max(0, entry.points), 0);
      break;
  }
  return { quest, have: Math.min(have, quest.target), done: have >= quest.target };
}

// ---------- The whole picture ----------

export interface Game {
  /** Points available to spend. */
  balance: number;
  /** Points ever earned, which sets the level. */
  earned: number;
  level: Progress;
  bond: Progress;
  streak: Streak;
  daily: QuestState[];
  weekly: QuestState | null;
  /** Points earned today, quest bonuses included. */
  today: number;
}

export function summarize(activity: Activity[], questSets: QuestSet[], today: string): Game {
  const byDay = new Map<string, Activity[]>();
  const byWeek = new Map<string, Activity[]>();
  let spent = 0;
  let earned = 0;
  let earnedToday = 0;
  let completions = 0;
  for (const entry of activity) {
    if (entry.type === "reward") {
      spent -= entry.points;
      continue;
    }
    const day = localDate(entry.at);
    const week = weekStart(day);
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
    byWeek.set(week, [...(byWeek.get(week) ?? []), entry]);
    earned += entry.points;
    if (day === today) earnedToday += entry.points;
    completions++;
  }

  let daily: QuestState[] = [];
  let weekly: QuestState | null = null;
  for (const set of questSets) {
    const isWeek = set.id.startsWith("w:");
    const period = set.id.slice(2);
    const states = set.quests.map((quest) => questState(quest, (isWeek ? byWeek : byDay).get(period) ?? []));
    for (const state of states) {
      if (!state.done) continue;
      earned += state.quest.bonus;
      if (!isWeek && period === today) earnedToday += state.quest.bonus;
    }
    if (set.id === dayQuestsId(today)) daily = states;
    if (set.id === weekQuestsId(today)) weekly = states[0] ?? null;
  }

  const activeDays = new Set(byDay.keys());
  return {
    balance: earned - spent,
    earned,
    level: levelFor(earned),
    bond: bondFor(completions, activeDays.size),
    streak: streakFor(activeDays, today),
    daily,
    weekly,
    today: earnedToday,
  };
}

export type GameEvent =
  | { type: "levelUp"; level: number }
  | { type: "streak"; days: number }
  | { type: "quest"; text: string; bonus: number }
  | { type: "bond"; level: number };

/** What changed between two states of the game that is worth celebrating, biggest first. */
export function milestones(before: Game, after: Game): GameEvent[] {
  const events: GameEvent[] = [];
  if (after.level.level > before.level.level) events.push({ type: "levelUp", level: after.level.level });
  if (after.streak.days > before.streak.days && STREAK_MILESTONES.includes(after.streak.days)) {
    events.push({ type: "streak", days: after.streak.days });
  }
  if (after.bond.level > before.bond.level) events.push({ type: "bond", level: after.bond.level });
  const wasDone = new Set([...before.daily, before.weekly].filter((state) => state?.done).map((state) => state!.quest.id));
  for (const state of [after.weekly, ...after.daily]) {
    if (state?.done && !wasDone.has(state.quest.id)) events.push({ type: "quest", text: state.quest.text, bonus: state.quest.bonus });
  }
  return events;
}

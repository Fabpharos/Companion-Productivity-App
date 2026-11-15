// The default companion's lines, grouped by what just happened. Plain data:
// add a line to a group and the companion starts saying it.
//
// Words in braces are filled in: {name} is the task or chore, {n} a number,
// {points} the points earned. A line given as { text, bond } is only said
// once the bond level reaches that number.
//
// Tone rule: the companion encourages and celebrates. It never scolds, never
// counts what was missed, and never makes a day off feel like a failure.

export type LineEvent =
  | "morning"
  | "day"
  | "evening"
  | "night"
  | "absence"
  | "lowGreeting"
  | "done"
  | "choreDone"
  | "lowDone"
  | "quest"
  | "streak"
  | "levelUp"
  | "bond"
  | "nudge"
  | "suggestChore"
  | "suggestTodo"
  | "nothingToDo"
  | "timerEnd"
  | "reward"
  | "tap"
  | "tripCountdown"
  | "tripTomorrow"
  | "tripDay"
  | "tripTask"
  | "pushMorning"
  | "pushTask"
  | "pushChore"
  | "pushChores"
  | "pushStreak"
  | "pushTripTask"
  | "pushBackup";

export type Line = string | { text: string; bond: number };

export interface DialogueStyle {
  id: string;
  name: string;
  lines: Record<LineEvent, Line[]>;
  /**
   * Lines that replace the usual ones while the companion wears an outfit,
   * keyed by the trip's outfit tag. Only the events listed are replaced.
   */
  outfits?: Record<string, Partial<Record<LineEvent, Line[]>>>;
}

export const DEFAULT_STYLE: DialogueStyle = {
  id: "default",
  name: "Default",
  lines: {
    morning: ["Good morning. Ready when you are.", "Morning. One small thing is a fine start.", "Good morning. What matters most today?"],
    day: ["Good to see you.", "Hello again. What are we doing?", "Hi. Pick one thing and I'll keep you company."],
    evening: ["Good evening. Anything left you'd like off your mind?", "Evening. A small win before the day ends?", "Good evening."],
    night: ["It's late. Tomorrow will still be here.", "Up late? Keep it light.", "Rest is productive too."],
    absence: ["It's good to see you again.", "Welcome back. We'll start wherever you like.", "You're here. That's the part that counts."],
    lowGreeting: ["A slow day is still a day. Easy things only.", "Low energy is fine. Just one small thing, if you feel like it.", "No pressure today."],
    done: [
      "Done. +{points}.",
      "\"{name}\" is off the list. +{points}.",
      "One less thing to carry. +{points}.",
      "Nicely done. +{points}.",
      { text: "You make that look easy. +{points}.", bond: 3 },
    ],
    choreDone: [
      "\"{name}\" is done. +{points}.",
      "That's \"{name}\" fresh again. +{points}.",
      "Future you says thanks. +{points}.",
      "Done, and it shows. +{points}.",
      { text: "This place is better for it. +{points}.", bond: 2 },
      { text: "I like watching you get things done. +{points}.", bond: 4 },
    ],
    lowDone: ["That counts. +{points}.", "Even on a slow day. +{points}.", "Small and done. +{points}."],
    quest: ["Quest complete: {name}. +{points} bonus.", "That finishes a quest. +{points} bonus.", "Quest done. +{points} on top."],
    streak: ["{n} days in a row.", "That makes {n} days running.", "A {n}-day streak. Look at that."],
    levelUp: ["Level {n}. You earned it.", "That's level {n}.", "Level {n}. Onward."],
    bond: ["Bond level {n}. I'm glad we do this together.", "We've reached bond level {n}."],
    nudge: [
      "\"{name}\" could use some attention. Five minutes would do it.",
      "If you have a moment, \"{name}\" is ready for you.",
      "\"{name}\" has been waiting patiently. No rush.",
    ],
    suggestChore: ["How about \"{name}\"? Just five minutes.", "\"{name}\" might be a good next one.", "Want to try \"{name}\"?"],
    suggestTodo: ["\"{name}\" looks like a good next step.", "Maybe \"{name}\" next?", "How about \"{name}\"?"],
    nothingToDo: ["Nothing is waiting on you. Enjoy it.", "All caught up.", "Clear for now. Well done."],
    timerEnd: ["Time's up. Stopping here counts.", "That's the timer. You showed up, and that counts."],
    reward: ["\"{name}\" is yours. Enjoy it.", "You earned \"{name}\".", "Here you go: \"{name}\"."],
    tripCountdown: ["{n} days until {name}.", "{name} is {n} days away.", "{n} days to go until {name}."],
    tripTomorrow: ["{name} starts tomorrow. Nearly there.", "Tomorrow: {name}."],
    tripDay: ["Day {n} of {name}. Enjoy it.", "Day {n} of {name}. Chores can wait.", "Good day for an adventure. Day {n} of {name}."],
    tripTask: ["Before {name}: \"{task}\" is coming up.", "One for the trip: \"{task}\"."],
    // Notifications. Each is the line under a title that already names the thing:
    // the task, the chore, the trip. {task} is a short list of names.
    pushMorning: ["Good morning.", "Good morning. Here's today.", "Morning. Here's the day."],
    pushTask: ["It's time for this one.", "This one is up now.", "You asked me to remind you."],
    pushChore: ["Could use some attention. Five minutes would do it.", "Ready when you have a moment.", "Has been waiting patiently. No rush."],
    pushChores: ["Ready when you are: {task}.", "A few could use some attention: {task}."],
    pushStreak: ["One small thing today keeps {n} days going.", "{n} days running. Anything small counts today.", "A small win tonight keeps your {n} days going."],
    pushTripTask: ["Due today before the trip: {task}.", "For the trip, today: {task}."],
    pushBackup: ["It has been two weeks. A fresh backup takes one tap.", "Time for a new backup file. One tap in Settings."],
    tap: [
      "I'm here.",
      "Hello.",
      "Take your time.",
      { text: "I was hoping you'd stop by.", bond: 2 },
      { text: "We've done a lot together.", bond: 4 },
      { text: "You've come a long way since day one.", bond: 6 },
    ],
  },
  outfits: {
    kimono: {
      tripCountdown: ["{n} days until {name}. I'm practising my bow.", "{name} is {n} days away. I can't wait."],
      tripDay: ["Ohayō. Day {n} of {name}.", "Day {n} of {name}. Let's see something new."],
      tap: ["Konnichiwa.", "I like it here.", "Take your time. The trip is yours."],
    },
  },
};

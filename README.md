# Companion Productivity App

A Home Screen web app for one iPhone: notes, to-dos, shopping, chores and trips, built around a companion character. The full plan is in [docs/build-plan.md](docs/build-plan.md).

**Current stage: Phase 3, trips.** The app now has notes, to-dos and shopping (Phase 1), chores, points and a companion (Phase 2), and trips with a countdown, packing list, tasks before leaving, itinerary, budget, phrase cards, souvenirs and a journal (Phase 3). Notifications are next. Phase 0's findings are in [docs/phase-0-results.md](docs/phase-0-results.md).

Not built yet from the plan: habits, the weekly review and task aging (Phase 2 extras); dragging stops between days and general list templates (Phase 3).

## Layout

| Folder | Holds |
| --- | --- |
| `app/` | The app: Svelte, TypeScript, Vite. Published to GitHub Pages |
| `app/src/lib/` | The rules and the data layer. Plain TypeScript with a test beside each file |
| `app/src/screens/`, `app/src/ui/` | The screens and the pieces they share |
| `app/content/` | Plain data: grocery words and store sections, the companion's lines and art, and trip templates |
| `worker/` | The Cloudflare Worker: web push and a queue of pending messages. Used from Phase 4 |
| `spikes/` | The Phase 0 test pages. No longer published |
| `docs/` | The build plan and the Phase 0 results |
| `tools/` | Local helpers |

## Commands

Node 24 or later. Run `npm run setup` once to install the app's dependencies.

| Command | Does |
| --- | --- |
| `npm run app` | Runs the app at http://localhost:5173 |
| `npm test` | Runs all tests |
| `npm run typecheck` | Type-checks the app and the Worker |
| `npm run build` | Builds the app into `app/dist` |
| `npm run icons` | Redraws the app icon |
| `npm run spikes` | Serves the Phase 0 test pages at http://localhost:4173 |
| `npm run vapid-keys` | Prints fresh Worker secrets |
| `npm run worker:deploy` | Publishes the Worker to Cloudflare |

## Getting it on the phone

1. Push to `main`. The workflow tests, builds and publishes the app to GitHub Pages.
2. Open the Pages address in Safari, then Share, Add to Home Screen.
3. Open it from the Home Screen icon. From then on it opens with no signal, and picks up new versions on its own the next time it is opened online.

The Home Screen app keeps its own storage, separate from Safari. Anything typed into the Safari tab stays in the tab.

## How the app is put together

- **Data stays on the phone**, in IndexedDB, read and written through `app/src/lib/db.ts`. The screens hold no data of their own: `app/src/state.svelte.ts` mirrors the database and everything redraws when it changes.
- **Rules are pure functions** in `app/src/lib/`: what capture makes of a line of text, when a repeating to-do is next due, what the Today tab shows. They take plain records and return plain records, so they are tested without a browser.
- **Every write is undoable.** All changes to items and lists go through `apply` in `db.ts`, which returns a function that restores what was there before. The undo toast calls it.
- **One record shape for notes, to-dos and shopping entries** (`Item` in `model.ts`), so changing an item's kind loses nothing.
- **Backups are checked field by field** when read (`backup.ts`). A file from an older version is brought up to date by the same code. When the stored data changes shape, raise `BACKUP_FORMAT` and add a database version in `db.ts`.

### Points, streaks and quests

Nothing about the game is stored as a running total. The activity log records each completion with the points it earned, and purchases as negative points. The balance, level, streak, bond and quest progress are all worked out from the log by `summarize` in `game.ts`. Undoing a completion removes its log entry, so everything it earned goes with it.

- **Chores** earn 5, 10 or 20 points by effort, plus half again when overdue (double when a whole interval overdue), plus half again when disliked (double when hated). Redoing a chore within a quarter of its interval earns 1 point.
- **Steps** each earn an even share of the chore's points. Ticking the last step completes the chore and pays the remainder.
- **To-dos** earn 5, plus 2 per priority level, plus 3 when overdue. Shopping entries earn 1.
- **Streak** counts days with a completion. One missed day in each Monday-to-Sunday week is forgiven.
- **Quests** are made once a day (three) and once a week (one) from what is overdue, saved, and never regenerated. Each daily quest pays 5 points and the weekly pays 25.

### The companion

Its lines are in `app/content/dialogue.ts`, grouped by event. Its art is in `app/content/companion/`, one image per pose.

**Art contract.** This holds for the default art and for every companion image later, uploaded or generated:

- A portrait canvas, taller than wide. 2:3 is expected (NovelAI's 512×768), and other shapes are measured and fitted.
- The whole character on it, with the same canvas size for every pose.
- A transparent background, or a plain backdrop that fills the canvas.
- The face in roughly the same place in every pose.

The art is shown two ways from the same image: whole on the Companion tab, and as a close-up of the face beside the speech bubble on Today. Where to crop the close-up is a `Framing` (`app/src/lib/portrait.ts`): the centre of the face and how much of the image's height to show. It travels with the art. Screens get art only from `companionArt()` in `state.svelte.ts`, which returns the images and their framing, so a custom or generated companion plugs in there and stores its framing in its character card.

**The five SVGs in the folder are placeholders.** To use real art, put `idle.png`, `happy.png`, `proud.png`, `sleepy.png` and `concerned.png` beside them. They replace the placeholders with no code change, and the close-up switches to the framing for a standing figure. If the face sits somewhere unusual, set `framing` in `app/content/companion/index.ts`.

The tone rule is tested: no line may scold or count what was missed.

### Trips

A trip is one record, and everything in it (a packing item, a task, a stop, an expense, a phrase card) is a trip entry of some kind, all one shape. That is why a wish becomes an itinerary stop just by being given a day.

- **Templates** are in `app/content/trips.ts`. A new trip copies its template's packing list, tasks and phrase cards. Every template builds on the general one, and Japan adds its own to each.
- **Tasks before leaving** are stored as days before departure, not as dates, so they move when the trip does.
- **Changing the leaving date moves the whole trip**: the return date and every itinerary stop shift by the same number of days. Expenses and journal entries are records of real days and stay put.
- **Stops open in Apple Maps** by place name, or use a pasted maps link as it is.
- **The exchange rate** is the one thing the app fetches from the network (`rates.ts`). It sends two currency codes and nothing else, and the trip keeps the last rate so the converter works offline. A rate can also be typed in.
- **Calendar files** (`ics.ts`) are written without a time zone, so a 9:00 stop stays at 9:00 when the phone changes zone.
- **Travel mode** is on while a trip's dates include today: Today leads with the day's stops, quests leave chores out, and the companion does not mention them.
- **The outfit tag** on a trip picks a set of companion lines (`outfits` in `dialogue.ts`) from a week before the trip until it ends. Later it will also pick the generated appearance.

### Quick capture rules

In order: a shopping lead-in followed only by groceries ("buy milk") makes shopping entries; a leading verb ("call", "pay") makes a to-do, and a day word at the end ("tomorrow", "friday") sets its due date; text that is only groceries makes shopping entries, one per item; anything else is a note in the Inbox. `#word` becomes a tag. Inside a list, entries take that list's kind. The chips under the capture box re-file the last capture with one tap.

To teach capture a new grocery, add the word to its section in `app/content/groceries.ts`.

On the Chores tab the capture box adds a chore instead. "Vacuum weekly" and "Change sheets every 2 weeks" set how often; without that a chore is weekly.

## Rules for this codebase

- All user data stays on the phone. The Worker holds one push subscription and a queue of reminder titles and times.
- The app must work with the Worker unreachable and with NovelAI switched off.
- The NovelAI token is stored only on the phone and sent only to NovelAI.
- Each feature area is its own module with tests for its rules.
- The repository is public. It holds no secrets and no personal data, and must stay that way.

## Deploying the Worker

Not needed until Phase 4. With a Cloudflare account, from the project folder:

```
npx wrangler login
cd worker
npx wrangler kv namespace create STORE
```

Paste the printed id into `worker/wrangler.toml`. Then generate secrets and store each one:

```
npm run vapid-keys
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put APP_KEY
npx wrangler secret put VAPID_SUBJECT
```

`VAPID_SUBJECT` is a contact address the push service can use, written as `mailto:you@example.com`.

```
npm run worker:deploy
```

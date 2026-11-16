# Companion Productivity App

A Home Screen web app for one iPhone: notes, to-dos, shopping, chores and trips, built around a companion character. The full plan is in [docs/build-plan.md](docs/build-plan.md).

**Current stage: Phase 6, the NovelAI companion. Every phase of the plan is built.** The app has notes, to-dos and shopping (Phase 1), chores, points and a companion (Phase 2), trips (Phase 3), notifications sent through the Worker (Phase 4), a companion with its own picture, character and voice, saved as a character card (Phase 5), and an optional mode where NovelAI draws the companion in an outfit for each situation and writes what it says (Phase 6). Phase 0's findings are in [docs/phase-0-results.md](docs/phase-0-results.md).

**The NovelAI mode has not been run against NovelAI itself.** It was built from the requests Phase 0 proved on the phone and tested against a stand-in. The first real run is on the phone, with a real token.

Not built from the plan: habits, the weekly review and task aging (Phase 2 extras); dragging stops between days and general list templates (Phase 3); a character reference image for generated art (Phase 6).

## Layout

| Folder | Holds |
| --- | --- |
| `app/` | The app: Svelte, TypeScript, Vite. Published to GitHub Pages |
| `app/src/lib/` | The rules and the data layer. Plain TypeScript with a test beside each file |
| `app/src/screens/`, `app/src/ui/` | The screens and the pieces they share |
| `app/content/` | Plain data: grocery words and store sections, the companion's lines and art, and trip templates |
| `worker/` | The Cloudflare Worker: holds the list of coming notifications and sends each when it is due |
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

Its art is in `app/content/companion/`, one image per pose, until a picture is uploaded.

**Dialogue styles.** A style is a full set of lines for the same events. Calm is in `app/content/dialogue.ts`, and Cheerful, Teasing, Formal and Deadpan are in `app/content/styles.ts`. To add a style, copy one, rewrite its lines, and add it to `STYLES`. The tests check that every style covers every event, uses only the words in braces that its event fills in, and never scolds.

**Who the companion is** is a `CompanionCard` (`card.ts`): name, description, personality, example lines, the chosen style, the appearance prompt, default outfit, outfit rules and seed that NovelAI draws from, and the framing of its face. It is edited from Customize on the Companion tab and stored on the phone with its pictures. Bond level and unlocks are progress, not identity, so they are never part of it.

**Pictures.** One uploaded picture replaces the default art. Happy, proud, sleepy and concerned can each have their own, and use the main one otherwise. A picture is scaled down to 1024 pixels on its longer side and stored in the database as a data address, so it is in the backup file too. The sliders under Close-up set the card's framing.

**Character card file.** "Save as a card" writes the main picture as a PNG with the card inside it, in the SillyTavern V2 layout: a text chunk named `chara` holding the card as base64 JSON. The standard fields carry name, description, personality and example lines, and this app's own fields sit in `extensions.companion_app`. Loading a card reads the same chunk and takes the file's picture as the main picture. Fields this app does not use are kept and written back, so a card from another tool exports as it came. The file has to be saved to Files: Photos re-encodes pictures and drops the character.

**On the Companion tab:** a daily check-in (a low day turns on low-energy mode), the count of lines the bond level has unlocked, completions over the last eight weeks, the chores waiting longest, and what the companion has said lately. That history, and the check-in answer, are kept on the phone outside the backup. When tapped, the companion sometimes recalls the biggest win of the last month or remarks on a week that beat the last one. It never remarks on a week that did not.

**Art contract.** This holds for the default art and for every companion image later, uploaded or generated:

- A portrait canvas, taller than wide. 2:3 is expected (NovelAI's 512×768), and other shapes are measured and fitted.
- The whole character on it, with the same canvas size for every pose.
- A transparent background, or a plain backdrop that fills the canvas.
- The face in roughly the same place in every pose.

The art is shown two ways from the same image: whole on the Companion tab, and as a close-up of the face beside the speech bubble on Today. Where to crop the close-up is a `Framing` (`app/src/lib/portrait.ts`): the centre of the face and how much of the image's height to show. It travels with the art. Screens get art only from `companionArt()` in `state.svelte.ts`, which returns the images and their framing, so a custom or generated companion plugs in there and stores its framing in its character card.

**The five SVGs in the folder are placeholders.** To use real art, put `idle.png`, `happy.png`, `proud.png`, `sleepy.png` and `concerned.png` beside them. They replace the placeholders with no code change, and the close-up switches to the framing for a standing figure. If the face sits somewhere unusual, set `framing` in `app/content/companion/index.ts`.

The tone rule is tested for every style: no line may scold or count what was missed.

### NovelAI

Optional, and switched on under Customize on the Companion tab. With it off, offline, or failing, the companion shows the nearest picture it has and says its pre-set lines.

- **All calls are in `app/src/lib/novelai/`.** `requests.ts` builds what is sent and reads what comes back, `client.ts` sends it, and `codec.ts` decodes the picture stream. NovelAI has no official API for other apps and changes without notice, so when something breaks, those three files are where it is fixed. The request bodies are the ones Phase 0 proved.
- **The token** is stored on the phone, outside the backup file, and is sent only to `image.novelai.net` and `text.novelai.net` in the Authorization header.
- **Pictures.** The prompt is the card's base prompt, the outfit's tags, the mood's tags, and fixed framing tags (whole body, standing), at 512×768. V5 is used when the account can draw with it for free, V4.5 otherwise, and V4.5 is tried when a V5 request is refused. Each picture is shown to keep, redo or discard, and only a kept one is stored (as a JPEG, named `nai:<look>:<pose>`).
- **Backgrounds.** V5 draws a truly transparent background. NovelAI's own page asks for it with the `transparent background` tag in the prompt plus two switches in the request (`straight_alpha` and `tag_hint_transparent_background`), and the switches alone do nothing, so the app sends all three. V4.5 cannot, and is asked for a plain white backdrop. A picture that comes back transparent is stored exactly as it came, as a PNG of a few hundred kilobytes. One that does not is stored as a JPEG.
- **The everyday look** is drawn first, in the card's default outfit. Approving it fixes the character's seed, which every later picture reuses. Changing the base prompt or an outfit's tags gives that look a new name, so pictures of the old appearance are never shown for the new one.
- **Outfits** (`outfits.ts`). The first situation that applies decides: a trip under way or within a week (the trip's outfit tag), a chore or a shopping entry finished in the last half hour, late evening, a milestone day, the season, and otherwise the card's default outfit. The card can change any outfit's tags, switch one off by leaving it empty, and add outfits that are worn only when chosen by hand.
- **The nearest picture.** A look or mood not drawn yet is stood in for by the same look resting, then the everyday look in that mood, then the everyday look resting.
- **The spending guard** (`chooseModel`). A picture is free only where that is certain: an active Opus subscription, and for V5 some of its usage allowance left. Anything else counts as paid. A drawing nobody asked for is never paid for. A drawing that was asked for and would spend Anlas asks first, shows the balance, and reports what was spent after.
- **Drawing on its own.** A look on screen with no picture is drawn a few seconds later, only online, only when free, up to a daily limit, and never one that was discarded in the same session. It can be switched off, leaving a "Draw this look" button.
- **Lines.** For greetings, completions, milestones and taps, the pre-set line is shown at once, and a generated one replaces it if it arrives within a few seconds. The model is given a short scene: who the character is, its example lines, what just happened, and an open quotation mark. The reply is cut at the first closing quotation mark, and dropped if it is empty, cut off, oddly formatted, or breaks the tone rule. Points earned are added by the app, not the model. Completions in quick succession get one line between them.

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

### Notifications

A web app on iPhone cannot schedule its own notifications, so the Worker sends them. It decides nothing.

- **The phone works out the list.** `plan` in `notify.ts` builds every notification for the next two weeks from the data, as if nothing more gets done. That is exactly right while the app stays closed, because the data only changes when it is open. Each change makes a new list, which replaces the Worker's whole list (`PUT /reminders`). There is no per-reminder create, edit or delete to keep in step.
- **The Worker holds** one push subscription and that list: for each entry a time, a title and a line of text, where to open, and the icon badge number. Once a minute it sends what has come due. An entry is marked sent before it is sent, so a failure is dropped and never repeated.
- **Kinds:** a task reminder (a to-do with a due date and a "Remind at" time), the morning summary, a chore nudge on the day a chore goes past due, the streak saver, trip tasks on the day they are due, and the backup reminder. With the morning summary off, trip countdown marks arrive on their own.
- **The streak saver** only comes on an evening when leaving the day empty would shorten the streak. A day the week's grace still covers gets none.
- **Quiet hours** move a notification to the moment they end. **The daily cap** holds back nudges (chores, streak, trips, backup), never a task reminder or the morning summary.
- **Wording** comes from the companion's lines (`push…` events in `dialogue.ts`), picked by the notification's id so it does not change from one list to the next.
- **Hide the text** sends "You have a reminder" for everything, so no wording leaves the phone.
- **The Worker's address and key** are entered once in Settings and stored on the phone, outside the backup file. Turning notifications off deletes the subscription and the list from the Worker.
- **Tapping a notification** opens the app at an address such as `#/item/<id>`. The service worker's notification code is `app/public/push-sw.js`, loaded by the generated service worker.

Differences from the build plan: the Worker stores no repeat rules, because the phone sends the next two weeks already worked out. If the app is not opened for two weeks, notifications stop until it is.

### Quick capture rules

In order: a shopping lead-in followed only by groceries ("buy milk") makes shopping entries; a leading verb ("call", "pay") makes a to-do, and a day word at the end ("tomorrow", "friday") sets its due date; text that is only groceries makes shopping entries, one per item; anything else is a note in the Inbox. `#word` becomes a tag. Inside a list, entries take that list's kind. The chips under the capture box re-file the last capture with one tap.

To teach capture a new grocery, add the word to its section in `app/content/groceries.ts`.

On the Chores tab the capture box adds a chore instead. "Vacuum weekly" and "Change sheets every 2 weeks" set how often; without that a chore is weekly.

## Rules for this codebase

- All user data stays on the phone. The Worker holds one push subscription and the list of coming notifications: times, titles and one line of text each.
- The app must work with the Worker unreachable and with NovelAI switched off.
- The NovelAI token is stored only on the phone and sent only to NovelAI.
- Each feature area is its own module with tests for its rules.
- The repository is public. It holds no secrets and no personal data, and must stay that way.

## Deploying the Worker

The Worker was set up in Phase 0 (the KV namespace id is in `worker/wrangler.toml`, and the secrets are stored in Cloudflare). After a change to `worker/`, publish it:

```
npm run worker:deploy
```

Then, in the Home Screen app: Settings, Notifications, enter the Worker's address and the `APP_KEY`, and turn notifications on. "Test in 1 minute" checks delivery with the app closed.

To set up a Worker from nothing, with a Cloudflare account:

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

`VAPID_SUBJECT` is a contact address the push service can use, written as `mailto:you@example.com`. `ALLOWED_ORIGINS` in `wrangler.toml` lists the pages that may call the Worker.

The relay to NovelAI that Phase 0 added is gone, since the app calls NovelAI directly. The "Through the Worker" option on the Phase 0 NovelAI test page no longer works.

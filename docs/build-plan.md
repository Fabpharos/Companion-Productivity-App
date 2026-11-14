# Companion Productivity App: Build Plan

Nov 14, 2026 · @Sam Hudson

## Summary

A Home Screen web app for one iPhone that combines notes, to-dos, shopping lists, chores and trip planning, built around a companion character who grows as tasks get done. It is hosted on GitHub Pages, keeps its data on the phone, and uses one free Cloudflare Worker for notifications.

**Decided**

- Web app (PWA) added to the Home Screen. No Mac, no Apple developer fee.
- Hosting on GitHub Pages. All user data stays on the phone.
- A free Cloudflare account runs the notification Worker.
- Companion has three modes: default (built-in art and lines), custom (uploaded image, selectable dialogue styles), and NovelAI (generated appearance and reactions).
- NovelAI account is Opus tier. Images use Diffusion V5 with V4.5 as fallback.
- Trips tab works for any trip. Japan (Feb 26 – Mar 8, 2027) is the first.
- The default companion has no name or personality. A character card PNG saved on the device defines both, and is required for NovelAI mode.

**Not yet verified (Phase 0 settles these)**

- Whether NovelAI accepts requests sent directly from a browser page. If not, the Worker relays them.
- That web push reaches this specific phone and iOS version once the app is on the Home Screen.
- The exact V5 request format. V5 launched recently and third-party notes describe a streaming endpoint with a different body from V4.5.

Build order: Phase 0 tests, then core app, chores and game loop, trips, notifications, custom companion, NovelAI companion. Each phase ends with something usable on the phone.

## Architecture

The app is a set of static files served by GitHub Pages that runs entirely on the phone, plus one Cloudflare Worker for notifications.

&#91;embedded content: app architecture · phone, hosting, Worker, push, NovelAI\]

The phone holds all data. The Worker receives only reminder times and titles, and the NovelAI token goes only to NovelAI, or through the Worker's relay if Phase 0 shows direct calls are blocked.

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Catches mistakes early in a project built mostly by Claude Code |
| Interface | Svelte with Vite | Small output, fast on a phone, simple to read |
| Storage | IndexedDB through the Dexie library | Holds structured data and images, works offline |
| Offline and install | Web app manifest and a service worker (vite-plugin-pwa) | Makes it installable and able to open with no signal |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push | Free, and updates reach the phone automatically |
| Notifications | Cloudflare Worker with a small key-value store and a one-minute timer | Free tier, no server to maintain |
| Character card | PNG with embedded character data, read and written in the browser | No server involved |

**Repository layout**

- `app/` holds the web app: screens, data layer, companion, game rules, NovelAI module.
- `app/content/` holds dialogue styles, default companion art and trip templates as plain data files.
- `worker/` holds the Cloudflare Worker.
- `spikes/` holds the Phase 0 test pages.
- `docs/` holds this plan and the Phase 0 results.

**Rules for the build**

- Each feature area (lists, chores, trips, companion, NovelAI, notifications) is its own module with tests for its rules.
- The app must work fully with the Worker unreachable and with NovelAI switched off.
- Stored data carries a version number so later updates can migrate it without loss.

## Data model

Everything below lives in the phone's on-device database (IndexedDB). One export button writes all of it to a single backup file, and import restores it.

| Record | What it holds |
| --- | --- |
| Item | A note, to-do or shopping entry: text, type, list, tags, due date, done state, optional trip link |
| List | Named lists (Shopping, Inbox, custom), with store sections for shopping |
| Chore | Name, repeat interval, last done date, sub-steps, effort rating, dislike rating |
| Habit | Name, daily target, check-in history |
| Trip | Name, destination, dates, home and local currency, saved exchange rate, companion outfit tag |
| Trip entry | Belongs to a trip: packing item, pre-departure task, itinerary stop (day, time, map link), expense, phrase card, journal note |
| Game state | Points, level, streak, grace days left, bond level, unlocked outfits and lines, reward wish-list |
| Companion | Active mode, character card (name, personality, base prompt, default outfit), dialogue style, uploaded image |
| Sprite cache | Generated or uploaded images keyed by outfit and mood, with the model used |
| Reminder | Local copy of each scheduled notification and the id the Worker knows it by |
| Settings | Quiet hours, low-energy mode, NovelAI token, spending limit, theme |
| Activity log | Dated record of completions. Feeds the weekly review, streaks and companion memory |

The NovelAI token is stored only in Settings on the phone. It never goes in the GitHub repository, and the backup file leaves it out unless you choose to include it.

## Phase 0: Feasibility tests

Two throwaway test pages decide how much the Worker has to do. Both are run on the actual phone before any real code is written.

**Test A: NovelAI from the browser**

1. A single page on GitHub Pages with a token box and three buttons.
2. Button 1 requests a small V5 image (`nai-diffusion-5-full`) from `image.novelai.net`. Button 2 does the same with `nai-diffusion-4-5-full`. Button 3 requests one short text reply from the text API.
3. Record for each: works directly, blocked by the browser (CORS), or fails for another reason. Also record the Anlas balance before and after.

Outcome: if any call is blocked, the Worker gets a relay route for that call. The token is sent with each request and never stored on the Worker.

**Test B: Push to the Home Screen app**

1. A minimal installable page with a manifest, a service worker and an "Enable notifications" button.
2. A minimal Worker that stores the push subscription and sends one test notification on request, then one on a 5-minute delay with the app closed.
3. Confirm the notification arrives on the lock screen and that tapping it opens the app.

Outcome: confirms the notification design in Phase 4, or shows which iOS setting or version is in the way.

**Done when:** both results are written down in the repo's notes file, with the working request format for V5, V4.5 and text.

## Phase 1: Core app

A usable notes, to-do and shopping app on the Home Screen, working offline, with no companion yet.

- **App shell:** five tabs (Today, Lists, Chores, Trips, Companion), installable, full-screen, light and dark themes.
- **Quick capture:** one text box on every screen. It sorts entries by simple rules: grocery words go to Shopping, verbs like "call" or "buy" make a to-do, anything else becomes a note. A chip lets you correct the guess with one tap.
- **Notes:** plain text with tags and pinning.
- **To-dos:** due dates, repeat rules, priority, sub-tasks, swipe to complete.
- **Shopping list:** grouped by store section, with a staples list that restocks in one tap.
- **Inbox:** anything captured without a clear home lands here for later sorting.
- **Search:** one search across notes, to-dos, lists and trips.
- **Undo:** every delete and completion can be undone for a few seconds. Completed items go to an archive.
- **Backup:** export everything to one file through the share sheet, and import it back. The app reminds you to back up every two weeks.
- **Offline:** the service worker caches the app so it opens with no signal.
- **Deploy:** pushing to the main branch builds and publishes to GitHub Pages automatically.

**Done when:** the app is on the Home Screen, survives airplane mode, and a backup file restores correctly after clearing the app's data.

## Phase 2: Chores, game loop and default companion

Chores are tracked by how overdue they are, every completion earns points, and a built-in companion reacts.

**Chores**

- Each chore has a repeat interval and shows days since last done, shading from green to red.
- Chores can be split into small steps. Each step is checkable and earns its own points.
- "Just 5 minutes" starts a short timer. Stopping when it ends counts as a completion.
- Roulette picks one chore for you, weighted toward the most overdue.
- Low-energy mode shows only chores rated as easy.

**Game loop**

| Element | Rule |
| --- | --- |
| Points | Base value by effort rating, with a bonus for overdue and for disliked chores |
| Levels | Point thresholds that rise gradually |
| Streak | Counts days with at least one completion. One grace day per week keeps it alive |
| Quests | Three daily and one weekly, generated from what is overdue |
| Rewards | Your own wish-list items with a point price. Buying one deducts points |
| Bond level | Rises with completions and time spent together. Unlocks companion content |

**Default companion**

- Art supplied by Sam in five poses: idle, happy, proud, sleepy, concerned. No name or personality.
- Pre-set dialogue grouped by event: greeting, task done, streak milestone, overdue nudge, level up, trip countdown, long absence.
- Tap to interact: tapping the companion gives a line, a suggestion for what to do next, or a small idle animation.
- Tone rule: the companion encourages and celebrates. It never scolds or guilt-trips about missed days.

**Done when:** completing a chore updates its color, awards points, and triggers a companion reaction on the Today tab.

## Phase 3: Trips tab

Any number of trips, each built from the same set of tools, with Japan (Feb 26 – Mar 8, 2027) created first from a reusable template.

**Per trip**

- **Overview:** name, destination, dates, and a countdown that also appears on the Today tab.
- **Packing list:** grouped by category, with a reusable base list that copies into each new trip.
- **Before I leave:** pre-departure tasks with due dates relative to departure (for example, "notify bank: 7 days before").
- **Itinerary:** day-by-day stops with time, notes and a link that opens the place in a maps app. Stops can be dragged between days. Available offline.
- **Wish-list:** places and things not yet assigned to a day.
- **Budget and spending:** a budget per trip, quick expense entry in the local currency, running total in both currencies.
- **Currency converter:** fetches the rate when online and keeps the last one for offline use.
- **Phrase cards:** large-text cards in the local language to show to staff, organized by situation.
- **Shopping and souvenirs:** a trip-specific list with who each item is for.
- **Journal:** dated notes during the trip.

**Templates**

- A trip template stores packing categories, pre-departure tasks and phrase card sets.
- The Japan template adds Japan-specific pre-departure tasks (eSIM, transit card, cash) and a starter set of Japanese phrase cards.

**Companion involvement**

- Each trip can set an outfit tag for the companion (kimono for Japan). In default and custom modes this picks a line set. In NovelAI mode it changes the generated appearance.
- The companion announces countdown milestones and flags pre-departure tasks that are coming due.
- During the trip dates the app switches to a travel mode: Today shows the day's itinerary first, and chore nudges pause.

**Done when:** the Japan trip exists with a live countdown, a packing list, and at least one itinerary day that opens correctly offline.

## Phase 4: Notifications

A Cloudflare Worker sends the notifications, because a web app on iPhone cannot schedule its own. This is the one part of the app that does not live on the phone.

**How it works**

1. On the Home Screen app, you tap "Enable notifications" and allow them. The app registers a push subscription with the Worker.
2. When a reminder is created or changed, the app sends the Worker a time, a short title and a kind.
3. The Worker checks every minute for reminders that are due and sends them through Apple's push service.
4. Tapping a notification opens the app on the related item.

**What the Worker stores**

- The push subscription for this phone.
- For each reminder: an id, the time, a short title, and the repeat rule.
- Nothing else. Notes, lists, trip details and the NovelAI token stay on the phone.
- A privacy setting replaces titles with a generic line ("You have a reminder") so no task text leaves the phone at all.

**Notification kinds**

| Kind | When it fires |
| --- | --- |
| Task reminder | At the due time you set |
| Chore nudge | When a chore crosses into overdue, at most once a day per chore |
| Morning summary | Once a day at a time you pick: today's three, overdue count, countdown |
| Streak saver | Evening, only if nothing was completed that day |
| Trip milestone | Countdown marks and pre-departure tasks coming due |
| Backup reminder | Every two weeks |

**Controls**

- Quiet hours, a daily cap on nudges, and a per-kind on/off switch.
- The companion's current dialogue style words the notification text.
- The app icon badge shows the count of items due today.

**Limits to know**

- The app must be opened from the Home Screen icon. Notifications do not work from a Safari tab.
- Cloudflare's free tier is far more than one phone needs.
- The Worker has a secret key so only your app can register reminders with it.

**Done when:** a reminder set for two minutes ahead arrives with the app closed and the phone locked.

## Phase 5: Custom companion and character card

The companion becomes editable: your own image, a choice of dialogue styles, and a character card PNG that holds its identity.

**Custom appearance**

- Upload one image to replace the default art. The app crops and resizes it and stores it on the phone.
- Optional extra uploads per mood (happy, sleepy, proud). Missing moods fall back to the main image.

**Dialogue styles**

- Each style is a full set of pre-written lines covering the same events as the default set.
- Starting styles: cheerful, calm, teasing, formal, deadpan. One tap switches between them.
- Styles are plain data files, so adding a new one later means writing lines and no code.

**Character card PNG**

- The card is a normal PNG image of the companion with the character data embedded inside the file.
- It uses the SillyTavern character card format (V2), so the same file opens in other character tools.
- Standard fields hold name, description, personality and example lines. An app-specific section holds the base appearance prompt, default outfit, chosen dialogue style and outfit rules.
- The card is saved in the app's storage and can be exported to the Files app through the share sheet. Importing a card PNG loads that character.
- Bond level and unlocks are progress, not identity, so they live in game state and are not written into the card.

**Companion screen**

- Shows the companion large, with bond level, unlocked outfits and lines, and recent milestones.
- Tap interactions, a short daily check-in, and a history of things the companion has said.

**Done when:** an uploaded image replaces the default, switching style changes the next line spoken, and an exported card re-imports with the same character.

## Phase 6: NovelAI companion

An optional mode where NovelAI draws the companion and writes its reactions, with everything cached so the app still works offline and costs stay near zero.

**Setup**

- Paste a Persistent API Token from NovelAI account settings ([NovelAI docs](https://docs.novelai.net/en/text/usersettings/account/)). Generating a new token invalidates the old one.
- Create or import a character card first. NovelAI mode stays locked without one. The card holds the name, personality, base character prompt and default outfit.
- The app generates the default appearance, you approve or re-roll it, and it becomes the card image.

**Appearance generation**

| Setting | Plan |
| --- | --- |
| Primary model | `nai-diffusion-5-full` ([model IDs](https://github.com/Pasta-Devs/Marinara-Engine/issues/5343)) |
| Fallback | `nai-diffusion-4-5-full`, used automatically if the V5 request fails |
| Endpoint | `image.novelai.net` ([API notes](https://tapwavezodiac.github.io/novelaiUKB/Using-the-API.html)). V5 reportedly uses the streaming image endpoint ([NekoAI-API](https://github.com/Nya-Foundation/NekoAI-API)) |
| Prompt | Base character prompt + current outfit tags + mood tags + a plain background |
| Consistency | Fixed seed per character, plus the approved default image as a character reference where the model supports it |
| Cutout | Transparent background if V5's option works through the API ([novelai-python](https://pypi.org/project/novelai-python/0.8.1/)), otherwise a plain backdrop |
| Size | A portrait size that stays inside the Opus free-generation limits |

**Context outfits**

A small rules table decides what the companion wears. The first matching rule wins.

| Context | Outfit example |
| --- | --- |
| Trip is active or within 7 days | The trip's outfit tag (kimono for Japan) |
| Doing chores | Apron, hair tied back |
| Shopping list open | Casual outfit with a tote bag |
| Late evening | Pajamas |
| Season or holiday | Seasonal outfit or accessory |
| Streak or level milestone | A celebratory accessory unlocked by bond level |
| Otherwise | Default outfit from the card |

- Rules are editable, and you can add your own context with its own outfit tags.
- Each outfit-and-mood combination is generated once, shown for approval, then cached on the phone. Re-rolls are manual.
- Generation happens only when the app is open and online. Offline, the nearest cached image is used.

**Text reactions**

- NovelAI has no chat product API. It has a text generation API for its story models, reached at `text.novelai.net` for Kayra and Erato, with replies capped near 150 tokens ([SillyTavern docs](https://docs.sillytavern.app/usage/api-connections/novelai/)).
- The app builds a short scene: the card's personality and example lines, what was just completed, streak and bond level, and the current context. The model continues with one line of companion speech.
- Erato is used on Opus. Phase 0 checks whether a newer chat-style endpoint is available and better suited.
- Triggers: task or chore completed, quest done, level up, streak milestone, morning greeting, and tapping the companion. Routine check-offs in quick succession are batched into one reaction.
- If the request fails, is slow, or the phone is offline, the pre-set line for that event is shown.
- Output is trimmed to the first complete line and discarded if it comes back empty or off-format.

**Spending guard**

- On Opus, V5 generations draw on a usage allowance, and go on to cost Anlas once it runs out ([novelai-python notes](https://github.com/LlmKira/novelai-python)). The app reads the account's remaining allowance and Anlas before generating.
- Any generation that would spend Anlas asks first and shows the cost.
- A daily cap on automatic generations, and a switch that makes all generation manual.

**Done when:** activating the Japan trip produces a kimono version of the approved character, and completing a chore produces a generated line in the card's voice.

## Extra features and the companion's part

These are the additions I recommend beyond what you listed, each with the phase it fits into and what the companion does.

| Feature | What it does | Companion's part | Phase |
| --- | --- | --- | --- |
| Today view | Shows three chosen priorities, what is due, and the trip countdown | Greets you and proposes the three | 1 |
| Inbox | Holds unsorted captures | Offers to sort it together when it piles up | 1 |
| Recurring to-dos | Bills, refills, weekly tasks | Mentions them the day before | 1 |
| Undo and archive | Recovers mistakes, keeps a record of done items | Looks back at milestones from the archive | 1 |
| Focus timer | A 25-minute timer tied to a task | Stays on screen, reacts at the end | 2 |
| Habits | Small daily check-ins such as water or stretching | Asks once a day, celebrates runs | 2 |
| Low-energy mode | Hides everything except easy tasks | Switches to a gentler line set | 2 |
| Rewards wish-list | Spend points on things you want | Hands the reward over | 2 |
| Weekly review | Sunday recap of completions, streak and overdue items | Delivers the recap and picks a highlight | 2 |
| Task aging | Old to-dos fade and ask "still needed?" | Suggests dropping or splitting stale tasks | 2 |
| Calendar export | Sends a due date or itinerary day to the iPhone calendar as a file | None | 3 |
| Templates | Reusable lists: packing, cleaning day, grocery staples | Suggests a template when a new list looks familiar | 3 |
| Quiet hours | Silences notifications at set times | Stays quiet, greets you after | 4 |
| Icon badge | Shows the number of items due today on the app icon | None | 4 |
| Companion memory | A short log of recent wins the companion can refer to | Refers back to earlier wins | 5 |
| Stats | Completions by week, most-skipped chores | Comments on trends without judgment | 5 |

**Left out on purpose**

- Syncing between devices and accounts. Everything stays on one phone, and the backup file covers device changes.
- Location-based reminders and Home Screen widgets. Web apps on iPhone cannot do these.
- Voice input. The keyboard's dictation button already works in the capture box.

## Risks and open questions

The NovelAI integration carries the most uncertainty, which is why it is tested first and built last.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| NovelAI blocks requests from a browser page | Images and text cannot be requested directly | Relay through the Worker. Settled by Phase 0 |
| NovelAI's API is unofficial for third-party apps and changes without notice | Generation breaks after an update, as happened when endpoints moved at the V5 launch ([report](https://dev.to/ilan_kim/running-novelai-v5-in-comfyui-nai-diffusion-5-full-works-and-the-error-fetching-anlas-400-is-a-18gl)) | All NovelAI calls sit in one module. V4.5 fallback, then cached images, then pre-set lines |
| Generated character looks different between outfits | The companion stops feeling like one character | Fixed seed, character reference, manual approval before an image is cached |
| iPhone clears the app's storage | Loss of notes and progress | Home Screen apps are exempt from the usual clearing. Backup reminders and one-tap export cover the rest |
| Token exposure | Someone else could use the NovelAI account | Token stored only on the phone, sent only to NovelAI or the relay, left out of backups by default |
| The GitHub repository is public on a free account | Anyone can read the code | No secrets or personal data in the repo. Worker secrets live in Cloudflare |
| Notification delays | A reminder arrives a minute or two late | Acceptable for chores. Time-critical alarms should stay in the iPhone Clock app |
| Scope | The full plan is large for a personal project | Each phase is usable alone. Phases 5 and 6 can wait until after the trip |

**Resolved Nov 14**

- Default companion art is supplied by Sam: five poses (idle, happy, proud, sleepy, concerned).
- Five dialogue styles at launch: cheerful, calm, teasing, formal, deadpan.
- No default name or personality. A character card supplies them and is required for NovelAI mode.
- The app should be usable before Feb 26, 2027. Phases 0 to 4 come first, and there is enough time for 5 and 6 as well.

## Setup checklist

These are the things only you can do. Everything else can be built with Claude Code.

- [ ] Create a GitHub repository for the app and turn on GitHub Pages
- [ ] Create a free Cloudflare account
- [ ] Check the iPhone's iOS version (Settings, General, About). Web push needs 16.4 or later
- [ ] Get a NovelAI Persistent API Token from account settings and keep it somewhere safe
- [ ] Write the base character prompt and default outfit for the NovelAI companion
- [ ] Provide five default companion poses as transparent PNGs on the same canvas size
- [ ] Run Phase 0 test pages on the phone and note the results

## Sources

As of Nov 14, 2026. NovelAI details come from third-party notes and are confirmed in Phase 0.

- [NovelAI docs: Account and Persistent API Token](https://docs.novelai.net/en/text/usersettings/account/)
- [NovelAI unofficial knowledge base: Using the API](https://tapwavezodiac.github.io/novelaiUKB/Using-the-API.html)
- [NekoAI-API: V5 models and streaming endpoint](https://github.com/Nya-Foundation/NekoAI-API)
- [novelai-python: V5 family and Opus usage](https://github.com/LlmKira/novelai-python)
- [SillyTavern docs: NovelAI text limits](https://docs.sillytavern.app/usage/api-connections/novelai/)
- [Kukuroo: web push for iOS on a Cloudflare Worker](https://zeli.app/en/story/49299667)
- [Apple: Sending web push notifications in web apps and browsers](https://developer.apple.com/tutorials/data/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md)

# Companion Productivity App

A Home Screen web app for one iPhone: notes, to-dos, shopping, chores and trips, built around a companion character. The full plan is in [docs/build-plan.md](docs/build-plan.md).

**Current stage: Phase 0, feasibility tests.** Two throwaway pages and a small Worker answer the open questions before the real app is written. Results go in [docs/phase-0-results.md](docs/phase-0-results.md).

## Layout

| Folder | Holds |
| --- | --- |
| `spikes/` | The Phase 0 test pages. Plain HTML and JavaScript, no build step |
| `worker/` | The Cloudflare Worker: web push, a queue of pending messages, a relay to NovelAI |
| `docs/` | The build plan and the Phase 0 results |
| `tools/` | Local helpers |
| `app/` | The app itself. Starts in Phase 1 |

Nothing is installed into the project. Tests run on Node's built-in runner, and Wrangler and TypeScript run through `npx`.

## Commands

Node 24 or later.

| Command | Does |
| --- | --- |
| `npm test` | Runs all tests |
| `npm run typecheck` | Type-checks the Worker |
| `npm run spikes` | Serves the test pages at http://localhost:4173 |
| `npm run vapid-keys` | Prints fresh Worker secrets |
| `npm run worker:deploy` | Publishes the Worker to Cloudflare |

## Running Phase 0

### 1. Publish the test pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository: Settings, Pages, set Source to **GitHub Actions**.
3. The workflow publishes `spikes/` to `https://<user>.github.io/<repo>/`.

The repository is public on a free account. It holds no secrets and no personal data, and must stay that way.

### 2. Test A on the phone

Open `…/novelai/` in Safari, paste the NovelAI token, and run the tests top to bottom. Run the V5 test once with each body format. Use "Copy results" and paste into the results file. No Worker is needed unless something is blocked.

### 3. Deploy the Worker

From the project folder, with a Cloudflare account:

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

`VAPID_SUBJECT` is a contact address the push service can use, written as `mailto:you@example.com`. Keep the `APP_KEY` value: the test page asks for it.

```
npm run worker:deploy
```

### 4. Test B on the phone

1. Open `…/push/` in Safari, then Share, Add to Home Screen.
2. Open it from the Home Screen icon.
3. Enter the Worker address and app key, then follow the four steps on the page.
4. Copy the log into the results file.

## Rules for this codebase

- All user data stays on the phone. The Worker holds one push subscription and a queue of reminder titles and times.
- The app must work with the Worker unreachable and with NovelAI switched off.
- The NovelAI token is stored only on the phone and sent only to NovelAI or the Worker's relay.
- Each feature area is its own module with tests for its rules.

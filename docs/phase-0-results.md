# Phase 0 results

Status: **test pages built, not yet run on the phone.** The tables below are filled in from the phone.

## What was learned while building (Nov 14, 2026)

These come from reading two client libraries ([novelai-python](https://github.com/LlmKira/novelai-python), [NekoAI-API](https://github.com/Nya-Foundation/NekoAI-API)) and one probe from a desktop browser. None of it replaces the phone run.

| Question | Finding | Confidence |
| --- | --- | --- |
| Does NovelAI allow calls from a browser page? | Probably yes. A page on `http://localhost:4173` sent `GET image.novelai.net/user/subscription` and `POST text.novelai.net/ai/generate` with a dummy `Authorization` header. Both came back as a readable `401 {"statusCode":401,"message":"Unauthorized"}`, so the preflight passed and the response was not hidden by CORS. | Medium: desktop Chromium, dummy token, and the image generation path itself was not exercised |
| Which host serves account data? | `image.novelai.net/user/subscription` and `/user/data`. `api.novelai.net` now answers third-party clients with a 400. | High: both libraries agree, and the probe above got a normal 401 from it |
| Where does Anlas appear? | `trainingStepsLeft` is an object: `fixedTrainingStepsLeft` + `purchasedTrainingSteps`. On Opus a `usage` object describes the V5 usage bar (`percent`, `purchasedPercent`, `isNegative`, `timeUntilNextPercent`). | Medium |
| V5 endpoint | `POST image.novelai.net/ai/generate-image-stream` with `params_version: 4`, `ucPresetId` / `qualityPresetId` in place of `ucPreset` / `qualityToggle`, and `stream: "msgpack"`. | Medium |
| V5 body encoding | **Disputed.** novelai-python sends `multipart/form-data` with the JSON in a part named `request` (copying the web client). NekoAI-API sends plain JSON. Test A tries both. | Open |
| V4.5 endpoint | Same streaming endpoint, plain JSON, `params_version: 3`. | High: matches a request captured from the web client |
| Image response | A sequence of frames: 4-byte big-endian length, then one MessagePack map with `event_type` (`intermediate`, `final`, `error`) and `image` bytes. | Medium |
| Text | `POST text.novelai.net/ai/generate` with `{input, model: "llama-3-erato-v1", parameters: {use_string: true, ...}}`, reply in `output`. | Medium |
| V5 limits | No vibe transfer and no character reference on V5. | Medium. This affects the Phase 6 consistency plan, which relies on a character reference "where the model supports it" |

## Test A: NovelAI from the browser

Run on: _phone model, iOS version, date_

Paste the table from the page's "Copy results" button here.

| Test | Route | Body | Path | Outcome | ms | Anlas | Usage bar | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Account and Anlas | Direct | – | | | | | | |
| V5 image | Direct | multipart | | | | | | |
| V5 image | Direct | json | | | | | | |
| V4.5 image | Direct | json | | | | | | |
| Text reply | Direct | json | | | | | | |

Only if something above is blocked, repeat it with "Through the Worker" selected.

**Working request for V5:** _paste the body that worked_

**Working request for V4.5:** _paste the body that worked_

**Working request for text:** _paste the body that worked_

**Decision:** _direct calls, or the Worker relays (which calls)_

## Test B: Push to the Home Screen app

Run on: _phone model, iOS version, date_

| Step | Result |
| --- | --- |
| Page installs to the Home Screen and opens full-screen | |
| Permission prompt appears and is granted | |
| Test sent with the app open arrives | |
| 1-minute test arrives with the app closed | |
| 5-minute test arrives with the phone locked | |
| Scheduled time versus arrival time | |
| Tapping the notification opens the app and shows the banner | |

Paste the page's log here.

**Decision:** _notification design in Phase 4 confirmed, or what is in the way_

## Design notes carried into later phases

- **Pending messages live under one KV key.** A list operation every minute would be 1,440 a day against a free-tier cap of 1,000. One key means one read per run. Fine for one phone; revisit only if the queue grows past a few hundred entries.
- **A due message is removed before it is sent.** A failed push is dropped, never repeated. A missed chore nudge is better than a duplicate.
- **The Worker authenticates with an `X-App-Key` header**, which leaves `Authorization` free to carry the NovelAI token through the relay untouched.
- **The relay adds nothing to the request.** It does not imitate the NovelAI site's `Origin` or `User-Agent`. If Test A shows NovelAI refuses requests from Cloudflare without them, that is a decision to make then, not a default.

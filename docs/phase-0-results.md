# Phase 0 results

Status: **Phase 0 complete (Nov 14, 2026).** NovelAI works directly from the page, and push from the Worker reaches the Home Screen app.

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

**Result: every call works directly from a page. No relay is needed.**

Run on: iPhone, iOS 18.7, Firefox for iOS (WebKit), Nov 14, 2026, from `https://fabpharos.github.io` in a browser tab.

| Test | Route | Body | Path | Outcome | ms | Anlas | Usage bar | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Account and Anlas | Direct | – | /user/subscription | Works (HTTP 200) | 388 | – | – | Tier 3, 8008 Anlas |
| V5 image | Direct | multipart | /ai/generate-image-stream | Works (HTTP 200) | 1031 | 8008 → 8008 | `{"percent":100,"purchasedPercent":0,"isNegative":false,"timeUntilNextPercent":6048}` | 23 stream events: 22 intermediate, 1 final. Final image 526,300 bytes, image/png |
| V4.5 image | Direct | json | /ai/generate-image-stream | Works (HTTP 200) | 2388 | 8008 → 8008 | same | 23 stream events: 22 intermediate, 1 final. Final image 566,264 bytes, image/png |
| Text reply | Direct | json | /ai/generate | Works (HTTP 200) | 1894 | – | – | Reply ran past the closing quote into a new scene (see below) |

**Working requests:** the unedited bodies in [spikes/novelai/presets.js](../spikes/novelai/presets.js): `v5Body` sent as a multipart form with the JSON in a part named `request`, `v45Body` as plain JSON, `textBody` as plain JSON.

**What this settles**

- NovelAI accepts image, account and text requests sent straight from a GitHub Pages page on the phone. The token goes only to NovelAI.
- V5 works with the multipart body on the streaming endpoint. Both models answer with the framed MessagePack stream, and the final event carries a PNG.
- A 512×768, 23-step image cost no Anlas on either model, and the V5 usage bar still read 100% afterwards.

**Not tested**

- V5 with a plain JSON body. Not needed, since multipart works.
- Running from the Home Screen app. This run was in a browser tab. The rules NovelAI applies are the same either way, so no difference is expected.
- Transparent background, and sizes above 512×768.

**Carried into Phase 6**

- The text model does not stop at the end of the companion's line. The reply was `It's nice to get chores done during the day. It will save us some time tonight." *** Her friend just finished the laundry, the fourth chore of the day. T…`. The planned trim (cut at the first closing quote or line break) is required, not optional, and `max_length` can be lower.
- Usage is reported as a percentage bar, not a count, so the spending guard should read `usage.isNegative` and `usage.percent` alongside Anlas.

**Decision:** the app calls NovelAI directly. The Worker's relay route stays unused and is removed in Phase 4 unless something changes.

## Test B: Push to the Home Screen app

**Result: works.** Reported by Sam on Nov 14, 2026, on the same iPhone (iOS 18.7), with the Worker deployed to Cloudflare.

The per-step log was not captured, so the table below is unfilled. The overall report was that the test "works well".

| Step | Result |
| --- | --- |
| Page installs to the Home Screen and opens full-screen | |
| Permission prompt appears and is granted | |
| Test sent with the app open arrives | |
| 1-minute test arrives with the app closed | |
| 5-minute test arrives with the phone locked | |
| Scheduled time versus arrival time | |
| Tapping the notification opens the app and shows the banner | |

**Decision:** the Phase 4 notification design stands: the Worker stores the subscription and a queue, and a one-minute timer sends what is due.

## Design notes carried into later phases

- **Pending messages live under one KV key.** A list operation every minute would be 1,440 a day against a free-tier cap of 1,000. One key means one read per run. Fine for one phone; revisit only if the queue grows past a few hundred entries.
- **A due message is removed before it is sent.** A failed push is dropped, never repeated. A missed chore nudge is better than a duplicate.
- **The Worker authenticates with an `X-App-Key` header**, which leaves `Authorization` free to carry the NovelAI token through the relay untouched.
- **The relay adds nothing to the request.** It does not imitate the NovelAI site's `Origin` or `User-Agent`. If Test A shows NovelAI refuses requests from Cloudflare without them, that is a decision to make then, not a default.

# DuetNest Tomorrow Ready

[Watch the 3-minute demo](https://ilyapolitik.github.io/duetnest-tomorrow-ready/video.html) · [Try the recorded chat cycle](https://ilyapolitik.github.io/duetnest-tomorrow-ready/)

Meta Global AI Developer Hackathon 2026 · Startups / Build for Your World · Illia Borovikov, 160418 OÜ.

The demonstrated event-revision workflow was developed during the hackathon. An isolated base existed on26October; see [NEW-WORK.md](NEW-WORK.md) for the contribution boundary. The hosted experience uses recorded fictional responses and needs no API key. Arbitrary-text/PDF/photo analysis is available in the separately configured local development route.

School plans change. Keep what you have done, see what changed, and know your next step.

## Judge walkthrough: no key, account, or model credit needed

Requires Node26 and npm. From this folder:

```sh
npm ci --ignore-scripts
npm run demo:build
npm run demo:preview
```

Open http://127.0.0.1:4320/ . The entry opens the English recorded walkthrough. Use the visible Interface language selector for Ukrainian or Estonian (drafts and plans stay in this browser); during an unsaved review finish or return to the message first. Alternatively, use http://127.0.0.1:4320/demo/chat.html?session=judge-chat-20261102&lang=uk .

The self-contained `dist-demo/` output can also be served by a static HTTP server. There is no server API or credential in this build. Installation needs internet; the recorded text cycle runs without a model connection afterward. Install scripts are unnecessary for this judge route. No `.env` file is needed. Do not open the HTML directly as a `file:` URL.

1. Choose **1 · Chat excerpt**, then **Show my next steps**. Name the event Riverside museum visit, check actions/dates, confirm and save.
2. Mark the returned form and packed water done. Raincoat becomes the next action.
3. Choose **A new message arrived**, then **2 · Time change**. Analyze and review08:20→08:05; water and unmentioned requirements stay. Confirm and apply.
4. Add another message using **3 · Cancellation**. Review the exact Ukrainian cancellation quotation; confirm that the entire selected trip is cancelled. Active preparation stops.
5. Reload and open history. **Restore previous version** returns08:05, completed water and pending raincoat. Reload again to check persistence.

Examples only fill the draft. Nothing is applied automatically. The banner explicitly labels recorded Meta responses; this is not live inference or a latency benchmark. Arbitrary text is rejected with a practice-mode explanation. The judge build is text-only; PDF/photo import remains in the separate live development prototype.

Plans belong to this browser and origin. Port4320 is separate from4318; changing port/browser does not migrate a plan. A fresh browser profile gives an empty walkthrough. Existing saved events can be retained and a new event created; do not clear unrelated browser data.

## Evidence and limits

`npm test` runs139 offline regression tests. `npm run demo:build` typechecks the project and builds the judge route. See EVALUATION.md for provider/agent/human evidence separately, and NEW-WORK.md for the contribution boundary. The local three-minute video uses current UI captures and synthetic English narration; it is an edited recorded-response walkthrough. Full unassisted parent acceptance is pending.

Exact EN/PL and UK texts are also in `demo/01-first*.txt`, `02-change*.txt`, `03-cancel*.txt`. The legacy `/demo/cycle.html` route accepts those fictional texts; `/demo/chat.html` uses the three visible chat samples and a fixed disclosed sample message date and does not call a provider.

## Separate live development prototype

`npm run dev` prepares PDF/OCR, voice and object-detection assets, including pinned downloads requiring internet/disk. It serves the live route on4318. A private `.env.server` with `MODEL_PROVIDER=fireworks` and `FIREWORKS_API_KEY` is required for live inference; no credential is supplied. Model: `accounts/fireworks/models/muse-spark-open`. Reviewed text is sent after explicit analysis. Failures are not silently retried. Development request limits are not a durable hosted spending cap. Do not expose the development API publicly.

`npm run build` is the broader frontend build with asset preparation. It is separate from the static judge build. Earlier calculation/voice/bag experiments are secondary prototypes, not integrated into the event cycle. No integration with production DuetNest is claimed.

## Distribution boundary

The original project code in this standalone hackathon repository is licensed under MIT. Third-party dependencies retain their own licenses. This repository excludes production DuetNest. See LICENSE. See THIRD-PARTY-NOTICES.md. The source archive excludes credentials, private account receipts, raw parent data and downloaded model binaries.

## Estonian interface

Use `?session=judge-chat-20261102&lang=et` on the recorded cycle route. The core first-message, revision, cancellation, history and undo interface is localized, including dates, counters and known action labels. Original quotations remain unchanged. The default replay uses a supplied Ukrainian chat and existing recorded responses, as disclosed on screen. Live requests can ask for Estonian output; this transport is tested with a mocked response. Fresh Estonian model accuracy, Estonian-source OCR/date/cancellation parsing and native-speaker review are not verified. Secondary lab experiments are outside this localization scope.


## Pasted chat intake

The live route accepts chat/email text and PDF/photo extraction. Supply a known message date to resolve today/tomorrow; use one event and one message date per excerpt. Original quotes and dates survive save, reload and history. Output requires review; no automatic messenger connection.

Current diagnostic evidence and limits are in EVALUATION.md. Two successful first-chat calls took10.837s and16.856s after explicit low reasoning; two other diagnostic outputs were rejected. This is not universal reliability or a throughput benchmark.

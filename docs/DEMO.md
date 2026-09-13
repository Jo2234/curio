# Curio walkthrough

The [123-second video](media/curio-live.mp4) shows the production app at 1440 × 1000, using GPT-4.1 for structured reasoning and GPT-Realtime-2.1 for spoken replies. The teacher’s example explanations are prewritten and typed through the app’s normal input; the judgments, questions and teach-back are real API responses. No microphone input is captured.

The lesson starts with a mistaken distance explanation for seasons. Curio marks it contradicted, asks about opposite seasons in Australia, and retains the original claim as superseded after the teacher corrects it. The complete spoken teach-back acknowledges gaps about daylight and direct sunlight. The report is then reopened after an actual server restart, with saved content preserved and zero new API calls. The reference answer and restored session are shown at the end.

## Provenance

Recorded on 13 September 2026 from commit `42b5dbdb727665397e7eb274637ed53314021955`. Commit `d0a6125` subsequently aligned the example environment and capture defaults with the models explicitly selected for this take; it did not change the recorded runtime.

All 12 upstream HTTP requests succeeded: 11 Chat Completions requests and one Realtime client-secret request. All seven Realtime responses completed, with no recorded browser or Realtime errors. This is one observed run, not evidence of general model reliability or educational effectiveness.

The footage is continuous, with no cuts, speed changes, added visual overlays or substituted results. Actual Realtime speech is retained in full. A separate locally generated Kokoro `af_heart` narrator explains the screen in the gaps; it is not Curio’s voice. Both speakers have optional embedded captions and a [WebVTT file](media/curio-live.vtt), with a [text transcript](media/curio-live.txt).

[Capture metadata](media/capture.json) records models, request counts, token usage, the restart assertion, timing and media hashes. [Narration metadata](media/narration.json) records voice provenance and cue windows. [Final validation](media/validation.json) confirms unchanged source video packets, AAC audio and 26 captions within the 122.791667-second duration. A malformed terminal Opus packet in the original recording’s final silence was discarded during decoding; no speech was replaced. Raw ledgers, temporary snapshots and credentials are not published.

## Record another live walkthrough

Follow [the live recorder instructions](../scripts/live/README.md). Use Node.js 22, ffmpeg/ffprobe, Playwright and a production build. Supply an OpenAI key and a new absolute private `CURIO_CAPTURE_DIR`, then run:

```bash
npm run live:capture
```

This makes billable API calls. The recorder drives the UI, retains continuous video and received audio, and writes a private request ledger and timeline. It stops and restarts its server to check recovery. Inspect actual outputs and audio alignment before publishing; model responses and timings vary. Add explanatory narration only after recording, retime it to the observed speech, and regenerate captions and hashes.

## Separate offline fixture capture

The deterministic fixture provider remains available for software checks without service credentials:

```bash
npm run demo:capture
```

Build first and install the optional Playwright tooling as described in the live recorder instructions. `CURIO_PLAYWRIGHT_MODULE` can point to an external Playwright module, `CURIO_BROWSER_EXECUTABLE` can select Chromium, and `FFMPEG_PATH` can select ffmpeg. `CURIO_DEMO_PORT` defaults to 3198. Leave `CURIO_DEMO_PACE` unset for normal timing.

This older recorder uses synthetic transcript submissions, a local fixture provider and a visible offline label. It exercises persistence and UI transitions without connecting Realtime. Its output goes only to ignored `.artifacts/offline-demo/`, so it cannot overwrite the published live media. It uses temporary session storage and cleans up its browser, server and provider.

Original capture material is covered by the project [MIT license](../LICENSE). Font and dependency notices remain in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

# Reproducing the Curio demonstration

The [video](media/curio-offline-demo.mp4) and [poster](media/curio-report.png) show the real Next.js application at 1280 × 720. They are an **offline demonstration — model responses are fixtures**. A recording-only caption overlay keeps that label visible. There is no live provider response, microphone recording or learner data in these assets.

The sequence creates a session through the setup UI, posts four synthetic teacher segments to the real transcript API, exposes a distance misconception and explicit repair, requests teach-back and the report through the normal controls, switches report tabs and opens the human review queue. The capture actually stops and restarts the server before reopening the report and session. It asserts that restoration makes zero calls even to the fixture provider.

The local provider in `scripts/demo/provider.mjs` returns deterministic structured examples. The production agents, coverage logic, SSE, persistence, report composition and UI run unchanged. The synthetic transcript uses spaced timestamps to exercise the lesson flow; displayed session duration is fixture time, not the video's running time. The separate Realtime voice connection stays disconnected. This proves the demonstrated software transitions, not live model correctness or educational effectiveness.

## Run

Use Node.js 22, ffmpeg/ffprobe and Playwright. Build first; the build fetches Google fonts. The recording itself confines browser traffic to the loopback app and points server reasoning at the loopback fixture provider.

```bash
npm ci
npm run build
# Optional capture tooling; it is not a production dependency or required CI check.
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run demo:capture
```

If Playwright is installed outside this checkout, set `CURIO_PLAYWRIGHT_MODULE` to its `index.mjs` path. `CURIO_BROWSER_EXECUTABLE` can select an already installed compatible Chromium executable. `FFMPEG_PATH` overrides ffmpeg; `ffprobe` must be on PATH. `CURIO_DEMO_PORT` defaults to 3198. Keep `CURIO_DEMO_PACE` unset for the full-length recording; a smaller millisecond multiplier is available only for script debugging.

The script uses a new temporary `CURIO_DATA_DIR`, a synthetic API token and fixture model names. It cleans up the server, browser, local provider and temporary data on completion or error. It never needs a real service key or modifies existing sessions. Output replaces only the three named assets under `docs/media/`.

`media/capture.json` records the build ID, browser version, duration, dimensions, media digest, fixture call stages and zero-call recovery assertion. Assets are original Johan Vaz demonstration material under the project MIT license. Font notices are retained separately in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Explanatory narration

The published MP4 now includes English narration and optional embedded captions. [The timed narration script](media/narration.json) records cue windows, actual speech endings, voice provenance, and source/output hashes; [WebVTT captions](media/narration.vtt) are also available. The H.264 video stream is copied unchanged, preserving the recorded actions and their timing.

The voiceover uses a generic synthetic Kokoro `af_heart` voice, generated locally after recording. It explains the interface; it does not demonstrate Curio's Realtime voice feature. The app's voice connection remains disconnected.

The capture command above recreates the silent base recording. Re-time the narration cues if recording timings change, synthesize each cue into its window, then mux the narration and captions while copying the video stream. The original silent asset hash is retained in `capture.json` and `narration.json`; Git history retains that asset. Validation on 13 September 2026 confirmed unchanged video packets, AAC narration, 12 caption cues, and no overlapping or overrun speech windows.

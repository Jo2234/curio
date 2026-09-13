# Record a live Curio walkthrough

This recorder drives the production UI and makes real, billable OpenAI requests. It uses typed teacher input, a live Realtime audio reply, structured claim verification, teach-back and reporting. It never substitutes API outputs or injects transcript/state data. Recordings contain ordinary app screens without added banners.

Build the app (`npm ci && npm run build`), install Playwright separately or set `CURIO_PLAYWRIGHT_MODULE` to its module, and supply:

- `OPENAI_API_KEY`, or `CURIO_API_ENV_FILE` pointing to a private environment file containing it. The recorder reads only that key and never writes it to artifacts.
- `CURIO_CAPTURE_DIR`: an absolute, private directory outside the repository. Use a new directory for every attempt.
- Optionally `CURIO_BROWSER_EXECUTABLE`, `CURIO_CAPTURE_PORT` (default 4181), and `FFMPEG_PATH`.
- Optionally `CURIO_REASONING_MODEL`, `CURIO_DEEP_MODEL` (both default `gpt-4.1`) and `CURIO_REALTIME_MODEL` (default `gpt-realtime-2.1`). Use models accessible to the key's project.

Run `npm run live:capture`. The script preserves continuous video, the remote Realtime audio track, application snapshots, observed model outputs, response IDs, token usage and an event timeline. The audio `offsetSeconds` in `capture.json` aligns its start with the source recording's wall clock; verify audiovisual alignment when editing. Provider request headers, API keys and ephemeral credentials are excluded from the ledger. The server log is redacted before writing.

The recorder deliberately includes a wrong explanation and a later correction as teacher input. Model judgments and replies are unscripted and must be inspected after each run; no particular score, misconception status, or final recommendation is assumed. An uncertainty statement may yield no atomic claims. The recorder waits for the transcript cursor to advance rather than requiring the model to invent a claim.

The final report is reopened after an actual server restart, comparing saved state and checking the API ledger contains no new calls. Any concise edit must retain the raw source and list removed waits/excerpts. Narration should describe only outcomes actually observed in that run.

Official API references checked for this capture:

- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 capabilities](https://developers.openai.com/api/docs/models/gpt-4.1)
- [Realtime API](https://developers.openai.com/api/docs/guides/realtime)
- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [Per-response instruction overrides](https://developers.openai.com/api/reference/resources/realtime/client-events#response.create)
- [WebRTC transport](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime)

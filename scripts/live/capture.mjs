// Record the real app with OpenAI. No providers, routes, states or responses are mocked.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, appendFile, copyFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.CURIO_CAPTURE_DIR;
if (!output || !path.isAbsolute(output)) throw new Error('Set CURIO_CAPTURE_DIR to an absolute private output directory.');
await mkdir(output, { recursive: true, mode: 0o700 });
if (process.env.CURIO_API_ENV_FILE) {
  const source = await readFile(process.env.CURIO_API_ENV_FILE, 'utf8');
  const value = source.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+?)\s*$/m)?.[1];
  if (!value) throw new Error('The supplied environment file does not define OPENAI_API_KEY.');
  process.env.OPENAI_API_KEY = value.replace(/^(['"])(.*)\1$/, '$2');
}
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
if (process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL !== 'https://api.openai.com/v1') throw new Error('Live capture only permits the official OpenAI API.');
const { chromium } = await import(process.env.CURIO_PLAYWRIGHT_MODULE || 'playwright');
const port = Number(process.env.CURIO_CAPTURE_PORT || 4181);
const origin = `http://127.0.0.1:${port}`;
const ledger = path.join(output, 'api-calls.jsonl');
const timeline = [];
const browserErrors = [];
const realtime = [];
const audioChunks = new Map();
const audioMeta = [];
let app, browser, context, page, video, startedAt, sessionId;
const key = process.env.OPENAI_API_KEY;
const redact = text => String(text).replaceAll(key, '[REDACTED]').replace(/\b(?:sk|ek)-[A-Za-z0-9_-]+\b/g, '[REDACTED]');
const environment = {
  ...process.env, OPENAI_BASE_URL: 'https://api.openai.com/v1', ANTHROPIC_API_KEY: '',
  CURIO_DATA_DIR: path.join(output, 'data'), CURIO_API_LEDGER: ledger,
  REASONING_PROVIDER: 'openai', REASONING_MODEL: process.env.CURIO_REASONING_MODEL || 'gpt-4.1',
  REASONING_MODEL_DEEP: process.env.CURIO_DEEP_MODEL || 'gpt-4.1', REALTIME_MODEL: process.env.CURIO_REALTIME_MODEL || 'gpt-realtime',
  NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--import=${pathToFileURL(path.join(root, 'scripts/live/observe.mjs')).href}`,
};
await writeFile(ledger, '', { mode: 0o600 });
async function startApp() {
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { void appendFile(path.join(output, 'server.log'), redact(chunk), { mode: 0o600 }); });
  for (let i = 0; i < 150; i++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${app.exitCode}. Inspect private server.log.`);
    try { if ((await fetch(origin)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('App startup timed out.');
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const done = new Promise(resolve => app.once('exit', resolve));
  app.kill('SIGTERM'); await done;
}
function mark(name, data = {}) {
  const entry = { name, atSeconds: (Date.now() - startedAt) / 1000, ...data };
  timeline.push(entry); console.log(JSON.stringify(entry));
}
async function snapshot() {
  const abort = new AbortController();
  const response = await fetch(`${origin}/api/sessions/${sessionId}/events`, { signal: abort.signal });
  assert(response.ok);
  const reader = response.body.getReader();
  let text = '';
  try {
    while (!text.includes('\n\n')) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
    const line = text.split('\n').find(line => line.startsWith('data: '));
    return JSON.parse(line.slice(6)).data;
  } finally { abort.abort(); await reader.cancel().catch(() => {}); }
}
async function waitState(predicate, label, timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await snapshot();
    if (predicate(state)) return state;
    await delay(350);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function waitQuiet(timeout = 90000) {
  await page.waitForFunction(() => window.__curioCapture.activeResponses === 0 && !window.__curioCapture.speaking && Date.now() - window.__curioCapture.lastResponseAt > 900, undefined, { timeout });
}
async function send(text, index) {
  await waitQuiet();
  const previous = await snapshot();
  await page.getByLabel('Teach Curio by text', { exact: true }).fill(text);
  mark(`input-${index}`, { text });
  await delay(1600);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const state = await waitState(state => state.segments.filter(s => s.speaker === 'user').length > previous.segments.filter(s => s.speaker === 'user').length && state.claimMapperCursor > previous.claimMapperCursor && state.claims.every(c => c.status !== 'observed'), `verified input ${index}`);
  mark(`verified-${index}`, { claims: state.claims.map(({ statement, status }) => ({ statement, status })) });
  await waitQuiet();
  await page.screenshot({ path: path.join(output, `input-${index}.png`) });
  await delay(1200);
}
async function flushAudio() {
  if (!page || page.isClosed()) return;
  await page.evaluate(async () => {
    const capture = window.__curioCapture;
    if (!capture) return;
    await Promise.all(capture.recorders.filter(r => r.state !== 'inactive').map(r => new Promise(resolve => { r.addEventListener('stop', resolve, { once: true }); r.stop(); })));
    await Promise.all(capture.pending);
  }).catch(() => {});
  for (const meta of audioMeta) {
    const chunks = audioChunks.get(meta.id) ?? [];
    if (chunks.length) await writeFile(path.join(output, `realtime-${meta.id}.webm`), Buffer.concat(chunks));
  }
}
try {
  await startApp();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CURIO_BROWSER_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || (url.origin === 'https://api.openai.com' && url.pathname === '/v1/realtime/calls') ? route.continue() : route.abort();
  });
  await context.exposeBinding('__recordRealtime', (_, event) => { realtime.push(event); });
  await context.exposeBinding('__recordAudioMeta', (_, meta) => { audioMeta.push(meta); audioChunks.set(meta.id, []); });
  await context.exposeBinding('__recordAudioChunk', (_, id, base64) => { audioChunks.get(id)?.push(Buffer.from(base64, 'base64')); });
  await context.addInitScript(() => {
    const capture = { activeResponses: 0, speaking: false, lastResponseAt: 0, recorders: [], pending: [] };
    window.__curioCapture = capture;
    const create = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...args) {
      this.addEventListener('track', event => {
        if (event.track.kind !== 'audio') return;
        const id = String(capture.recorders.length);
        const recorder = new MediaRecorder(new MediaStream([event.track]), { mimeType: 'audio/webm;codecs=opus' });
        capture.recorders.push(recorder);
        capture.pending.push(window.__recordAudioMeta({ id, startedAt: Date.now(), mimeType: recorder.mimeType }));
        recorder.addEventListener('dataavailable', ({ data }) => {
          capture.pending.push((async () => {
            const bytes = new Uint8Array(await data.arrayBuffer());
            let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
            await window.__recordAudioChunk(id, btoa(binary));
          })());
        });
        recorder.start(1000);
      });
      const channel = create.apply(this, args);
      channel.addEventListener('message', ({ data }) => {
        let event; try { event = JSON.parse(data); } catch { return; }
        if (event.type === 'response.created') { capture.activeResponses++; capture.lastResponseAt = Date.now(); }
        if (event.type === 'response.done') { capture.activeResponses = Math.max(0, capture.activeResponses - 1); capture.lastResponseAt = Date.now(); }
        if (event.type === 'output_audio_buffer.started') capture.speaking = true;
        if (event.type === 'output_audio_buffer.stopped' || event.type === 'output_audio_buffer.cleared') { capture.speaking = false; capture.lastResponseAt = Date.now(); }
        if (['response.created', 'response.done', 'response.output_audio_transcript.done', 'output_audio_buffer.started', 'output_audio_buffer.stopped', 'error'].includes(event.type)) {
          // Whitelist application evidence, excluding ephemeral session secrets.
          capture.pending.push(window.__recordRealtime({ at: Date.now(), type: event.type, transcript: event.transcript, responseId: event.response?.id ?? event.response_id, status: event.response?.status, usage: event.response?.usage, error: event.error ? { type: event.error.type, code: event.error.code, message: event.error.message } : undefined }));
        }
      });
      return channel;
    };
  });
  startedAt = Date.now();
  page = await context.newPage(); video = page.video();
  page.on('pageerror', error => browserErrors.push(redact(error.message)));
  await page.goto(origin); mark('home'); await delay(2400);
  await page.getByRole('link', { name: 'Crash-test a lesson' }).click();
  await page.getByRole('button', { name: 'Start session' }).waitFor(); mark('lesson-choice'); await delay(2500);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.waitForURL('**/session/**'); sessionId = new URL(page.url()).pathname.split('/').at(-1);
  mark('session'); await delay(1200);
  await page.getByRole('button', { name: 'Connect Curio', exact: true }).click();
  await page.getByLabel('Teach Curio by text', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Or teach Curio by text…"]').disabled, undefined, { timeout: 45000 }); mark('connected');
  await send('Summer happens because Earth is closer to the Sun.', 1);
  await page.getByRole('switch').click(); mark('evidence-panels'); await delay(2500);
  await send('The Earth has an axial tilt.', 2);
  await send('I need to correct that. Axial tilt causes seasons, not distance from the Sun. In summer our hemisphere tilts toward the Sun, so sunlight hits more directly.', 3);
  await send('I am not sure why the hours of daylight change.', 4);
  await writeFile(path.join(output, 'before-teachback.json'), JSON.stringify(await snapshot(), null, 2));
  await waitQuiet(); mark('request-teachback');
  await page.getByRole('button', { name: 'Finish & teach-back', exact: true }).click();
  await page.getByRole('button', { name: 'Finish → report', exact: true }).first().waitFor({ timeout: 120000 }); mark('teachback-ready');
  await delay(2000); await waitQuiet(150000); mark('teachback-audio-complete');
  await flushAudio();
  if (await page.getByRole('button', { name: 'Disconnect', exact: true }).count()) await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Finish → report', exact: true }).first().click();
  await page.getByRole('link', { name: 'View report' }).click({ timeout: 120000 });
  await page.waitForURL('**/report/**'); mark('report');
  await page.getByRole('tab', { name: 'What your learner understood' }).click();
  await page.screenshot({ path: path.join(output, 'report.png') }); await delay(6000);
  const before = await snapshot();
  await writeFile(path.join(output, 'report-state.json'), JSON.stringify(before, null, 2));
  await stopApp();
  const beforeCalls = (await readFile(ledger, 'utf8')).trim().split('\n').filter(Boolean).length;
  await startApp(); await page.reload();
  await page.getByRole('tab', { name: 'What your learner understood' }).waitFor();
  const after = await snapshot();
  const afterCalls = (await readFile(ledger, 'utf8')).trim().split('\n').filter(Boolean).length;
  assert.equal(afterCalls, beforeCalls); assert.deepEqual(after, before); mark('restart-restored', { newApiCalls: afterCalls - beforeCalls }); await delay(4000);
  await page.getByRole('tab', { name: 'Verified reference model' }).click(); mark('reference'); await delay(5000);
  if (after.findings.some(finding => finding.reviewStatus === 'queued')) {
    await page.goto(origin + '/review'); await page.getByRole('heading', { name: 'Human review queue' }).waitFor(); mark('human-review'); await delay(5000);
  }
  await page.goto(`${origin}/session/${sessionId}`); mark('reopened-session'); await delay(4000);
  assert.deepEqual(browserErrors, []);
  const errors = realtime.filter(event => event.type === 'error');
  if (errors.length) mark('realtime-errors-observed', { errors });
  mark('finished');
} catch (error) {
  if (startedAt) mark('failed', { error: redact(error.message) });
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await flushAudio();
  if (context) await context.close();
  if (video) {
    const source = await video.path();
    await copyFile(source, path.join(output, 'source.webm'));
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-i', source, '-r', '24', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(output, 'source.mp4')], { stdio: 'ignore' });
  }
  await browser?.close(); await stopApp();
  const videoPath = path.join(output, 'source.mp4');
  const info = await readFile(videoPath).then(buffer => ({ sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length })).catch(() => ({}));
  await writeFile(path.join(output, 'capture.json'), JSON.stringify({ startedAt, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sessionId, models: { reasoning: environment.REASONING_MODEL, deep: environment.REASONING_MODEL_DEEP, realtime: environment.REALTIME_MODEL }, provenance: 'Real production app and OpenAI calls. Only browser actions are scripted. No state, provider, transcript or response substitution. No visual overlays. Raw continuous recording is retained.', timeline, browserErrors, realtime, audio: audioMeta.map(meta => ({ ...meta, offsetSeconds: (meta.startedAt - startedAt) / 1000 })), ...info }, null, 2), { mode: 0o600 });
}

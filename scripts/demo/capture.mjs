import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixtureProvider } from './provider.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.CURIO_PLAYWRIGHT_MODULE || 'playwright');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'curio-demo-'));
const output = path.join(root, '.artifacts/offline-demo');
await mkdir(output, { recursive: true });
const provider = await startFixtureProvider();
const port = Number(process.env.CURIO_DEMO_PORT || 3198);
const origin = `http://127.0.0.1:${port}`;
let app, browser, context;
const log = createWriteStream(path.join(temporary, 'server.log'));
const environment = {
  ...process.env, CURIO_DATA_DIR: path.join(temporary, 'data'),
  OPENAI_API_KEY: 'offline-fixture-key-not-a-secret', OPENAI_BASE_URL: provider.baseURL,
  ANTHROPIC_API_KEY: '', REASONING_PROVIDER: 'openai', REASONING_MODEL: 'offline-fixture', REASONING_MODEL_DEEP: 'offline-fixture',
  NEXT_TELEMETRY_DISABLED: '1',
};
async function startApp() {
  app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.pipe(log, { end: false }); app.stderr.pipe(log, { end: false });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error(`App exited ${app.exitCode}; ${await readFile(path.join(temporary, 'server.log'), 'utf8')}`);
    try { if ((await fetch(origin)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('App did not become ready');
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const stopped = new Promise(resolve => app.once('exit', resolve));
  app.kill('SIGTERM'); await stopped;
}
try {
  await startApp();
  browser = await chromium.launch({ headless: true, ...(process.env.CURIO_BROWSER_EXECUTABLE ? { executablePath: process.env.CURIO_BROWSER_EXECUTABLE } : {}) });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: temporary, size: { width: 1280, height: 720 } } });
  // Browser traffic is confined to the local app. Server reasoning calls go only to the local fixture provider.
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function caption(text) {
    await page.evaluate(value => {
      let label = document.getElementById('offline-demo-caption');
      if (!label) {
        label = document.createElement('aside'); label.id = 'offline-demo-caption';
        label.style.cssText = 'position:fixed;bottom:12px;left:24px;right:24px;z-index:99999;background:#06100ff2;border:2px solid #e6b85c;color:#f4eedb;padding:12px 18px;font:15px/1.45 system-ui;pointer-events:none;box-shadow:0 4px 24px #000';
        document.body.append(label);
      }
      label.textContent = `OFFLINE DEMONSTRATION — model responses are fixtures. ${value}`;
    }, text);
  }
  const hold = seconds => delay(seconds * Number(process.env.CURIO_DEMO_PACE || 1000));
  await page.goto(origin);
  await caption('A real app walkthrough: explain → inspect evidence → repair → reconstruct.');
  await hold(5);
  await page.getByRole('link', { name: 'Crash-test a lesson' }).click();
  await page.getByRole('button', { name: 'Start session' }).waitFor();
  await caption('Choose the approved lesson boundary. No microphone or external model is used.');
  await hold(6);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.waitForURL('**/session/**');
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const sessionURL = page.url();
  await caption('This session was created by the app. Synthetic teacher text enters its transcript API.');
  await page.getByRole('switch').click();
  await hold(4);
  const statements = [
    'Summer happens because Earth is closer to the Sun.',
    'The Earth has an axial tilt.',
    'Actually, axial tilt causes seasons, not distance from the Sun.',
    'I am not sure how the hours of daylight change.',
  ];
  for (const [index, text] of statements.entries()) {
    const response = await fetch(`${origin}/api/sessions/${id}/transcript`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speaker: 'user', text, tMs: Date.now() + index * 30000 }) });
    if (!response.ok) throw new Error(await response.text());
    await caption(index < 2 ? 'Fixture evidence introduces a misconception. Watch the claim ledger and diagnostic question.' : index === 2 ? 'A fixture correction supersedes the earlier misconception; evidence remains inspectable.' : 'The fixture leaves a real gap in the explanation, queued for human review.');
    await hold(4);
  }
  await page.getByRole('button', { name: 'Finish & teach-back', exact: true }).click();
  await page.getByRole('button', { name: 'Finish → report', exact: true }).first().waitFor();
  await caption('Finish flushes verification before reconstructing learner beliefs. Voice remains disconnected.');
  await hold(6);
  await page.getByRole('button', { name: 'Finish → report', exact: true }).first().click();
  await page.getByRole('link', { name: 'View report' }).click();
  await page.waitForURL('**/report/**');
  await caption('The report separates what was taught from reference knowledge. This conclusion is a fixture.');
  await hold(5);
  await page.getByRole('tab', { name: 'What your learner understood' }).scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'What your learner understood' }).click();
  await caption('Learner reconstruction preserves the remaining uncertainty and supporting transcript evidence.');
  await page.screenshot({ path: path.join(output, 'curio-report.png') });
  await hold(5);
  const reportURL = page.url();
  await stopApp();
  const beforeRead = provider.calls.length;
  await startApp();
  await page.reload();
  await page.getByRole('tab', { name: 'What your learner understood' }).waitFor();
  if (provider.calls.length !== beforeRead) throw new Error('Restoration unexpectedly called the provider');
  await caption('The server has restarted. This report was restored from disk with zero new model calls.');
  await hold(6);
  await page.getByRole('tab', { name: 'Verified reference model' }).click();
  await caption('The answer key is a separate reference tab, not the learner reconstruction.');
  await hold(5);
  await page.goto(origin + '/review');
  await page.getByRole('heading', { name: 'Human review queue' }).waitFor();
  await caption('The saved uncertain finding remains available for expert judgment after restart.');
  await hold(6);
  await page.goto(sessionURL);
  await page.getByRole('heading', { name: 'Why Earth Has Seasons' }).waitFor();
  await caption('The same session URL reopens. Reconnect voice separately; historical questions are not replayed.');
  await hold(5);
  await page.close(); await context.close(); context = null;
  const source = await video.path();
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-i', source, '-vf', 'scale=1280:720', '-r', '24', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(output, 'curio-offline-demo.mp4')], { stdio: 'ignore' });
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  const mediaPath = path.join(output, 'curio-offline-demo.mp4');
  const mediaProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', mediaPath], { encoding: 'utf8' }));
  await writeFile(path.join(output, 'capture.json'), JSON.stringify({ appBuildId: (await readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim(), browserVersion: browser.version(), durationSeconds: Number(mediaProbe.format.duration), bytes: Number(mediaProbe.format.size), sha256: createHash('sha256').update(await readFile(mediaPath)).digest('hex'), capturedAt: new Date().toISOString(), viewport: { width: 1280, height: 720 }, mode: 'Offline demonstration — model responses are fixtures', modelCallsOnRestore: provider.calls.length - beforeRead, fixtureCalls: provider.calls, sessionURL: new URL(sessionURL).pathname, reportURL: new URL(reportURL).pathname, audio: false, browserErrors: errors, caption: 'Recording-only DOM overlay; original app UI is otherwise unchanged.' }, null, 2) + '\n');
  console.log(`Captured poster and demonstration under ${output}`);
} catch (error) {
  console.error(await readFile(path.join(temporary, 'server.log'), 'utf8').catch(() => ''));
  throw error;
} finally {
  await context?.close(); await browser?.close(); await stopApp();
  provider.server.closeAllConnections(); await new Promise(resolve => provider.server.close(resolve));
  log.end(); await rm(temporary, { recursive: true, force: true });
}

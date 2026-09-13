import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { test, after } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import renderer from 'react-test-renderer';

const requireDependency = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(process.env.CURIO_TEST_SOURCE_ROOT ?? path.join(__dirname, '..'));
const originalCwd = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'curio-regression-'));
fs.cpSync(path.join(root, 'packs'), path.join(temp, 'packs'), { recursive: true });
process.chdir(temp);
const originalFetch = global.fetch;
global.fetch = async () => { throw new Error('Network calls are forbidden in regression tests'); };
after(() => { global.fetch = originalFetch; process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

// Load the actual source modules while replacing only provider/UI boundaries.
// No provider SDK or credential is loaded, and disk writes are confined to temp.
function fixture(call, overrides = {}) {
  const cache = new Map();
  const calls = [];
  const provider = async (options) => { calls.push(options); return call(options); };
  const mocks = { [path.join(root, 'lib/llm.ts')]: { jsonCall: provider, deepJsonCall: provider, visionCall: provider }, ...overrides };
  async function load(specifier, parent = { identifier: path.join(root, 'index.ts') }) {
    let id = specifier.startsWith('@/') ? path.join(root, specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(parent.identifier), specifier) : specifier;
    if (id.startsWith(root) && !path.extname(id)) id += fs.existsSync(`${id}.ts`) ? '.ts' : '.tsx';
    if (cache.has(id)) return cache.get(id);
    let loadedModule;
    if (mocks[id] || !id.startsWith(root + path.sep)) {
      let values = mocks[id];
      if (!values) {
        const imported = requireDependency(id);
        values = { ...imported, default: imported };
      }
      loadedModule = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { identifier: id });
    } else {
      const code = ts.transpileModule(fs.readFileSync(id, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }, fileName: id,
      }).outputText;
      loadedModule = new vm.SourceTextModule(code, {
        identifier: id,
        importModuleDynamically: async (s, p) => {
          const m = await load(s, p);
          if (m.status === 'unlinked') await m.link(load);
          if (m.status === 'linked') await m.evaluate();
          return m;
        },
      });
    }
    cache.set(id, loadedModule);
    return loadedModule;
  }
  return {
    calls,
    async get(file) {
      const loadedModule = await load(path.join(root, file));
      if (loadedModule.status === 'unlinked') await loadedModule.link(load);
      if (loadedModule.status === 'linked') await loadedModule.evaluate();
      return loadedModule.namespace;
    },
  };
}

function kind(options) {
  if (options.schema.properties.results) return 'verify';
  if (options.schema.properties.claims) return 'map';
  if (options.schema.properties.beliefs) return 'beliefs';
  if (options.schema.properties.script) return 'teachback';
  if (options.schema.properties.summary) return 'report';
  return 'other';
}
function response(options) {
  const input = JSON.parse(options.user);
  switch (kind(options)) {
    case 'map': return { claims: input.segments.map(s => ({ statement: s.text, originalText: s.text, segmentIds: [s.id], nodeIds: ['axial-tilt'] })) };
    case 'verify': return { results: input.claims.map(c => ({ claimId: c.id, status: 'verified', explanation: 'Supported by the supplied node.', sourceRef: 'pack:earth-seasons@1.0 node:axial-tilt', misconceptionId: null, repairedClaimIds: [] })) };
    case 'beliefs': return { beliefs: input.claims.filter(c => c.status !== 'superseded').map((c, i) => ({ id: input.currentBeliefs[i]?.id ?? 'new', statement: c.statement, supportingClaimIds: [c.id], nodeIds: c.nodeIds, status: c.supersedesClaimId ? 'revised' : 'believed', ambiguityNote: null })) };
    case 'teachback': return { script: input.beliefs.map(b => b.statement).join(' '), usedBeliefIds: input.beliefs.map(b => b.id), uncertainties: [] };
    case 'report': return { summary: 'The evidence is recorded. Explain the remaining mechanism.', recommendedNextStep: 'Explain the sunlight-angle mechanism.' };
    default: throw new Error('Unexpected provider stage');
  }
}
function segment(store, state, text, index) {
  store.addSegment(state.session.id, { id: `segment-${index}`, sessionId: state.session.id, speaker: 'user', text, tMs: index * 30000 });
}
function claim(store, state, text, index) {
  segment(store, state, text, index);
  store.upsertClaim(state.session.id, { id: `claim-${index}`, sessionId: state.session.id, statement: text, originalText: text, segmentIds: [`segment-${index}`], nodeIds: ['sun-distance', 'seasons'], status: 'observed', createdAtMs: index * 30000 });
}

test('the production session-creation path starts listening and reaches a question without a belief call', async () => {
  const f = fixture(response);
  const api = await f.get('app/api/sessions/route.ts');
  const created = await api.POST(new Request('http://localhost/api/sessions', { method: 'POST', body: JSON.stringify({ packId: 'earth-seasons', mode: 'teacher' }) }));
  assert.equal(created.status, 201);
  const { sessionId } = await created.json();
  const store = await f.get('lib/store.ts');
  const state = store.getSessionState(sessionId);
  assert.equal(state.session.phase, 'listening');
  for (let i = 0; i < 4; i++) segment(store, state, 'Earth has an axial tilt.', i);
  await (await f.get('lib/agents/claimMapper.ts')).runPipelineTick(sessionId);
  assert.equal(state.session.phase, 'questioning');
  assert.equal(state.directives.length, 1);
  assert.equal(state.directives[0].kind, 'ask');
  assert.deepEqual(f.calls.map(kind), ['map', 'verify']);
});

test('semantic verification handles negation, quotation, affirmative errors, and explicit repair', async () => {
  let answer;
  const f = fixture(options => {
    assert.equal(kind(options), 'verify');
    const input = JSON.parse(options.user);
    assert.equal(input.claims.length, 1);
    return { results: [{ claimId: input.claims[0].id, explanation: 'Pack-grounded judgment.', sourceRef: 'pack:earth-seasons@1.0 node:sun-distance', misconceptionId: null, repairedClaimIds: [], ...answer }] };
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  const verifier = await f.get('lib/agents/verifier.ts');
  answer = { status: 'verified' };
  claim(store, state, "Earth's distance from the Sun does not cause the seasons.", 1);
  await verifier.verifyNewClaims(state.session.id);
  claim(store, state, 'The claim "closer to the Sun causes summer" is a misconception.', 2);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.findings.length, 0);
  assert.equal(state.claims[0].status, 'verified');
  answer = { status: 'contradicted', misconceptionId: 'mc-distance' };
  claim(store, state, 'Summer happens because Earth is closer to the Sun.', 3);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.claims[2].status, 'contradicted');
  assert.equal(state.findings[0].confidence, 'likely');
  answer = { status: 'verified' };
  claim(store, state, 'Actually, Earth orbits the Sun.', 4);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.claims[2].status, 'contradicted', 'an unrelated true statement cannot repair the earlier error');
  answer = { status: 'verified', repairedClaimIds: ['claim-3'] };
  claim(store, state, 'Actually, axial tilt causes the seasons, not distance from the Sun.', 5);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.claims[2].status, 'superseded');
  assert.equal(state.claims[4].supersedesClaimId, 'claim-3');
  await (await f.get('lib/agents/coverage.ts')).audit(state.session.id);
  assert.equal(state.conceptStates['sun-distance'], 'established');
  answer = { status: 'contradicted', misconceptionId: 'mc-distance' };
  claim(store, state, 'Summer happens because Earth is closer to the Sun.', 6);
  await verifier.verifyNewClaims(state.session.id);
  await (await f.get('lib/agents/coverage.ts')).audit(state.session.id);
  assert.equal(state.conceptStates['sun-distance'], 'misconceived', 'a historical repair cannot erase a newly asserted error');
  assert.equal(f.calls.length, 6, 'every classification goes through the semantic verifier');
});

test('invalid reference citations cannot establish knowledge or confirm a contradiction', async () => {
  const f = fixture(options => {
    const input = JSON.parse(options.user);
    return { results: [{ claimId: input.claims[0].id, status: 'contradicted', sourceRef: 'pack:earth-seasons@1.0 node:invented', misconceptionId: 'mc-distance', repairedClaimIds: [], explanation: 'Unsupported judgment' }] };
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  claim(store, state, 'Distance from the Sun does not cause the seasons.', 1);
  await (await f.get('lib/agents/verifier.ts')).verifyNewClaims(state.session.id);
  assert.equal(state.claims[0].status, 'uncertain');
  assert.equal(state.findings[0].reviewStatus, 'queued');
});

test('live verifier schema constrains citations to a single real pack reference', async () => {
  let suppliedReference = 'pack:earth-seasons@1.0 mc:mc-distance';
  const f = fixture(options => {
    const references = options.schema.properties.results.items.properties.sourceRef.enum;
    assert(references.includes(''), 'unsupported judgments can omit a citation');
    assert(references.includes('pack:earth-seasons@1.0 node:sun-distance'));
    assert(references.includes('pack:earth-seasons@1.0 mc:mc-distance'));
    assert(!references.includes('pack:earth-seasons@1.0 node:invented'));
    assert(!references.includes('pack:earth-seasons@1.0 node:sun-distance, mc:mc-distance'));
    const input = JSON.parse(options.user);
    return { results: [{ claimId: input.claims[0].id, status: 'contradicted', sourceRef: suppliedReference, misconceptionId: 'mc-distance', repairedClaimIds: [], explanation: 'The distance claim conflicts with the pack.' }] };
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  const verifier = await f.get('lib/agents/verifier.ts');
  claim(store, state, 'Summer happens because Earth is closer to the Sun.', 1);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.claims[0].status, 'contradicted');
  suppliedReference = 'pack:earth-seasons@1.0 node:sun-distance:invented';
  claim(store, state, 'Summer happens because Earth is closer to the Sun.', 2);
  await verifier.verifyNewClaims(state.session.id);
  assert.equal(state.claims[1].status, 'uncertain', 'runtime validation still rejects malformed provider citations');
});

test('finish awaits in-flight verification, builds beliefs once, and refreshes after a correction', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let firstMap = true;
  const f = fixture(async options => {
    if (kind(options) === 'map' && firstMap) { firstMap = false; await gate; }
    return response(options);
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  segment(store, state, 'Earth has axial tilt.', 1);
  const pipeline = await f.get('lib/agents/claimMapper.ts');
  const pedagogy = await f.get('lib/agents/pedagogy.ts');
  const tick = pipeline.runPipelineTick(state.session.id);
  await new Promise(resolve => setImmediate(resolve));
  const finish = pedagogy.advance(state.session.id, 'teachback');
  const duplicate = pedagogy.advance(state.session.id, 'teachback');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls.map(kind), ['map']);
  release();
  await Promise.all([tick, finish, duplicate]);
  assert.equal(state.session.phase, 'teachback');
  assert.equal(state.directives.filter(d => d.kind === 'teachback').length, 1);
  assert.equal(f.calls.filter(c => kind(c) === 'beliefs').length, 1);
  assert.equal(f.calls.filter(c => kind(c) === 'teachback').length, 1);
  const learner = await f.get('lib/agents/learnerModel.ts');
  await Promise.all([learner.updateBeliefs(state.session.id), learner.updateBeliefs(state.session.id)]);
  assert.equal(f.calls.filter(c => kind(c) === 'beliefs').length, 1);
  segment(store, state, 'The tilt is approximately 23.5 degrees.', 2);
  await pipeline.runPipelineTick(state.session.id);
  assert.equal(f.calls.filter(c => kind(c) === 'beliefs').length, 1, 'live corrections are verified without reconstructing beliefs yet');
  await pedagogy.advance(state.session.id, 'finish');
  assert.equal(state.session.phase, 'report');
  assert.equal(f.calls.filter(c => kind(c) === 'beliefs').length, 2);
  assert.equal(state.beliefs.length, 2);
  assert.equal(state.beliefRevision, state.evidenceRevision);
});

test('verification failures remain retryable and never become keyword convictions', async () => {
  let fail = true;
  const f = fixture(options => {
    if (kind(options) === 'verify' && fail) throw new Error('Mock unavailable provider');
    return response(options);
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  segment(store, state, "Earth's distance from the Sun does not cause seasons.", 1);
  const pipeline = await f.get('lib/agents/claimMapper.ts');
  await assert.rejects(pipeline.runPipelineTick(state.session.id), /verification is unavailable/);
  assert.equal(state.claims[0].status, 'observed');
  assert.equal(state.findings.length, 0);
  assert.equal(state.claimMapperCursor, 1);
  fail = false;
  await pipeline.flushPipeline(state.session.id);
  assert.equal(state.claims[0].status, 'verified');
  assert.deepEqual(f.calls.map(kind), ['map', 'verify', 'verify']);
});

function compiledFixture() {
  const draft = JSON.parse(fs.readFileSync(path.join(root, 'packs/earth-seasons.json'), 'utf8'));
  draft.id = 'compiled-seasons';
  draft.verificationStatus = 'ai_generated_draft';
  for (const objective of draft.objectives) objective.sourceQuote = objective.statement;
  for (const node of draft.nodes) node.scopeLabel = draft.prerequisites.includes(node.id) ? 'assumed_prerequisite' : 'required';
  draft.exclusions = [];
  return { draft, sourceText: draft.objectives.map(o => o.statement).join('\n'), sourceRole: 'Scope authority (syllabus)' };
}

test('compiled approval enters the runtime catalog, survives a reload, and creates a selected-pack session', async () => {
  const input = compiledFixture();
  const f = fixture(options => options.schema.properties.objectives ? input.draft : { warnings: [] });
  const api = await f.get('app/api/compiler/route.ts');
  const post = await api.POST(new Request('http://localhost/api/compiler', { method: 'POST', body: JSON.stringify(input) }));
  assert.equal(post.status, 200);
  const result = await post.json();
  assert.equal(f.calls.length, 2, 'one coherent generation plus one substantive critic');
  const put = await api.PUT(new Request('http://localhost/api/compiler', { method: 'PUT', body: JSON.stringify({ ...result, approvedBy: 'Test instructor' }) }));
  assert.equal(put.status, 200);
  const approval = await put.json();
  assert.match(approval.packId, /^compiled-seasons-/);
  const fresh = fixture(() => { throw new Error('Loading approved packs needs no model'); });
  const packs = await fresh.get('lib/packs.ts');
  assert(packs.listPacks().some(p => p.id === approval.packId));
  const loaded = packs.loadPack(approval.packId);
  assert.equal(loaded.verificationStatus, 'instructor_approved');
  assert.equal(loaded.sourceText, input.sourceText);
  const state = (await fresh.get('lib/store.ts')).createSession(approval.packId, 'teacher');
  assert.equal(state.session.packId, approval.packId);
  assert.equal(Object.keys(state.conceptStates).length, loaded.nodes.length);
  const setup = fixture(() => {}, { [path.join(root, 'app/setup/SetupForm.tsx')]: { default: function Setup(props) { return props; } } });
  const page = await (await setup.get('app/setup/page.tsx')).default({ searchParams: Promise.resolve({ packId: approval.packId }) });
  assert.equal(page.props.initialPackId, approval.packId);
  assert(page.props.packs.some(p => p.id === approval.packId));
});

test('approval rejects incomplete contracts, invalid references, and invented source quotations', async () => {
  const f = fixture(() => { throw new Error('Approval should not need models'); });
  const api = await f.get('app/api/compiler/route.ts');
  for (const mutation of [
    d => { delete d.edges; },
    d => { d.transferProbes[0].expectedReasoning = ''; },
    d => { d.objectives[0].requiredNodeIds = ['nonexistent']; },
    d => { d.objectives[0].sourceQuote = 'A source sentence that was never submitted.'; },
  ]) {
    const input = compiledFixture();
    mutation(input.draft);
    const result = await api.PUT(new Request('http://localhost/api/compiler', { method: 'PUT', body: JSON.stringify(input) }));
    assert.equal(result.status, 400);
  }
});

test('show/hide harness preserves the mounted voice instance through real React reconciliation', async () => {
  let mounts = 0, closes = 0;
  function Voice() {
    React.useEffect(() => { mounts++; return () => { closes++; }; }, []);
    return React.createElement('div', { 'data-test': 'voice' });
  }
  const state = { phase: 'listening', segments: [], claims: [], findings: [], beliefs: [], agentEvents: [], directives: [], conceptStates: {}, assumptionDebt: [] };
  const empty = () => null;
  const f = fixture(() => { throw new Error('UI test needs no model'); }, {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/dynamic': { default: () => empty },
    [path.join(root, 'components/VoiceClient.tsx')]: { default: Voice },
    [path.join(root, 'components/useSessionStream.ts')]: { useSessionStream: () => state },
    [path.join(root, 'components/AgentPanel.tsx')]: { default: empty },
    [path.join(root, 'components/ClaimLedger.tsx')]: { default: empty },
    [path.join(root, 'components/ConceptMap.tsx')]: { default: empty, ConceptMapCompact: empty },
    [path.join(root, 'components/TranscriptPanel.tsx')]: { default: empty },
  });
  const { SessionRoom } = await f.get('components/SessionControls.tsx');
  const previousWindow = global.window;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(SessionRoom, { sessionId: 'ui-test', pack: { title: 'Seasons', version: '1.0', verificationStatus: 'instructor_approved', nodes: [], misconceptions: [] } })); });
    for (let i = 0; i < 2; i++) {
      await renderer.act(async () => tree.root.findByProps({ role: 'switch' }).props.onClick());
      assert.equal(mounts, 1);
      assert.equal(closes, 0);
    }
  } finally {
    if (tree) await renderer.act(async () => tree.unmount());
    global.window = previousWindow;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
  assert.equal(closes, 1, 'resources close only when the session really unmounts');
});


test('same-batch repairs use source order, including equal-timestamp claims, independent of result order', async () => {
  const error = 'Summer happens because Earth is closer to the Sun.';
  const correction = 'Actually, axial tilt causes seasons, not distance.';
  const f = fixture(options => {
    const input = JSON.parse(options.user);
    if (kind(options) === 'map') return { claims: [error, correction, error].map((text, i) => ({
      statement: text, originalText: text, segmentIds: [input.segments[i === 2 ? 1 : 0].id], nodeIds: ['sun-distance'],
    })) };
    const [first, repair, last] = input.claims;
    return { results: [
      { claimId: repair.id, status: 'verified', explanation: 'Explicit correction.', sourceRef: 'pack:earth-seasons@1.0 node:sun-distance', misconceptionId: null, repairedClaimIds: [first.id, last.id] },
      ...[last, first].map(c => ({ claimId: c.id, status: 'contradicted', explanation: 'Distance misconception.', sourceRef: 'pack:earth-seasons@1.0 mc:mc-distance', misconceptionId: 'mc-distance', repairedClaimIds: [] })),
    ] };
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  segment(store, state, `${error} ${correction}`, 1);
  segment(store, state, error, 2);
  await (await f.get('lib/agents/claimMapper.ts')).flushPipeline(state.session.id);
  assert.equal(state.claims[0].createdAtMs, state.claims[1].createdAtMs);
  assert.equal(state.claims[0].status, 'superseded');
  assert.equal(state.claims[1].supersedesClaimId, state.claims[0].id);
  assert.equal(state.claims[2].status, 'contradicted', 'a correction cannot supersede a future assertion');
  assert.equal(state.conceptStates['sun-distance'], 'misconceived');
  assert.equal(state.findings.find(f => f.claimIds.includes(state.claims[0].id)).severity, 'minor');
});


test('a separate Node process restores saved state and subsequent mutations without model access', async () => {
  const loader = path.join(root, 'node_modules/tsx/dist/loader.mjs');
  const storeUrl = pathToFileURL(path.join(root, 'lib/store.ts')).href;
  const child = body => {
    const result = spawnSync(process.execPath, ['--import', loader, '--input-type=module', '-e', `
      globalThis.fetch = () => { throw new Error('No network permitted'); };
      const module = await import(${JSON.stringify(storeUrl)});
      const store = module.default ?? module;
      ${body}
    `], { cwd: temp, encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const id = child(`
    const state = store.createSession('earth-seasons', 'teacher');
    store.addSegment(state.session.id, { id: 'restart-segment', sessionId: state.session.id, speaker: 'user', text: 'Earth has axial tilt.', tMs: 123 });
    console.log(JSON.stringify(state.session.id));
  `);
  const restored = child(`
    const state = store.getSessionState(${JSON.stringify(id)});
    store.setPhase(state.session.id, 'questioning');
    console.log(JSON.stringify(state));
  `);
  assert.equal(restored.segments[0].text, 'Earth has axial tilt.');
  assert.equal(restored.session.phase, 'questioning');
  const f = fixture(() => { throw new Error('Reading cannot call a model'); });
  const store = await f.get('lib/store.ts');
  assert.equal(store.getSessionState(id).session.phase, 'questioning');
  const events = [];
  const unsubscribe = store.subscribe(id, event => events.push(event));
  assert.equal(events[0].type, 'snapshot');
  assert.equal(events[0].data.segments[0].id, 'restart-segment');
  unsubscribe();
  assert.equal(f.calls.length, 0);
});

test('corrupt or mismatched snapshots fail visibly without overwriting evidence; valid sessions still load', async () => {
  const f = fixture(() => { throw new Error('No model'); });
  const state = (await f.get('lib/store.ts')).createSession('earth-seasons', 'teacher');
  const valid = JSON.parse(fs.readFileSync(path.join(temp, 'data/sessions', `${state.session.id}.json`), 'utf8'));
  for (const [index, mutate] of [
    () => '{broken json',
    value => { value.session.id = 'different-id'; return JSON.stringify(value); },
    value => { value.snapshotVersion = 99; return JSON.stringify(value); },
    value => { value.claims = [null]; return JSON.stringify(value); },
    value => { value.claimMapperCursor = 900; return JSON.stringify(value); },
    value => { value.session.phase = 'invented'; return JSON.stringify(value); },
  ].entries()) {
    const id = `corrupt-${index}`;
    const value = structuredClone(valid);
    value.session.id = id;
    const content = mutate(value);
    const file = path.join(temp, 'data/sessions', `${id}.json`);
    fs.writeFileSync(file, content);
    const fresh = await fixture(() => {}).get('lib/store.ts');
    assert.throws(() => fresh.getSessionState(id), /Cannot restore session/);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
    assert.equal(fresh.getSessionState(state.session.id).session.id, state.session.id);
    assert.equal(fresh.getSessionState('../outside'), undefined);
    assert.equal(fresh.getSessionState('missing'), undefined);
    fs.unlinkSync(file);
  }
});

test('legacy snapshots hydrate without job replay and gain a version on the next mutation', async () => {
  const state = (await fixture(() => {}).get('lib/store.ts')).createSession('earth-seasons', 'teacher');
  const file = path.join(temp, 'data/sessions', `${state.session.id}.json`);
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete legacy.snapshotVersion;
  delete legacy.claimMapperCursor;
  delete legacy.evidenceRevision;
  fs.writeFileSync(file, JSON.stringify(legacy));
  const fresh = await fixture(() => { throw new Error('No model'); }).get('lib/store.ts');
  assert.equal(fresh.getSessionState(state.session.id).claimMapperCursor, 0);
  fresh.setPhase(state.session.id, 'repair');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).snapshotVersion, 1);
});

for (const interruptedStage of ['map', 'verify']) {
  test(`restart during ${interruptedStage} resumes from the durable checkpoint without duplicate claims`, async () => {
    const abandoned = fixture(options => kind(options) === interruptedStage ? new Promise(() => {}) : response(options));
    const oldStore = await abandoned.get('lib/store.ts');
    const state = oldStore.createSession('earth-seasons', 'teacher');
    segment(oldStore, state, 'Earth has an axial tilt.', 1);
    void (await abandoned.get('lib/agents/claimMapper.ts')).flushPipeline(state.session.id);
    for (let turn = 0; turn < 20 && !abandoned.calls.some(call => kind(call) === interruptedStage); turn++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert(abandoned.calls.some(call => kind(call) === interruptedStage));
    // A fresh module graph has no in-memory promise/lock from the abandoned process.
    const restarted = fixture(response);
    const store = await restarted.get('lib/store.ts');
    const restored = store.getSessionState(state.session.id);
    assert.equal(restarted.calls.length, 0, 'loading a snapshot must never run paid work');
    assert.equal(restored.claimMapperCursor, interruptedStage === 'map' ? 0 : 1);
    await (await restarted.get('lib/agents/pedagogy.ts')).advance(state.session.id, 'teachback');
    assert.equal(restored.claims.length, 1);
    assert.equal(restored.claims[0].status, 'verified');
    assert.equal(restored.claimMapperCursor, 1);
    assert.equal(restored.session.phase, 'teachback');
    assert.equal(restarted.calls.filter(call => kind(call) === 'map').length, interruptedStage === 'map' ? 1 : 0);
  });
}

test('failed atomic replacement leaves the last checkpoint intact and cleans the temporary file', async () => {
  const f = fixture(() => {});
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  const directory = path.join(temp, 'data/sessions');
  const file = path.join(directory, `${state.session.id}.json`);
  const before = fs.readFileSync(file, 'utf8');
  const failing = fixture(() => {}, { 'node:fs': { ...fs, renameSync() { throw new Error('Simulated disk replacement failure'); } } });
  const persistence = await failing.get('lib/sessionPersistence.ts');
  assert.throws(() => persistence.writeSnapshot(directory, { ...state, claims: [] }), /Simulated disk/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert(!fs.readdirSync(directory).some(name => name.startsWith(state.session.id) && name.endsWith('.tmp')));
  const snapshots = [];
  const unsubscribe = store.subscribe(state.session.id, event => {
    if (event.type === 'claim') snapshots.push(JSON.parse(fs.readFileSync(file, 'utf8')));
  });
  segment(store, state, 'Earth has tilt.', 1);
  store.commitMappedClaims(state.session.id, [{ id: 'mapped', sessionId: state.session.id, statement: 'Earth has tilt.', originalText: 'Earth has tilt.', segmentIds: ['segment-1'], nodeIds: ['axial-tilt'], status: 'observed', createdAtMs: 1 }], 1);
  unsubscribe();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].claims.length, 1);
  assert.equal(snapshots[0].claimMapperCursor, 1, 'claim event follows the same durable cursor checkpoint');
});


test('a restored verdict never loses its finding between claim and event notifications', async () => {
  const f = fixture(options => {
    const input = JSON.parse(options.user);
    return { results: input.claims.map(item => ({ claimId: item.id, status: 'uncertain', explanation: 'Needs review', sourceRef: '', misconceptionId: null, repairedClaimIds: [] })) };
  });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  claim(store, state, 'There may be another reason for seasons.', 1);
  let atVerdict;
  const stop = store.subscribe(state.session.id, event => {
    if (event.type === 'claim' && event.data.status === 'uncertain') {
      atVerdict = JSON.parse(fs.readFileSync(path.join(temp, 'data/sessions', `${state.session.id}.json`), 'utf8'));
    }
  });
  await (await f.get('lib/agents/verifier.ts')).verifyNewClaims(state.session.id);
  stop();
  assert.equal(atVerdict.findings.length, 1);
  assert.equal(atVerdict.findings[0].claimIds[0], atVerdict.claims[0].id);
  const fresh = await fixture(() => { throw new Error('No model'); }).get('lib/store.ts');
  assert.equal(fresh.getSessionState(state.session.id).findings[0].reviewStatus, 'queued');
});

test('restored SSE history is not spoken again, while a new live directive is delivered once', async () => {
  const oldGlobals = Object.fromEntries(['window', 'EventSource', 'RTCPeerConnection', 'fetch'].map(key => [key, global[key]]));
  const previousAct = global.IS_REACT_ACT_ENVIRONMENT;
  let source;
  const sent = [];
  const handlers = {};
  const channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)), close() {}, addEventListener: (name, callback) => { handlers[name] = callback; } };
  global.window = { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };
  global.EventSource = class { constructor() { source = { onmessage: null, close() {} }; return source; } close() {} };
  global.RTCPeerConnection = class {
    addTransceiver() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'synthetic-offer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription() { handlers.open(); }
    close() {}
  };
  global.fetch = async url => {
    if (url === '/api/realtime/token') return Response.json({ value: 'synthetic-token' });
    if (url === 'https://api.openai.com/v1/realtime/calls') return new Response('synthetic-answer');
    throw new Error(`Unexpected request: ${url}`);
  };
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    const Voice = (await fixture(() => {}).get('components/VoiceClient.tsx')).default;
    await renderer.act(async () => { tree = renderer.create(React.createElement(Voice, { sessionId: 'restored-voice' })); });
    const historic = { id: 'historic', kind: 'ask', utteranceInstruction: 'Old question', reason: 'old', targetNodeIds: [] };
    const deliver = event => source.onmessage({ data: JSON.stringify(event) });
    await renderer.act(async () => deliver({ type: 'snapshot', data: { directives: [historic] } }));
    await renderer.act(async () => {
      tree.root.findAllByType('button').find(button => button.children.includes('Connect Curio')).props.onClick();
      await new Promise(resolve => setImmediate(resolve));
    });
    await renderer.act(async () => {
      deliver({ type: 'directive', data: historic });
      const fresh = { ...historic, id: 'fresh', utteranceInstruction: 'New question' };
      deliver({ type: 'directive', data: fresh });
      deliver({ type: 'directive', data: fresh });
    });
    const responses = sent.filter(event => event.type === 'response.create');
    assert.equal(responses.length, 1);
    assert.match(responses[0].response.instructions, /New question/);
    assert.match(responses[0].response.instructions, /Never lecture, supply missing facts, correct the speaker/);
    assert.match(responses[0].response.instructions, /Ask the teacher exactly the following question/);
    assert.match(responses[0].response.instructions, /Do not answer it/);
  } finally {
    if (tree) await renderer.act(async () => tree.unmount());
    for (const [key, value] of Object.entries(oldGlobals)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
    if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT; else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

test('review isolates corrupt records and missing packs while preserving valid queued evidence', async () => {
  const store = await fixture(() => {}).get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  const finding = { id: 'queued-good', sessionId: state.session.id, type: 'causal_leap', severity: 'moderate', confidence: 'uncertain', title: 'Readable finding', explanation: 'Needs review', claimIds: [], segmentIds: [], nodeIds: [], reviewStatus: 'queued' };
  store.addFinding(state.session.id, finding);
  const directory = path.join(temp, 'data/sessions');
  const corrupt = path.join(directory, 'broken-catalog.json');
  const missing = path.join(directory, 'missing-pack.json');
  const malformed = path.join(directory, 'bad-reference.json');
  fs.writeFileSync(corrupt, '{broken');
  fs.writeFileSync(missing, JSON.stringify({ ...state, session: { ...state.session, id: 'missing-pack', packId: 'not-installed' }, findings: [] }));
  fs.writeFileSync(malformed, JSON.stringify({ ...state, session: { ...state.session, id: 'bad-reference' }, findings: [{ ...finding, sessionId: 'bad-reference', sourceRef: {} }] }));
  try {
    const fresh = fixture(() => { throw new Error('No models while reviewing'); });
    const recovered = await fresh.get('lib/store.ts');
    assert.throws(() => recovered.getSessionState('bad-reference'), /Cannot restore session/);
    const catalog = recovered.listSessionStates();
    assert(catalog.states.some(item => item.session.id === state.session.id));
    assert(catalog.unavailableIds.includes('broken-catalog'));
    assert(catalog.unavailableIds.includes('bad-reference'));
    const review = await fresh.get('app/review/page.tsx');
    const tree = await review.default({ searchParams: Promise.resolve({}) });
    const html = (await import('react-dom/server')).renderToStaticMarkup(tree);
    assert.match(html, /Some saved sessions could not be opened/);
    assert.match(html, /Readable finding/);
    assert.match(html, /missing-pack/);
    assert.equal(fs.readFileSync(corrupt, 'utf8'), '{broken');
    assert.equal(fresh.calls.length, 0);
  } finally {
    fs.unlinkSync(corrupt); fs.unlinkSync(missing); fs.unlinkSync(malformed);
  }
});

test('a directory fsync failure reports uncertain durability without rolling memory behind replaced disk state', async () => {
  let failDirectorySync = false;
  const f = fixture(() => {}, { 'node:fs': { ...fs, fsyncSync(descriptor) {
    if (failDirectorySync && fs.fstatSync(descriptor).isDirectory()) {
      throw Object.assign(new Error('Simulated unsupported directory fsync'), { code: 'ENOTSUP' });
    }
    fs.fsyncSync(descriptor);
  } } });
  const store = await f.get('lib/store.ts');
  const state = store.createSession('earth-seasons', 'teacher');
  segment(store, state, 'Earth has tilt.', 1);
  const mapped = { id: 'committed-claim', sessionId: state.session.id, statement: 'Earth has tilt.', originalText: 'Earth has tilt.', segmentIds: ['segment-1'], nodeIds: ['axial-tilt'], status: 'observed', createdAtMs: 1 };
  failDirectorySync = true;
  assert.throws(() => store.commitMappedClaims(state.session.id, [mapped], 1), /Snapshot replaced, but directory sync failed/);
  const read = () => JSON.parse(fs.readFileSync(path.join(temp, 'data/sessions', `${state.session.id}.json`), 'utf8'));
  assert.equal(state.claimMapperCursor, 1);
  assert.equal(state.claims.length, 1);
  assert.deepEqual(read().claims, state.claims);
  const finding = { id: 'committed-finding', sessionId: state.session.id, type: 'causal_leap', severity: 'moderate', confidence: 'uncertain', title: 'Needs review', explanation: 'Fixture', claimIds: [mapped.id], segmentIds: ['segment-1'], nodeIds: ['axial-tilt'], reviewStatus: 'queued' };
  assert.throws(() => store.commitVerification(state.session.id, [{ ...mapped, status: 'uncertain' }], [finding]), /Snapshot replaced, but directory sync failed/);
  assert.deepEqual(read().findings, state.findings);
  assert.equal(state.claims[0].status, 'uncertain');
  const fresh = await fixture(() => { throw new Error('No model'); }).get('lib/store.ts');
  assert.equal(fresh.getSessionState(state.session.id).findings[0].id, finding.id);
});

import { readdirSync } from "node:fs";
import path from "node:path";

import { nanoid } from "nanoid";

import { loadPack } from "./packs";
import { readSnapshot, sessionIdPattern, SnapshotDurabilityError, writeSnapshot } from "./sessionPersistence";
import type {
  AgentEvent,
  AssumptionDebtItem,
  AtomicClaim,
  ConceptState,
  Directive,
  Finding,
  LearnerBelief,
  Session,
  SessionPhase,
  TranscriptSegment,
  VisualArtifact,
} from "./types";

export interface SessionState {
  session: Session;
  segments: TranscriptSegment[];
  claims: AtomicClaim[];
  findings: Finding[];
  beliefs: LearnerBelief[];
  teachbackResult?: TeachbackResult;
  conceptStates: Record<string, ConceptState>;
  assumptionDebt: AssumptionDebtItem[];
  agentEvents: AgentEvent[];
  directives: Directive[];
  visuals: VisualArtifact[];
  /** Index into segments; everything before it has been offered to the claim mapper. */
  claimMapperCursor: number;
  /** Revision of claim evidence used to avoid regenerating an unchanged learner model. */
  evidenceRevision: number;
  beliefRevision?: number;
}

export interface TeachbackResult {
  script: string;
  usedBeliefIds: string[];
  uncertainties: string[];
}

export type StoreEvent =
  | { type: "snapshot"; data: SessionState }
  | { type: "segment"; data: TranscriptSegment }
  | { type: "claim"; data: AtomicClaim }
  | { type: "finding"; data: Finding }
  | { type: "concept_state"; data: { nodeId: string; state: ConceptState } }
  | { type: "belief"; data: LearnerBelief }
  | { type: "beliefs"; data: LearnerBelief[] }
  | { type: "teachback_result"; data: TeachbackResult }
  | { type: "directive"; data: Directive }
  | { type: "agent_event"; data: AgentEvent }
  | { type: "assumption_debt"; data: AssumptionDebtItem }
  | { type: "phase"; data: SessionPhase };

type Subscriber = (event: StoreEvent) => void;

const sessions = new Map<string, SessionState>();
const subscribers = new Map<string, Set<Subscriber>>();
const sessionsDirectory = path.join(process.env.CURIO_DATA_DIR || path.join(process.cwd(), "data"), "sessions");

function requireState(sessionId: string): SessionState {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  return state;
}

function snapshot(sessionId: string): void {
  const state = requireState(sessionId);
  writeSnapshot(sessionsDirectory, state);
}

function notify(sessionId: string, event: StoreEvent): void {
  for (const send of subscribers.get(sessionId) ?? []) {
    try {
      send(event);
    } catch {
      subscribers.get(sessionId)?.delete(send);
    }
  }
}

function commit(sessionId: string, event: StoreEvent): void {
  snapshot(sessionId);
  notify(sessionId, event);
}

export function createSession(packId: string, mode: Session["mode"]): SessionState {
  const pack = loadPack(packId);
  const id = nanoid();
  const prerequisites = new Set(pack.prerequisites);
  const conceptStates = Object.fromEntries(
    pack.nodes.map((node) => [node.id, prerequisites.has(node.id) ? "assumed" : "unvisited"]),
  ) as Record<string, ConceptState>;
  const hintLevelByNode = Object.fromEntries(pack.nodes.map((node) => [node.id, 0])) as Record<string, 0 | 1 | 2>;

  const state: SessionState = {
    session: { id, packId, mode, phase: "listening", createdAt: Date.now(), questionCount: 0, hintLevelByNode },
    segments: [],
    claims: [],
    findings: [],
    beliefs: [],
    conceptStates,
    assumptionDebt: [],
    agentEvents: [],
    directives: [],
    visuals: [],
    claimMapperCursor: 0,
    evidenceRevision: 0,
  };

  sessions.set(id, state);
  snapshot(id);
  return state;
}

export function getSessionState(sessionId: string): SessionState | undefined {
  const cached = sessions.get(sessionId);
  if (cached) return cached;
  const restored = readSnapshot(sessionsDirectory, sessionId);
  if (restored) sessions.set(sessionId, restored);
  return restored;
}

/** Use the same validated recovery path for the review queue as for a live session. */
export function listSessionStates(): { states: SessionState[]; unavailableIds: string[] } {
  const result: { states: SessionState[]; unavailableIds: string[] } = { states: [], unavailableIds: [] };
  let names: string[];
  try { names = readdirSync(sessionsDirectory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    throw error;
  }
  for (const name of names.filter(name => name.endsWith(".json") && sessionIdPattern.test(name.slice(0, -5)))) {
    const id = name.slice(0, -5);
    try { const state = getSessionState(id); if (state) result.states.push(state); }
    catch (error) { console.error(error); result.unavailableIds.push(id); }
  }
  return result;
}

/** Claims and their consumed transcript cursor must survive a crash together. */
export function commitMappedClaims(sessionId: string, claims: AtomicClaim[], cursor: number): void {
  const state = requireState(sessionId);
  const additions = claims.filter(claim => !state.claims.some(previous =>
    previous.statement === claim.statement && previous.originalText === claim.originalText
    && JSON.stringify(previous.segmentIds) === JSON.stringify(claim.segmentIds)));
  const previous = { claims: state.claims, cursor: state.claimMapperCursor, revision: state.evidenceRevision };
  state.claims = [...state.claims, ...additions];
  state.claimMapperCursor = Math.max(state.claimMapperCursor, cursor);
  state.evidenceRevision += additions.length;
  try { snapshot(sessionId); }
  catch (error) {
    if (!(error instanceof SnapshotDurabilityError)) {
      state.claims = previous.claims;
      state.claimMapperCursor = previous.cursor;
      state.evidenceRevision = previous.revision;
    }
    throw error;
  }
  for (const claim of additions) notify(sessionId, { type: "claim", data: claim });
}

/** A verdict and its findings/repairs must be restored as one checkpoint. */
export function commitVerification(sessionId: string, updates: AtomicClaim[], findings: Finding[]): void {
  const state = requireState(sessionId);
  const previous = { claims: state.claims, findings: state.findings, revision: state.evidenceRevision };
  const changed = updates.filter(claim => JSON.stringify(state.claims.find(item => item.id === claim.id)) !== JSON.stringify(claim));
  const byId = new Map(changed.map(claim => [claim.id, claim]));
  state.claims = state.claims.map(claim => byId.get(claim.id) ?? claim);
  state.findings = [...state.findings, ...findings];
  state.evidenceRevision += changed.length;
  try { snapshot(sessionId); }
  catch (error) {
    if (!(error instanceof SnapshotDurabilityError)) {
      state.claims = previous.claims;
      state.findings = previous.findings;
      state.evidenceRevision = previous.revision;
    }
    throw error;
  }
  for (const claim of changed) notify(sessionId, { type: "claim", data: claim });
  for (const finding of findings) notify(sessionId, { type: "finding", data: finding });
}

export function addSegment(sessionId: string, segment: TranscriptSegment): void {
  requireState(sessionId).segments.push(segment);
  commit(sessionId, { type: "segment", data: segment });
}

export function upsertClaim(sessionId: string, claim: AtomicClaim): void {
  const state = requireState(sessionId);
  const claims = state.claims;
  const index = claims.findIndex((item) => item.id === claim.id);
  if (index >= 0 && JSON.stringify(claims[index]) === JSON.stringify(claim)) return;
  if (index === -1) claims.push(claim);
  else claims[index] = claim;
  state.evidenceRevision += 1;
  commit(sessionId, { type: "claim", data: claim });
}

export function addFinding(sessionId: string, finding: Finding): void {
  requireState(sessionId).findings.push(finding);
  commit(sessionId, { type: "finding", data: finding });
}

export function upsertFinding(sessionId: string, finding: Finding): void {
  const findings = requireState(sessionId).findings;
  const index = findings.findIndex((item) => item.id === finding.id);
  if (index === -1) findings.push(finding);
  else findings[index] = finding;
  commit(sessionId, { type: "finding", data: finding });
}

export function upsertAssumptionDebt(sessionId: string, item: AssumptionDebtItem): void {
  const debt = requireState(sessionId).assumptionDebt;
  const index = debt.findIndex((existing) => existing.term.toLocaleLowerCase() === item.term.toLocaleLowerCase());
  if (index === -1) debt.push(item);
  else debt[index] = item;
  commit(sessionId, { type: "assumption_debt", data: item });
}

export function setClaimMapperCursor(sessionId: string, cursor: number): void {
  const state = requireState(sessionId);
  state.claimMapperCursor = Math.max(state.claimMapperCursor, cursor);
  snapshot(sessionId);
}

export function setConceptState(sessionId: string, nodeId: string, state: ConceptState): void {
  requireState(sessionId).conceptStates[nodeId] = state;
  commit(sessionId, { type: "concept_state", data: { nodeId, state } });
}

export function addBelief(sessionId: string, belief: LearnerBelief): void {
  requireState(sessionId).beliefs.push(belief);
  commit(sessionId, { type: "belief", data: belief });
}

export function upsertBelief(sessionId: string, belief: LearnerBelief): void {
  const beliefs = requireState(sessionId).beliefs;
  const index = beliefs.findIndex((item) => item.id === belief.id);
  if (index === -1) beliefs.push(belief);
  else beliefs[index] = belief;
  commit(sessionId, { type: "belief", data: belief });
}

export function replaceBeliefs(sessionId: string, beliefs: LearnerBelief[], evidenceRevision: number): void {
  const state = requireState(sessionId);
  state.beliefs = beliefs;
  state.beliefRevision = evidenceRevision;
  commit(sessionId, { type: "beliefs", data: beliefs });
}

export function setTeachbackResult(sessionId: string, result: TeachbackResult): void {
  requireState(sessionId).teachbackResult = result;
  commit(sessionId, { type: "teachback_result", data: result });
}

export function pushDirective(sessionId: string, directive: Directive): void {
  requireState(sessionId).directives.push(directive);
  commit(sessionId, { type: "directive", data: directive });
}

export function emitAgentEvent(sessionId: string, event: AgentEvent): void {
  requireState(sessionId).agentEvents.push(event);
  commit(sessionId, { type: "agent_event", data: event });
}

export function setPhase(sessionId: string, phase: SessionPhase): void {
  requireState(sessionId).session.phase = phase;
  commit(sessionId, { type: "phase", data: phase });
}

export function subscribe(sessionId: string, send: Subscriber): () => void {
  const state = requireState(sessionId);
  const sessionSubscribers = subscribers.get(sessionId) ?? new Set<Subscriber>();
  sessionSubscribers.add(send);
  subscribers.set(sessionId, sessionSubscribers);
  send({ type: "snapshot", data: state });
  return () => unsubscribe(sessionId, send);
}

export function unsubscribe(sessionId: string, send: Subscriber): void {
  const sessionSubscribers = subscribers.get(sessionId);
  sessionSubscribers?.delete(send);
  if (sessionSubscribers?.size === 0) subscribers.delete(sessionId);
}

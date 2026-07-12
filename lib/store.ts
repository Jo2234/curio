import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nanoid } from "nanoid";

import { loadPack } from "./packs";
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
  | { type: "teachback_result"; data: TeachbackResult }
  | { type: "directive"; data: Directive }
  | { type: "agent_event"; data: AgentEvent }
  | { type: "assumption_debt"; data: AssumptionDebtItem }
  | { type: "phase"; data: SessionPhase };

type Subscriber = (event: StoreEvent) => void;

const sessions = new Map<string, SessionState>();
const subscribers = new Map<string, Set<Subscriber>>();
const sessionsDirectory = path.join(process.cwd(), "data", "sessions");

function requireState(sessionId: string): SessionState {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  return state;
}

function snapshot(sessionId: string): void {
  const state = requireState(sessionId);
  mkdirSync(sessionsDirectory, { recursive: true });
  writeFileSync(path.join(sessionsDirectory, `${sessionId}.json`), `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
    session: { id, packId, mode, phase: "setup", createdAt: Date.now(), questionCount: 0, hintLevelByNode },
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
  };

  sessions.set(id, state);
  snapshot(id);
  return state;
}

export function getSessionState(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function addSegment(sessionId: string, segment: TranscriptSegment): void {
  requireState(sessionId).segments.push(segment);
  commit(sessionId, { type: "segment", data: segment });
}

export function upsertClaim(sessionId: string, claim: AtomicClaim): void {
  const claims = requireState(sessionId).claims;
  const index = claims.findIndex((item) => item.id === claim.id);
  if (index === -1) claims.push(claim);
  else claims[index] = claim;
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

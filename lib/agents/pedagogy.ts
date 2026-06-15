import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import {
  emitAgentEvent,
  getSessionState,
  pushDirective,
  setConceptState,
  setPhase,
} from "../store";
import type { SessionState } from "../store";
import type {
  AtomicClaim,
  ConceptPack,
  Directive,
  Finding,
  Misconception,
  TransferProbe,
} from "../types";

const QUESTION_BUDGET = 5;
const TRANSFER_AFTER_QUESTIONS = 3;
const DIRECTIVE_DEBOUNCE_MS = 20_000;
const EXPLANATION_PAUSE_MS = 4_000;
const LISTENING_MIN_MS = 60_000;
const LISTENING_MIN_SEGMENTS = 4;
const MISCONCEPTION_INTERRUPT_SEGMENTS = 2;

type DirectiveEventPayload = {
  directiveId?: string;
  misconceptionId?: string;
  probeId?: string;
  userSegmentCount?: number;
};

type ProposedQuestion = {
  question: string;
  reason: string;
  targetNodeIds: string[];
};

type TransferEvaluation = {
  result: "passed" | "partial" | "failed";
  reason: string;
};

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "reason", "targetNodeIds"],
  properties: {
    question: { type: "string" },
    reason: { type: "string" },
    targetNodeIds: { type: "array", items: { type: "string" } },
  },
} as const;

const transferSchema = {
  type: "object",
  additionalProperties: false,
  required: ["result", "reason"],
  properties: {
    result: { type: "string", enum: ["passed", "partial", "failed"] },
    reason: { type: "string" },
  },
} as const;

const activeDecisions = new Set<string>();

function pedagogyEvents(state: SessionState) {
  return state.agentEvents.filter((event) => event.agent === "pedagogy");
}

function directiveEvent(state: SessionState, directiveId?: string) {
  return [...pedagogyEvents(state)].reverse().find((event) => {
    const payload = event.payload as DirectiveEventPayload | undefined;
    return directiveId ? payload?.directiveId === directiveId : Boolean(payload?.directiveId);
  });
}

function lastDirectiveTime(state: SessionState): number | undefined {
  return directiveEvent(state)?.tMs;
}

function comparableAge(tMs: number, now = Date.now()): number | undefined {
  // Browser audio clocks may be session-relative. Only compare wall-clock-looking values.
  return tMs > 1_000_000_000_000 ? now - tMs : undefined;
}

function isDebounced(state: SessionState): boolean {
  const now = Date.now();
  const directiveTime = lastDirectiveTime(state);
  if (directiveTime !== undefined && now - directiveTime < DIRECTIVE_DEBOUNCE_MS) return true;

  const lastUser = [...state.segments].reverse().find((segment) => segment.speaker === "user");
  if (!lastUser) return false;
  const age = comparableAge(lastUser.tMs, now);
  return age !== undefined && age < EXPLANATION_PAUSE_MS;
}

function misconceptionForFinding(
  finding: Finding,
  state: SessionState,
  pack: ConceptPack,
): Misconception | undefined {
  const sourceId = finding.sourceRef?.match(/\bmc:([^\s]+)/)?.[1];
  const claimId = finding.claimIds
    .map((id) => state.claims.find((claim) => claim.id === id)?.misconceptionId)
    .find(Boolean);
  return pack.misconceptions.find((item) => item.id === sourceId || item.id === claimId);
}

function unresolvedMisconceptions(state: SessionState, pack: ConceptPack) {
  return state.findings.flatMap((finding) => {
    if (finding.type !== "factual_contradiction") return [];
    const misconception = misconceptionForFinding(finding, state, pack);
    if (!misconception) return [];
    const contradictions = state.claims.filter((claim) =>
      claim.misconceptionId === misconception.id &&
      (claim.status === "contradicted" || claim.status === "superseded"));
    const repaired = contradictions.some((claim) => hasVerifiedRepair(claim, finding, state.claims));
    return repaired ? [] : [{ finding, misconception, contradictions }];
  });
}

function hasVerifiedRepair(contradiction: AtomicClaim, finding: Finding, claims: AtomicClaim[]): boolean {
  const targetNodes = new Set([...contradiction.nodeIds, ...finding.nodeIds]);
  return claims.some((claim) =>
    claim.status === "verified" &&
    claim.createdAtMs > contradiction.createdAtMs &&
    claim.nodeIds.some((nodeId) => targetNodes.has(nodeId)) &&
    (claim.supersedesClaimId === contradiction.id || contradiction.status === "superseded"));
}

function userSegmentCount(state: SessionState): number {
  return state.segments.filter((segment) => segment.speaker === "user").length;
}

function pushPedagogyDirective(
  sessionId: string,
  directive: Omit<Directive, "id">,
  metadata: Omit<DirectiveEventPayload, "directiveId" | "userSegmentCount"> = {},
  substantive = true,
): Directive {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const complete: Directive = { id: nanoid(), ...directive };
  if (substantive) state.session.questionCount = Math.min(QUESTION_BUDGET, state.session.questionCount + 1);
  pushDirective(sessionId, complete);
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "pedagogy",
    message: directive.reason,
    tMs: Date.now(),
    payload: {
      directiveId: complete.id,
      userSegmentCount: userSegmentCount(state),
      ...metadata,
    },
  });
  return complete;
}

function surfaced(state: SessionState, misconception: Misconception): boolean {
  return state.directives.some((directive) => directive.utteranceInstruction === misconception.counterQuestion);
}

function listeningWindowSatisfied(state: SessionState): boolean {
  const users = state.segments.filter((segment) => segment.speaker === "user");
  if (users.length < LISTENING_MIN_SEGMENTS) return false;
  const first = users[0];
  const last = users.at(-1)!;
  const wallAge = comparableAge(first.tMs);
  const elapsed = wallAge === undefined ? last.tMs - first.tMs : Math.max(wallAge, last.tMs - first.tMs);
  return elapsed >= LISTENING_MIN_MS;
}

function repairTargetNodes(finding: Finding, state: SessionState): string[] {
  const nodes = [...new Set([
    ...finding.nodeIds,
    ...finding.claimIds.flatMap((id) => state.claims.find((claim) => claim.id === id)?.nodeIds ?? []),
  ])];
  return nodes.length > 0 ? nodes : [];
}

function h1Text(misconception: Misconception): string {
  if (misconception.id === "mc-distance") {
    return "Compare both hemispheres at the same moment. Could one shared distance account for opposite outcomes?";
  }
  if (misconception.id === "mc-same-seasons") {
    return "Focus on which way each hemisphere is tilted at the same moment, then compare their outcomes.";
  }
  if (misconception.id === "mc-wobbling-tilt") {
    return "Track the direction of the axis against a distant reference point as Earth moves around its orbit.";
  }
  if (misconception.id === "mc-hotter-because-longer-only") {
    return "Compare not only how long sunlight arrives, but also how the same incoming energy is distributed on the ground.";
  }
  return `Look for the counterexample in this idea: ${misconception.explanation.split(/[.;]/, 1)[0]}. What does it make you reconsider?`;
}

function emitHint(
  sessionId: string,
  misconception: Misconception,
  targetNodeIds: string[],
  requestedLevel?: 1 | 2,
): void {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const current = Math.max(0, ...targetNodeIds.map((nodeId) => state.session.hintLevelByNode[nodeId] ?? 0)) as 0 | 1 | 2;
  const level = requestedLevel ?? (current === 0 ? 1 : 2);
  for (const nodeId of targetNodeIds) state.session.hintLevelByNode[nodeId] = level;
  const utteranceInstruction = level === 1
    ? h1Text(misconception)
    : `${misconception.explanation} Now explain that back to me in your own words.`;
  pushPedagogyDirective(sessionId, {
    kind: "hint",
    utteranceInstruction,
    reason: level === 1
      ? "The first counterexample did not dislodge the misconception, so Curio is narrowing attention without giving away the correction."
      : "The misconception persisted after a directional hint, so Curio is explaining the correction and asking for reconstruction.",
    targetNodeIds,
    hintLevel: level,
  }, { misconceptionId: misconception.id }, false);
}

function fallbackQuestion(state: SessionState, pack: ConceptPack): ProposedQuestion | undefined {
  const active = (nodeId: string) => ["established", "assisted", "assumed"].includes(state.conceptStates[nodeId]);
  const missing = (nodeId: string) => ["unvisited", "missing"].includes(state.conceptStates[nodeId]);
  const mentioned = (nodeId: string) => state.claims.some((claim) => claim.nodeIds.includes(nodeId));

  const conditions: Record<string, boolean> = {
    "fq-mechanism": (active("sunlight-angle") || mentioned("sunlight-angle")) && missing("energy-concentration"),
    "fq-daylength": active("sunlight-angle") && missing("day-length"),
    "fq-opposite": (active("axial-tilt") || active("hemisphere")) && missing("opposite-seasons"),
    "fq-fixed-axis": active("axial-tilt") && (active("orbit") || mentioned("orbit")) && missing("fixed-axis"),
    "fq-define-tilt": mentioned("axial-tilt") && state.assumptionDebt.some((item) =>
      !item.laterExplained && /axis|axial tilt/i.test(item.term)),
  };

  const match = pack.fallbackQuestions.find((question) => conditions[question.id]);
  if (!match) return undefined;
  const targetNodeIds: Record<string, string[]> = {
    "fq-mechanism": ["energy-concentration"],
    "fq-daylength": ["day-length"],
    "fq-opposite": ["opposite-seasons"],
    "fq-fixed-axis": ["fixed-axis"],
    "fq-define-tilt": ["axial-tilt"],
  };
  return {
    question: match.question,
    reason: `A required idea is missing while its neighboring claims are established. Pack trigger: ${match.trigger}`,
    targetNodeIds: (targetNodeIds[match.id] ?? []).filter((id) => id in state.conceptStates),
  };
}

async function llmQuestion(state: SessionState, pack: ConceptPack): Promise<ProposedQuestion | undefined> {
  const validNodeIds = new Set(pack.nodes.map((node) => node.id));
  try {
    const output = await jsonCall<ProposedQuestion>({
      system: [
        "You select Curio's next novice question.",
        "Return exactly one answerable question about one issue at the pack's learner level.",
        "Use the user's own wording where possible. Do not correct the user or leak the answer.",
        "The reason must state the diagnostic purpose, not praise the question.",
      ].join("\n"),
      user: JSON.stringify({
        established: Object.entries(state.conceptStates).filter(([, value]) => ["established", "assisted"].includes(value)).map(([id]) => id),
        missing: Object.entries(state.conceptStates).filter(([, value]) => ["unvisited", "missing"].includes(value)).map(([id]) => id),
        recentClaims: state.claims.slice(-8).map(({ statement, originalText, nodeIds, status }) => ({ statement, originalText, nodeIds, status })),
        constraints: ["one question", "one issue", "answerable at level", "no answer leakage", "use the user's wording"],
      }),
      schema: proposalSchema,
      maxTokens: 500,
    });
    const question = output.question?.trim();
    const reason = output.reason?.trim();
    if (!question || !reason || (question.match(/\?/g)?.length ?? 0) > 1) return undefined;
    return {
      question,
      reason,
      targetNodeIds: [...new Set((output.targetNodeIds ?? []).filter((id) => validNodeIds.has(id)))],
    };
  } catch (error) {
    console.error("Pedagogy question generation unavailable; waiting for the next deterministic opening", error);
    return undefined;
  }
}

function transferProbe(state: SessionState, pack: ConceptPack): TransferProbe | undefined {
  const established = new Set(Object.entries(state.conceptStates)
    .filter(([, value]) => ["established", "assisted"].includes(value))
    .map(([id]) => id));
  const score = (probe: TransferProbe) => probe.targetEdgeIds.reduce((total, edgeId) => {
    const edge = pack.edges.find((candidate) => candidate.id === edgeId);
    return total + (edge && established.has(edge.from) ? 1 : 0) + (edge && established.has(edge.to) ? 1 : 0);
  }, 0);
  return [...pack.transferProbes].sort((a, b) =>
    score(b) - score(a) ||
    Number(b.id === "tp-no-tilt") - Number(a.id === "tp-no-tilt") ||
    a.id.localeCompare(b.id))[0];
}

function targetNodesForProbe(probe: TransferProbe, pack: ConceptPack): string[] {
  return [...new Set(probe.targetEdgeIds.flatMap((edgeId) => {
    const edge = pack.edges.find((item) => item.id === edgeId);
    return edge ? [edge.from, edge.to] : [];
  }))];
}

async function runTransfer(sessionId: string, state: SessionState, pack: ConceptPack): Promise<void> {
  const existing = state.directives.find((directive) => directive.kind === "transfer");
  if (!existing) {
    if (isDebounced(state)) return;
    const probe = transferProbe(state, pack);
    if (!probe) return;
    pushPedagogyDirective(sessionId, {
      kind: "transfer",
      utteranceInstruction: probe.question,
      reason: "This transfer case checks whether the explanation can be applied beyond the example just taught.",
      targetNodeIds: targetNodesForProbe(probe, pack),
    }, { probeId: probe.id });
    return;
  }

  const event = directiveEvent(state, existing.id);
  const metadata = event?.payload as DirectiveEventPayload | undefined;
  const alreadyEvaluated = pedagogyEvents(state).some((item) => {
    const payload = item.payload as { transferDirectiveId?: string } | undefined;
    return payload?.transferDirectiveId === existing.id;
  });
  if (!event || alreadyEvaluated) return;
  const usersAtProbe = metadata?.userSegmentCount ?? userSegmentCount(state);
  const answer = state.segments.filter((segment) => segment.speaker === "user").slice(usersAtProbe);
  if (answer.length === 0) return;
  const probe = pack.transferProbes.find((item) => item.id === metadata?.probeId) ?? transferProbe(state, pack);
  if (!probe) return;

  let evaluation: TransferEvaluation;
  try {
    evaluation = await jsonCall<TransferEvaluation>({
      system: "Evaluate Curio's transfer answer leniently. Passed captures the core causal reasoning; partial captures a useful part; failed does not apply the mechanism.",
      user: JSON.stringify({ answer: answer.map((segment) => segment.text).join("\n"), expectedReasoning: probe.expectedReasoning }),
      schema: transferSchema,
      maxTokens: 300,
    });
  } catch (error) {
    console.error("Transfer evaluation deferred", error);
    return;
  }
  if (!(["passed", "partial", "failed"] as const).includes(evaluation.result)) return;
  const targets = targetNodesForProbe(probe, pack);
  if (evaluation.result === "failed") {
    for (const nodeId of targets) setConceptState(sessionId, nodeId, "fragile");
  }
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "pedagogy",
    message: `Transfer: ${evaluation.result}`,
    tMs: Date.now(),
    payload: { transferDirectiveId: existing.id, probeId: probe.id, reason: evaluation.reason },
  });
  const fresh = getSessionState(sessionId);
  if (fresh?.session.questionCount === QUESTION_BUDGET) await enterTeachback(sessionId);
}

function normalizeTeachbackDirective(value: unknown): Omit<Directive, "id"> | undefined {
  if (typeof value === "string" && value.trim()) {
    return {
      kind: "teachback",
      utteranceInstruction: value.trim(),
      reason: "Curio is reconstructing the lesson using only the learner beliefs recorded from the user's teaching.",
      targetNodeIds: [],
    };
  }
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Directive> & { script?: unknown };
  const utterance = typeof candidate.utteranceInstruction === "string"
    ? candidate.utteranceInstruction
    : typeof candidate.script === "string" ? candidate.script : undefined;
  if (!utterance) return undefined;
  return {
    kind: "teachback",
    utteranceInstruction: utterance,
    reason: typeof candidate.reason === "string" && candidate.reason.trim()
      ? candidate.reason
      : "Curio is reconstructing the lesson using only the learner beliefs recorded from the user's teaching.",
    targetNodeIds: Array.isArray(candidate.targetNodeIds) ? candidate.targetNodeIds : [],
  };
}

async function enterTeachback(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  if (state.session.phase !== "teachback") setPhase(sessionId, "teachback");
  if (state.directives.some((directive) => directive.kind === "teachback")) return;
  try {
    const teachbackAgent = await import("./teachback");
    const generate = (teachbackAgent as { generate?: (id: string) => unknown }).generate;
    if (typeof generate !== "function") return;
    const result = await generate(sessionId);
    const directive = normalizeTeachbackDirective(result);
    const fresh = getSessionState(sessionId);
    if (directive && fresh && !isDebounced(fresh)) pushPedagogyDirective(sessionId, directive, {}, false);
  } catch (error) {
    console.error("Teach-back generation unavailable", error);
  }
}

async function enterReport(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  setPhase(sessionId, "report");
  try {
    const reportAgent = await import("./reportComposer");
    const compose = (reportAgent as { compose?: (id: string) => unknown }).compose;
    if (typeof compose === "function") await compose(sessionId);
  } catch (error) {
    console.error("Report composition unavailable", error);
  }
}

async function decideUnlocked(sessionId: string): Promise<void> {
  let state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(state.session.packId);
  if (["setup", "teachback", "report", "complete"].includes(state.session.phase)) return;

  const unresolved = unresolvedMisconceptions(state, pack);

  if (state.session.phase === "listening") {
    const mayInterrupt = userSegmentCount(state) >= MISCONCEPTION_INTERRUPT_SEGMENTS && unresolved.length > 0;
    if (!mayInterrupt && !listeningWindowSatisfied(state)) return;
    setPhase(sessionId, mayInterrupt ? "repair" : "questioning");
    state = getSessionState(sessionId)!;
  }

  if (state.session.phase === "repair") {
    if (unresolved.length === 0) {
      setPhase(sessionId, state.session.questionCount >= TRANSFER_AFTER_QUESTIONS ? "transfer" : "questioning");
      return;
    }
    const { finding, misconception } = unresolved[0];
    const targets = repairTargetNodes(finding, state);
    if (!surfaced(state, misconception)) {
      if (isDebounced(state)) return;
      pushPedagogyDirective(sessionId, {
        kind: "ask",
        utteranceInstruction: misconception.counterQuestion,
        reason: misconception.id === "mc-distance"
          ? "User stated the distance misconception; counterexample probes whether the belief is load-bearing."
          : "A verified misconception was surfaced; this counterexample tests whether the belief is load-bearing.",
        targetNodeIds: targets,
        hintLevel: 0,
      }, { misconceptionId: misconception.id });
      return;
    }

    const latestPromptEvent = [...pedagogyEvents(state)].reverse().find((event) =>
      (event.payload as DirectiveEventPayload | undefined)?.misconceptionId === misconception.id);
    const usersAtPrompt = (latestPromptEvent?.payload as DirectiveEventPayload | undefined)?.userSegmentCount ?? userSegmentCount(state);
    const laterSegmentIds = new Set(state.segments.filter((segment) => segment.speaker === "user").slice(usersAtPrompt).map((segment) => segment.id));
    const targetSet = new Set(targets);
    const stillContradicts = state.claims.some((claim) =>
      claim.status === "contradicted" &&
      (claim.misconceptionId === misconception.id || claim.nodeIds.some((nodeId) => targetSet.has(nodeId))) &&
      claim.segmentIds.some((id) => laterSegmentIds.has(id)));
    if (stillContradicts && !isDebounced(state)) emitHint(sessionId, misconception, targets);
    return;
  }

  if (state.session.phase === "transfer") {
    await runTransfer(sessionId, state, pack);
    return;
  }

  if (state.session.phase !== "questioning") return;
  if (state.session.questionCount >= TRANSFER_AFTER_QUESTIONS) {
    setPhase(sessionId, "transfer");
    await runTransfer(sessionId, getSessionState(sessionId)!, pack);
    return;
  }
  if (isDebounced(state)) return;

  const unsurfaced = unresolved.find(({ misconception }) => !surfaced(state, misconception));
  if (unsurfaced) {
    setPhase(sessionId, "repair");
    pushPedagogyDirective(sessionId, {
      kind: "ask",
      utteranceInstruction: unsurfaced.misconception.counterQuestion,
      reason: unsurfaced.misconception.id === "mc-distance"
        ? "User stated the distance misconception; counterexample probes whether the belief is load-bearing."
        : "A verified misconception was surfaced; this counterexample tests whether the belief is load-bearing.",
      targetNodeIds: repairTargetNodes(unsurfaced.finding, state),
      hintLevel: 0,
    }, { misconceptionId: unsurfaced.misconception.id });
    return;
  }

  const fallback = fallbackQuestion(state, pack);
  const debt = state.assumptionDebt.find((item) => !item.laterExplained);
  const question = fallback ?? (debt ? {
    question: `You've used the word '${debt.term}' a few times — what does it actually mean here?`,
    reason: `The term '${debt.term}' is carrying part of the explanation but remains undefined.`,
    targetNodeIds: [],
  } : await llmQuestion(state, pack));
  if (!question) return;
  pushPedagogyDirective(sessionId, {
    kind: "ask",
    utteranceInstruction: question.question,
    reason: question.reason,
    targetNodeIds: question.targetNodeIds,
  });
}

/** Examine the latest session state and push no more than one directive. */
export async function decide(sessionId: string): Promise<void> {
  if (activeDecisions.has(sessionId)) return;
  activeDecisions.add(sessionId);
  try {
    await decideUnlocked(sessionId);
  } finally {
    activeDecisions.delete(sessionId);
  }
}

/** Handle explicit user steering from the session controls. */
export async function advance(sessionId: string, action: "hint" | "teachback" | "finish"): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);

  if (action === "hint") {
    const pack = loadPack(state.session.packId);
    const repair = unresolvedMisconceptions(state, pack)[0];
    if (!repair || isDebounced(state)) return;
    if (state.session.phase !== "repair") setPhase(sessionId, "repair");
    emitHint(sessionId, repair.misconception, repairTargetNodes(repair.finding, state));
    return;
  }

  if (action === "finish" && state.session.phase === "teachback") {
    await enterReport(sessionId);
    return;
  }
  await enterTeachback(sessionId);
}

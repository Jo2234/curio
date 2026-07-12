import { nanoid } from "nanoid";

import { deepJsonCall } from "../llm";
import { emitAgentEvent, getSessionState, type SessionState } from "../store";
import type {
  AssumptionDebtItem,
  AtomicClaim,
  ConceptState,
  Finding,
  LearnerBelief,
  TranscriptSegment,
} from "../types";

export interface TeachbackResult {
  script: string;
  beliefGraphNodeIds: string[];
  uncertainties: string[];
}

export interface SessionReport {
  generatedAt: number;
  summary?: string;
  recommendedNextStep: string;
  claims: AtomicClaim[];
  findings: Finding[];
  conceptStates: Record<string, ConceptState>;
  assumptionDebt: AssumptionDebtItem[];
  beliefs: LearnerBelief[];
  teachbackResult?: TeachbackResult;
  hintLevelByNode: Record<string, 0 | 1 | 2>;
  segments: TranscriptSegment[];
}

type StateWithReport = SessionState & {
  teachbackResult?: TeachbackResult;
  session: SessionState["session"] & {
    report?: SessionReport;
    teachbackResult?: TeachbackResult;
  };
};

interface GeneratedConclusion {
  summary: string;
  recommendedNextStep: string;
}

const conclusionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendedNextStep"],
  properties: {
    summary: { type: "string", description: "Exactly two concise sentences." },
    recommendedNextStep: { type: "string", description: "One specific teaching action, written as an imperative." },
  },
} as const;

function teachbackFrom(state: StateWithReport): TeachbackResult | undefined {
  return state.teachbackResult ?? state.session.teachbackResult;
}

function fallbackNextStep(state: SessionState): string {
  const missing = Object.entries(state.conceptStates).find(([, value]) => value === "missing" || value === "unvisited");
  if (missing) return `Re-explain ${missing[0].replaceAll("-", " ")} without hints.`;
  const fragile = Object.entries(state.conceptStates).find(([, value]) => value === "fragile" || value === "misconceived");
  if (fragile) return `Re-explain ${fragile[0].replaceAll("-", " ")} using a fresh example.`;
  const assisted = Object.entries(state.session.hintLevelByNode).find(([, level]) => level > 0);
  if (assisted) return `Re-explain ${assisted[0].replaceAll("-", " ")} without hints.`;
  return "Teach the same mechanism once more using a new real-world example.";
}

export function assembleReport(state: SessionState): SessionReport {
  const extended = state as StateWithReport;
  return {
    generatedAt: Date.now(),
    recommendedNextStep: fallbackNextStep(state),
    claims: [...state.claims],
    findings: [...state.findings],
    conceptStates: { ...state.conceptStates },
    assumptionDebt: [...state.assumptionDebt],
    beliefs: [...state.beliefs],
    ...(teachbackFrom(extended) ? { teachbackResult: teachbackFrom(extended) } : {}),
    hintLevelByNode: { ...state.session.hintLevelByNode },
    segments: [...state.segments],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reconcile a persisted report with the current session state.
 *
 * Report composition is asynchronous and snapshots from older app versions may
 * contain only part of SessionReport. Treat the stored object as optional
 * presentation metadata, never as the source of truth for evidence collections.
 */
export function normalizeReport(state: SessionState, stored: unknown): SessionReport {
  const current = assembleReport(state);
  if (!isRecord(stored)) return current;

  const generatedAt = typeof stored.generatedAt === "number" && Number.isFinite(stored.generatedAt)
    ? stored.generatedAt
    : current.generatedAt;
  const recommendedNextStep = typeof stored.recommendedNextStep === "string" && stored.recommendedNextStep.trim()
    ? stored.recommendedNextStep
    : current.recommendedNextStep;
  const summary = typeof stored.summary === "string" && stored.summary.trim()
    ? stored.summary
    : current.summary;
  const conceptStates = isRecord(stored.conceptStates)
    ? { ...current.conceptStates, ...stored.conceptStates } as SessionReport["conceptStates"]
    : current.conceptStates;
  const hintLevelByNode = isRecord(stored.hintLevelByNode)
    ? { ...current.hintLevelByNode, ...stored.hintLevelByNode } as SessionReport["hintLevelByNode"]
    : current.hintLevelByNode;

  return {
    ...current,
    generatedAt,
    recommendedNextStep,
    ...(summary ? { summary } : {}),
    conceptStates,
    hintLevelByNode,
    // These arrays can continue changing while the conclusion is composed.
    // Always render one coherent, current snapshot rather than stale copies.
    claims: [...state.claims],
    findings: [...state.findings],
    assumptionDebt: [...state.assumptionDebt],
    beliefs: [...state.beliefs],
    segments: [...state.segments],
  };
}

export async function compose(sessionId: string): Promise<SessionReport> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);

  const report = assembleReport(state);
  let callFailed = false;

  try {
    const conclusion = await deepJsonCall<GeneratedConclusion>({
      system: [
        "You write the conclusion of a Curio evidence report.",
        "Describe the learner model as a map, never a grade. Do not quantify understanding or use evaluative praise.",
        "The summary must be exactly two short sentences. The next step must be one concrete teaching action.",
      ].join(" "),
      user: JSON.stringify({
        beliefs: report.beliefs.map(({ statement, status, ambiguityNote }) => ({ statement, status, ambiguityNote })),
        conceptStates: report.conceptStates,
        findings: report.findings.map(({ title, severity, confidence, reviewStatus, nodeIds }) => ({
          title, severity, confidence, reviewStatus, nodeIds,
        })),
        hintLevelByNode: report.hintLevelByNode,
        teachback: report.teachbackResult,
      }),
      schema: conclusionSchema,
      maxTokens: 300,
    });
    if (conclusion.summary.trim()) report.summary = conclusion.summary.trim();
    if (conclusion.recommendedNextStep.trim()) report.recommendedNextStep = conclusion.recommendedNextStep.trim();
  } catch (error) {
    callFailed = true;
    console.error("Report conclusion generation failed; assembled evidence remains available", error);
  }

  const extended = state as StateWithReport;
  extended.session.report = report;
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "report",
    message: callFailed
      ? "Evidence report assembled; generated summary is unavailable"
      : "Evidence report assembled with a recommended next step",
    tMs: Date.now(),
    payload: { generatedAt: report.generatedAt, summaryAvailable: Boolean(report.summary) },
  });

  return report;
}

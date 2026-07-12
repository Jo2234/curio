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

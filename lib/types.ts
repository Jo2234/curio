// ---------- Concept Pack ----------
export interface ConceptPack {
  id: string; version: string; title: string; subject: string; level: string;
  verificationStatus: "ai_generated_draft" | "source_grounded" | "instructor_approved";
  objectives: Objective[];
  prerequisites: string[];          // node ids the novice may treat as known
  vocabulary: string[];             // terms that must be defined if used
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  misconceptions: Misconception[];
  transferProbes: TransferProbe[];
  fallbackQuestions: FallbackQuestion[];
  acceptableSimplifications: string[];
  referenceSummary: string;         // report reference tab ONLY. Never in teach-back context.
}
export interface Objective { id: string; statement: string; requiredNodeIds: string[]; requiredEdgeIds: string[]; }
export interface ConceptNode { id: string; name: string; aliases: string[]; definition: string; importance: "core" | "supporting"; }
export interface ConceptEdge { id: string; from: string; relation: string; to: string; explanation: string; }
export interface Misconception { id: string; statement: string; detectionHints: string[]; counterQuestion: string; explanation: string; }
export interface TransferProbe { id: string; question: string; expectedReasoning: string; targetEdgeIds: string[]; }
export interface FallbackQuestion { id: string; trigger: string; question: string; }

// ---------- Session ----------
export type SessionPhase = "setup" | "listening" | "questioning" | "repair"
  | "transfer" | "teachback" | "report" | "complete";
export interface Session {
  id: string; packId: string; mode: "teacher" | "student";
  phase: SessionPhase; createdAt: number;
  questionCount: number;                       // budget: max 5 substantive
  hintLevelByNode: Record<string, 0 | 1 | 2>;  // simplified hint ladder
}
export interface TranscriptSegment {
  id: string; sessionId: string; speaker: "user" | "novice"; text: string; tMs: number;
}

// ---------- Claims & findings ----------
export type ClaimStatus = "observed" | "verified" | "contradicted" | "uncertain" | "superseded";
export interface AtomicClaim {
  id: string; sessionId: string; statement: string; originalText: string;
  segmentIds: string[]; nodeIds: string[]; status: ClaimStatus;
  misconceptionId?: string; supersedesClaimId?: string; createdAtMs: number;
}
export type FindingType = "factual_contradiction" | "material_omission" | "undefined_term"
  | "causal_leap" | "broken_analogy" | "visual_ambiguity" | "transfer_failure";
export interface Finding {
  id: string; sessionId: string; type: FindingType;
  severity: "critical" | "major" | "moderate" | "minor";
  confidence: "verified" | "likely" | "uncertain";
  title: string; explanation: string;
  claimIds: string[]; segmentIds: string[]; nodeIds: string[];
  sourceRef?: string;                // e.g. "pack:earth-seasons@1.0 edge:tilt-causes-angle"
  reviewStatus: "not_required" | "queued" | "approved" | "corrected";
}

// ---------- Learner & mastery ----------
export interface LearnerBelief {
  id: string; sessionId: string; statement: string;
  supportingClaimIds: string[]; nodeIds: string[];
  status: "believed" | "tentative" | "revised"; ambiguityNote?: string;
}
export type ConceptState = "unvisited" | "established" | "assisted" | "fragile"
  | "misconceived" | "missing" | "assumed" | "out_of_scope";
export interface AssumptionDebtItem {
  term: string; firstUsedMs: number; laterExplained: boolean; note: string;
}

// ---------- Orchestration ----------
export interface Directive {
  id: string; kind: "ask" | "hint" | "transfer" | "teachback" | "close";
  utteranceInstruction: string;      // what the novice should say, as an instruction
  reason: string;                    // recorded diagnostic purpose (shown in agent panel)
  targetNodeIds: string[]; hintLevel?: 0 | 1 | 2;
}
export type AgentName = "claim_mapper" | "verifier" | "coverage" | "pedagogy"
  | "visual" | "learner_model" | "teachback" | "report";
export interface AgentEvent {
  id: string; sessionId: string; agent: AgentName; message: string;
  tMs: number; payload?: unknown;
}
export interface VisualArtifact {
  id: string; sessionId: string; tMs: number; labels: string[];
  relations: { from: string; type: string; to: string; confidence: number }[];
  ambiguities: string[]; imageDataUrl?: string;
}

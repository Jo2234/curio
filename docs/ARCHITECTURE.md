# Architecture Lock — frozen decisions and contracts

This file is copied into the repo as `docs/ARCHITECTURE.md` by T00. Every codex brief says "read this first." Nothing here is up for debate during the build.

## 1. Stack (locked)

- **One app:** Next.js 15, App Router, TypeScript, Tailwind. `npx create-next-app@latest feynman --ts --tailwind --app --no-src-dir`. Node 22, npm.
- **No database.** In-memory session store in a module singleton (`lib/store.ts`) + JSON snapshot written to `data/sessions/<id>.json` on every mutation (crash recovery + debugging). Single `next dev` process. This is fine for a demo; do not add Postgres/Redis/queues.
- **Voice:** OpenAI Realtime API over WebRTC. Model env `REALTIME_MODEL` (default `gpt-realtime`). Ephemeral token minted server-side at `/api/realtime/token`. Server VAD on, plus a push-to-talk toggle that switches turn detection off and commits audio manually (noisy venue).
- **Reasoning agents (claim mapper, verifier, coverage, pedagogy, learner model, teach-back, visual, compiler, report):** Anthropic Messages API, model env `REASONING_MODEL` (default `claude-sonnet-5`). All calls go through one helper `lib/llm.ts` that forces JSON via a single `tool` with an input schema and `tool_choice: {type:"tool"}`. Escape hatch: `REASONING_PROVIDER=openai` swaps to OpenAI structured outputs — implement the switch in `llm.ts` only.
- **Server→client updates:** one SSE stream per session (`/api/sessions/[id]/events`). No websockets, no polling loops.
- **Client→novice steering:** the server never talks to the Realtime session directly. Directives arrive on the client via SSE; the client injects them into the WebRTC data channel as `response.create` with `instructions`. Persona is set once at session start via `session.update`.

## 2. Repo layout and file ownership

```
feynman/
  docs/ARCHITECTURE.md          (T00, frozen)
  packs/earth-seasons.json      (T00 copies from build pack)
  packs/seasons-syllabus-excerpt.md
  data/sessions/                (gitignored, runtime)
  lib/
    types.ts                    (T00, FROZEN after Wave 0 — changes need orchestrator sign-off)
    store.ts                    (T00 skeleton; T02 may extend mutators)
    packs.ts                    (T00)
    llm.ts                      (T02)
    agents/claimMapper.ts       (T02)
    agents/verifier.ts          (T02)
    agents/coverage.ts          (T02)
    agents/pedagogy.ts          (T04)
    agents/learnerModel.ts      (T05)
    agents/teachback.ts         (T05)
    agents/visual.ts            (T06)
    agents/reportComposer.ts    (T07)
    agents/compiler.ts          (T08)
  app/
    page.tsx                    (T09; T00 stub)
    setup/page.tsx              (T09; T00 stub)
    session/[id]/page.tsx       (T03)
    report/[id]/page.tsx        (T07)
    review/page.tsx             (T07)
    compiler/page.tsx           (T08)
    api/sessions/route.ts               (T00)   POST create session
    api/sessions/[id]/events/route.ts   (T00)   GET SSE stream
    api/sessions/[id]/transcript/route.ts (T01) POST final segments
    api/sessions/[id]/board/route.ts    (T06)   POST board image
    api/sessions/[id]/advance/route.ts  (T04)   POST phase transitions
    api/realtime/token/route.ts         (T01)
    api/compiler/route.ts               (T08)
  components/
    TranscriptPanel.tsx, AgentPanel.tsx, ClaimLedger.tsx,
    ConceptMap.tsx, SessionControls.tsx        (T03)
    VoiceClient.tsx (WebRTC + data channel)    (T01)
    BoardCapture.tsx                           (T06)
    ReportView.tsx, LearnerVsReference.tsx     (T07)
```

## 3. `lib/types.ts` — the frozen contract

T00 writes this file exactly as below (plus imports/exports as needed). Later tasks import from it and never redefine shapes.

```ts
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
```

## 4. `lib/store.ts` — event bus + state

- Module-level `Map<string, SessionState>` where `SessionState` bundles: `session`, `segments[]`, `claims[]`, `findings[]`, `beliefs[]`, `conceptStates: Record<nodeId, ConceptState>`, `assumptionDebt[]`, `agentEvents[]`, `directives[]`, `visuals[]`.
- Mutator functions (`addSegment`, `upsertClaim`, `addFinding`, `setConceptState`, `addBelief`, `pushDirective`, `emitAgentEvent`, `setPhase`) each: mutate, snapshot to `data/sessions/<id>.json`, and notify SSE subscribers.
- SSE message envelope: `{ type: "segment"|"claim"|"finding"|"concept_state"|"belief"|"directive"|"agent_event"|"phase", data: ... }`.
- `subscribe(sessionId, send)` / `unsubscribe` for the SSE route. On subscribe, replay current state as a `snapshot` message first.

## 5. Pipeline (the live loop)

```
Realtime transcription (client) ── POST /transcript ──► store.addSegment
  └─► pipeline tick (debounced ~6s or every 2 user segments):
        claimMapper(newSegments, pack)        → upsertClaim*, agent_event
        verifier(newClaims, pack)             → claim status, Finding*, agent_event
        coverage(allClaims, pack)             → conceptStates, assumptionDebt, agent_event
        pedagogy(state, pack)                 → Directive (or null), agent_event
  Directive ── SSE ──► client ── data channel ──► novice speaks
```

- Pipeline runs server-side, fire-and-forget from the transcript POST handler (do not block the response). Guard with a per-session `isProcessing` flag; if busy, mark dirty and re-run once.
- **Deterministic guarantee:** verifier first does a cheap string/regex pass with each misconception's `detectionHints` before the LLM call; a hit immediately creates the contradicted claim + finding and pedagogy uses the pack's `counterQuestion` verbatim. The LLM pass adds the rest. This makes the demo's planted-error catch reliable even if the model is slow.
- Phase machine (server, in pedagogy): `listening` (min 60s / min 4 user segments, no substantive questions) → `questioning` → `repair` (when a misconception finding exists) → `transfer` (after repair confirmed or question budget ≥3 used) → `teachback` (user presses Finish or budget exhausted) → `report`.

## 6. Teach-back isolation (non-negotiable)

`agents/teachback.ts` builds its LLM context from ONLY: `beliefs[]`, `pack.prerequisites` (ids + names), and unresolved `ambiguityNote`s. It must not receive `pack.nodes/edges/referenceSummary`, findings, or claims. System prompt instructs: "You are a novice reconstructing what you were taught. Use only the beliefs listed. Preserve errors and gaps; name your uncertainties." Output: `{ script: string, beliefGraphNodeIds: string[], uncertainties: string[] }`. The client sends `script` to the Realtime novice to speak.

## 7. Env (`.env.local`, `.env.example` in repo)

```
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
REALTIME_MODEL=gpt-realtime
REASONING_MODEL=claude-sonnet-5
REASONING_PROVIDER=anthropic   # or openai
```

## 8. UI notes (keep it calm, per spec §33.3)

- Live room: left = novice presence + transcript; right = collapsible "Presentation mode" panel with AgentPanel (scrolling agent events with agent name chips), ClaimLedger, ConceptMap (nodes as pills colored+iconed by ConceptState — color-independent icons too).
- Controls: Push-to-talk toggle, Capture board, Hint, Finish & teach-back.
- Dark, focused visual style; one accent color; no clutter. Judges see this for ~90 seconds — the agent panel and the concept-state flips are the star.
- Report page sections in order: Learner reconstruction (tab 1) vs Verified reference (tab 2), coverage map, findings (click → transcript excerpt inline), assumption debt table, hint dependency, "1 finding queued for expert review" link to /review.

"use client";

import { useEffect, useReducer } from "react";

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
} from "@/lib/types";

export interface SessionStreamState {
  segments: TranscriptSegment[];
  claims: AtomicClaim[];
  findings: Finding[];
  conceptStates: Record<string, ConceptState>;
  beliefs: LearnerBelief[];
  agentEvents: AgentEvent[];
  directives: Directive[];
  phase: SessionPhase;
  assumptionDebt: AssumptionDebtItem[];
}

interface StreamSnapshot extends SessionStreamState {
  session: Session;
}

type StreamEvent =
  | { type: "snapshot"; data: StreamSnapshot }
  | { type: "segment"; data: TranscriptSegment }
  | { type: "claim"; data: AtomicClaim }
  | { type: "finding"; data: Finding }
  | { type: "concept_state"; data: { nodeId: string; state: ConceptState } }
  | { type: "belief"; data: LearnerBelief }
  | { type: "teachback_result"; data: unknown }
  | { type: "directive"; data: Directive }
  | { type: "agent_event"; data: AgentEvent }
  | { type: "assumption_debt"; data: AssumptionDebtItem }
  | { type: "phase"; data: SessionPhase };

const streamEventTypes = new Set<StreamEvent["type"]>([
  "snapshot",
  "segment",
  "claim",
  "finding",
  "concept_state",
  "belief",
  "teachback_result",
  "directive",
  "agent_event",
  "assumption_debt",
  "phase",
]);

const initialState: SessionStreamState = {
  segments: [],
  claims: [],
  findings: [],
  conceptStates: {},
  beliefs: [],
  agentEvents: [],
  directives: [],
  phase: "setup",
  assumptionDebt: [],
};

function appendUnique<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id) ? items : [...items, next];
}

function upsert<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

function reducer(state: SessionStreamState, event: StreamEvent): SessionStreamState {
  switch (event.type) {
    case "snapshot": {
      const { session, ...snapshot } = event.data;
      return { ...snapshot, phase: session.phase };
    }
    case "segment":
      return { ...state, segments: appendUnique(state.segments, event.data) };
    case "claim":
      return { ...state, claims: upsert(state.claims, event.data) };
    case "finding":
      return { ...state, findings: appendUnique(state.findings, event.data) };
    case "concept_state":
      return { ...state, conceptStates: { ...state.conceptStates, [event.data.nodeId]: event.data.state } };
    case "belief":
      return { ...state, beliefs: upsert(state.beliefs, event.data) };
    case "teachback_result":
      return state;
    case "directive":
      return { ...state, directives: appendUnique(state.directives, event.data) };
    case "agent_event":
      return { ...state, agentEvents: appendUnique(state.agentEvents, event.data) };
    case "assumption_debt": {
      const index = state.assumptionDebt.findIndex((item) =>
        item.term.toLocaleLowerCase() === event.data.term.toLocaleLowerCase());
      if (index === -1) return { ...state, assumptionDebt: [...state.assumptionDebt, event.data] };
      const assumptionDebt = [...state.assumptionDebt];
      assumptionDebt[index] = event.data;
      return { ...state, assumptionDebt };
    }
    case "phase":
      return { ...state, phase: event.data };
    default:
      return state;
  }
}

function isStreamEvent(value: unknown): value is StreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; data?: unknown };
  return typeof candidate.type === "string" &&
    streamEventTypes.has(candidate.type as StreamEvent["type"]) &&
    "data" in candidate;
}

export function useSessionStream(sessionId: string): SessionStreamState {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let retry = 0;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
      source.onopen = () => { retry = 0; };
      source.onmessage = (message) => {
        try {
          const event: unknown = JSON.parse(message.data);
          if (isStreamEvent(event)) dispatch(event);
        } catch {
          // A malformed message should not take the live room down.
        }
      };
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        const delay = Math.min(1_000 * 2 ** retry, 15_000);
        retry += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [sessionId]);

  return state;
}

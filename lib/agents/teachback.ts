import { nanoid } from "nanoid";

import { deepJsonCall, jsonCall } from "../llm";
import { loadPack } from "../packs";
import {
  emitAgentEvent,
  getSessionState,
  setTeachbackResult,
  upsertBelief,
} from "../store";
import type { ConceptPack, Directive, LearnerBelief } from "../types";

interface TeachbackOutput {
  script: string;
  usedBeliefIds: string[];
  uncertainties: string[];
}

interface CorrectionOutput {
  revisions: {
    beliefId: string;
    statement: string;
    ambiguityNote: string | null;
  }[];
}

const teachbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["script", "usedBeliefIds", "uncertainties"],
  properties: {
    script: { type: "string" },
    usedBeliefIds: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

const correctionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["revisions"],
  properties: {
    revisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beliefId", "statement", "ambiguityNote"],
        properties: {
          beliefId: { type: "string" },
          statement: { type: "string" },
          ambiguityNote: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const teachbackSystem = `You are a novice who was just taught this topic. Reconstruct your understanding in first person, ~150–220 spoken words: what you now understand, the causal chain as YOU received it, and honestly name what still feels unclear (use the tentative beliefs and ambiguity notes). Preserve any errors in your beliefs — you don't know they're errors. Do not add facts beyond the beliefs. End by inviting correction: 'Did I get that right?'
The prerequisite names are only labels for assumed prior knowledge; do not invent explanations for them. Include in usedBeliefIds every belief id you actually use, and only those ids.`;

function forbiddenTeachbackStrings(pack: ConceptPack): string[] {
  return [
    pack.referenceSummary,
    ...pack.edges.map((edge) => edge.explanation),
    ...pack.misconceptions.map((misconception) => misconception.explanation),
  ].map((value) => value.trim()).filter(Boolean);
}

/** Runtime guard used immediately before the generation call and directly by the negative smoke test. */
export function assertTeachbackContextIsolation(pack: ConceptPack, serializedPrompt: string): void {
  for (const forbidden of forbiddenTeachbackStrings(pack)) {
    const jsonEscaped = JSON.stringify(forbidden).slice(1, -1);
    if (serializedPrompt.includes(forbidden) || serializedPrompt.includes(jsonEscaped)) {
      throw new Error("Teach-back isolation violation: forbidden reference knowledge entered the generation context");
    }
  }
}

function uniqueValidIds(ids: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
}

function buildAllowedContext(pack: ConceptPack, beliefs: LearnerBelief[]): string {
  const prerequisiteNames = pack.prerequisites.flatMap((nodeId) => {
    const name = pack.nodes.find((node) => node.id === nodeId)?.name;
    return name ? [name] : [];
  });
  return JSON.stringify({
    title: pack.title,
    prerequisites: prerequisiteNames,
    beliefs: beliefs.map((belief) => ({
      id: belief.id,
      statement: belief.statement,
      status: belief.status,
      ambiguityNote: belief.ambiguityNote ?? null,
    })),
  });
}

/** Generate a reconstruction from the learner model and physically isolated metadata only. */
export async function generate(sessionId: string): Promise<Directive> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  if (state.beliefs.length === 0) throw new Error("Cannot generate a teach-back without learner beliefs");
  const pack = loadPack(state.session.packId);
  const user = buildAllowedContext(pack, state.beliefs);
  const serializedPrompt = `${teachbackSystem}\n${user}`;
  assertTeachbackContextIsolation(pack, serializedPrompt);

  const output = await deepJsonCall<TeachbackOutput>({
    system: teachbackSystem,
    user,
    schema: teachbackSchema,
    maxTokens: 700,
  });
  const script = typeof output.script === "string" ? output.script.trim() : "";
  if (!script) throw new Error("Teach-back generation returned an empty script");
  const beliefIds = new Set(state.beliefs.map((belief) => belief.id));
  const usedBeliefIds = uniqueValidIds(output.usedBeliefIds, beliefIds);
  if (usedBeliefIds.length === 0) {
    throw new Error("Teach-back generation returned no valid belief provenance");
  }
  const uncertainties = Array.isArray(output.uncertainties)
    ? [...new Set(output.uncertainties.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))]
    : [];
  const result = { script, usedBeliefIds, uncertainties };
  setTeachbackResult(sessionId, result);

  const usedBeliefs = state.beliefs.filter((belief) => usedBeliefIds.includes(belief.id));
  const targetNodeIds = [...new Set(usedBeliefs.flatMap((belief) => belief.nodeIds))];
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "teachback",
    message: `Reconstruction generated from ${usedBeliefIds.length} beliefs, ${uncertainties.length} uncertainties preserved`,
    tMs: Date.now(),
    payload: { usedBeliefIds },
  });

  return {
    id: nanoid(),
    kind: "teachback",
    utteranceInstruction: script,
    reason: "Reverse teach-back generated exclusively from the learner model",
    targetNodeIds,
  };
}

/** Apply a user's post-teach-back correction to only the beliefs it addresses. */
export async function applyCorrection(sessionId: string, correctionText: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const correction = correctionText.trim();
  if (!correction) throw new Error("Correction text is required");

  const output = await jsonCall<CorrectionOutput>({
    system: `Match a user's correction to the learner beliefs it directly changes. Rewrite only those beliefs to reflect the correction. Do not add outside knowledge. Return no revision for unrelated beliefs.`,
    user: JSON.stringify({
      beliefs: state.beliefs.map((belief) => ({
        id: belief.id,
        statement: belief.statement,
        status: belief.status,
        ambiguityNote: belief.ambiguityNote ?? null,
      })),
      correction,
    }),
    schema: correctionSchema,
    maxTokens: 500,
  });

  const beliefById = new Map(state.beliefs.map((belief) => [belief.id, belief]));
  const revisedIds = new Set<string>();
  for (const revision of Array.isArray(output.revisions) ? output.revisions : []) {
    const belief = beliefById.get(revision?.beliefId);
    if (!belief || typeof revision.statement !== "string" || !revision.statement.trim()) continue;
    const ambiguityNote = typeof revision.ambiguityNote === "string" && revision.ambiguityNote.trim()
      ? revision.ambiguityNote.trim()
      : undefined;
    upsertBelief(sessionId, {
      ...belief,
      statement: revision.statement.trim(),
      status: "revised",
      ...(ambiguityNote ? { ambiguityNote } : { ambiguityNote: undefined }),
    });
    revisedIds.add(belief.id);
  }

  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "learner_model",
    message: `Post-teach-back correction revised ${revisedIds.size} belief${revisedIds.size === 1 ? "" : "s"}`,
    tMs: Date.now(),
    payload: { beliefIds: [...revisedIds] },
  });
}

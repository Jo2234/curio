import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import { emitAgentEvent, getSessionState, upsertBelief } from "../store";
import type { LearnerBelief } from "../types";

interface BeliefDraft {
  id: string;
  statement: string;
  supportingClaimIds: string[];
  nodeIds: string[];
  status: LearnerBelief["status"];
  ambiguityNote: string | null;
}

interface LearnerModelOutput {
  beliefs: BeliefDraft[];
}

const beliefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beliefs"],
  properties: {
    beliefs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "statement", "supportingClaimIds", "nodeIds", "status", "ambiguityNote"],
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          supportingClaimIds: { type: "array", items: { type: "string" } },
          nodeIds: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["believed", "tentative", "revised"] },
          ambiguityNote: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const learnerSystem = `You maintain Curio's learner model: what a diligent AI novice would actually believe from this session alone.
Model what was SAID, not what is objectively correct. A contradicted claim is still something the novice believes unless a later claim repairs it; the novice cannot see evaluator status and must not silently correct it.
When a later claim supersedes an earlier one, revise the matching belief: update its statement and set status to "revised".
Turn clear statements into "believed" beliefs. Turn vague, incomplete, or hedged statements into "tentative" beliefs and give a concise ambiguityNote explaining what remains unclear.
You may make only small, reasonable connecting inferences. Never import outside facts, definitions, corrections, numbers, or causal links.
Return the complete current belief list, not merely changes. Preserve existing belief ids. For a genuinely new belief, use id "new". Every belief must cite the claim ids that support it and only node ids present in its supporting claims.`;

function uniqueStrings(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && (!allowed || allowed.has(item))))];
}

/** Update the novice's beliefs from claims without importing reference knowledge. */
export async function updateBeliefs(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(state.session.packId);
  const representedClaimIds = new Set(state.beliefs.flatMap((belief) => belief.supportingClaimIds));
  const newClaims = state.claims.filter((claim) =>
    !representedClaimIds.has(claim.id) || claim.status === "superseded");
  const prerequisiteNames = pack.prerequisites.flatMap((nodeId) => {
    const name = pack.nodes.find((node) => node.id === nodeId)?.name;
    return name ? [name] : [];
  });

  const output = await jsonCall<LearnerModelOutput>({
    system: learnerSystem,
    user: JSON.stringify({
      currentBeliefs: state.beliefs.map((belief) => ({
        id: belief.id,
        statement: belief.statement,
        supportingClaimIds: belief.supportingClaimIds,
        nodeIds: belief.nodeIds,
        status: belief.status,
        ambiguityNote: belief.ambiguityNote ?? null,
      })),
      newClaims: newClaims.map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        status: claim.status,
        nodeIds: claim.nodeIds,
        supersedesClaimId: claim.supersedesClaimId ?? null,
      })),
      declaredPrerequisites: prerequisiteNames,
    }),
    schema: beliefSchema,
    maxTokens: 1_500,
  });

  const currentIds = new Set(state.beliefs.map((belief) => belief.id));
  const validClaimIds = new Set(state.claims.map((claim) => claim.id));
  const validNodeIds = new Set(state.claims.flatMap((claim) => claim.nodeIds));
  const usedIds = new Set<string>();

  for (const draft of Array.isArray(output.beliefs) ? output.beliefs : []) {
    if (!draft || typeof draft.statement !== "string" || !draft.statement.trim()) continue;
    let id = typeof draft.id === "string" && currentIds.has(draft.id) ? draft.id : nanoid();
    while (usedIds.has(id)) id = nanoid();
    usedIds.add(id);
    const ambiguityNote = typeof draft.ambiguityNote === "string" && draft.ambiguityNote.trim()
      ? draft.ambiguityNote.trim()
      : undefined;
    const status: LearnerBelief["status"] = ["believed", "tentative", "revised"].includes(draft.status)
      ? draft.status
      : "tentative";
    upsertBelief(sessionId, {
      id,
      sessionId,
      statement: draft.statement.trim(),
      supportingClaimIds: uniqueStrings(draft.supportingClaimIds, validClaimIds),
      nodeIds: uniqueStrings(draft.nodeIds, validNodeIds),
      status,
      ...(ambiguityNote ? { ambiguityNote } : {}),
    });
  }

  const freshBeliefs = getSessionState(sessionId)?.beliefs ?? [];
  const tentative = freshBeliefs.filter((belief) => belief.status === "tentative").length;
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "learner_model",
    message: `Learner now holds ${freshBeliefs.length} beliefs (${tentative} tentative)`,
    tMs: Date.now(),
    payload: { beliefIds: freshBeliefs.map((belief) => belief.id) },
  });
}

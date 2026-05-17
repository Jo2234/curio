import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import { emitAgentEvent, getSessionState, replaceBeliefs } from "../store";
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
async function rebuildBeliefs(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  if (state.beliefRevision === state.evidenceRevision) return;
  const revision = state.evidenceRevision;
  const claims = [...state.claims];
  if (claims.length === 0) {
    replaceBeliefs(sessionId, [], revision);
    return;
  }
  const pack = loadPack(state.session.packId);
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
      claims: claims.map((claim) => ({
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
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const validClaimIds = new Set(claimById.keys());
  const beliefs: LearnerBelief[] = [];
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
    const supportingClaimIds = uniqueStrings(draft.supportingClaimIds, validClaimIds);
    if (supportingClaimIds.length === 0) continue;
    const validNodeIds = new Set(supportingClaimIds.flatMap((id) => claimById.get(id)!.nodeIds));
    beliefs.push({
      id,
      sessionId,
      statement: draft.statement.trim(),
      supportingClaimIds,
      nodeIds: uniqueStrings(draft.nodeIds, validNodeIds),
      status,
      ...(ambiguityNote ? { ambiguityNote } : {}),
    });
  }

  if (beliefs.length === 0) throw new Error("Learner reconstruction returned no supported beliefs.");
  replaceBeliefs(sessionId, beliefs, revision);
  const freshBeliefs = beliefs;
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

const updates = new Map<string, Promise<void>>();

/** Reconstruct on demand, once per evidence revision, including any concurrent correction. */
export function updateBeliefs(sessionId: string): Promise<void> {
  const existing = updates.get(sessionId);
  if (existing) return existing;
  const update = Promise.resolve().then(async () => {
    do {
      await rebuildBeliefs(sessionId);
      const state = getSessionState(sessionId);
      if (!state || state.beliefRevision === state.evidenceRevision) return;
    } while (true);
  }).finally(() => updates.delete(sessionId));
  updates.set(sessionId, update);
  return update;
}

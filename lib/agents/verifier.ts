import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import { addFinding, emitAgentEvent, getSessionState, upsertClaim } from "../store";
import type { AtomicClaim, ConceptPack } from "../types";

interface VerificationResult {
  claimId: string;
  status: "verified" | "uncertain" | "contradicted";
  explanation: string;
  sourceRef: string;
  misconceptionId: string | null;
  repairedClaimIds: string[];
}

interface VerifierOutput {
  results: VerificationResult[];
}

const verificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimId", "status", "explanation", "sourceRef", "misconceptionId", "repairedClaimIds"],
        properties: {
          claimId: { type: "string" },
          status: { type: "string", enum: ["verified", "uncertain", "contradicted"] },
          explanation: { type: "string" },
          sourceRef: { type: "string" },
          misconceptionId: { type: ["string", "null"] },
          repairedClaimIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function verifierSystem(pack: ConceptPack): string {
  return [
    "You are Curio's evidence verifier. Classify every supplied claim exactly once.",
    "verified means directly supported by a concept node or edge. uncertain means the pack does not cover it or the wording is genuinely unclear.",
    "contradicted means it conflicts with the pack. Cite sourceRef as pack:<id>@<version> node:<id>, edge:<id>, or mc:<id>.",
    "Keyword matches are only candidates: a negation, quotation, question, or refutation of a misconception is NOT an assertion of that misconception. Judge what the speaker actually endorses.",
    "For a contradicted claim, set misconceptionId only if it actually asserts a listed misconception; otherwise null. For all other statuses use null.",
    "For a verified claim, repairedClaimIds may list earlier contradictions that this statement explicitly corrects. Shared topic words alone are not a repair. An earlier contradiction may be in earlierContradictions or earlier in the supplied transcript, including this batch. Use only supplied claim ids; otherwise use [].",
    "Every acceptable simplification listed below is verified, never contradicted.",
    `Pack id/version: ${pack.id}@${pack.version}`,
    `Nodes: ${JSON.stringify(pack.nodes.map(({ id, name, definition }) => ({ id, name, definition })))}`,
    `Edges: ${JSON.stringify(pack.edges)}`,
    `Misconceptions: ${JSON.stringify(pack.misconceptions)}`,
    `Acceptable simplifications: ${JSON.stringify(pack.acceptableSimplifications)}`,
  ].join("\n");
}

function hasPackCitation(sourceRef: string, pack: ConceptPack): boolean {
  const prefix = `pack:${pack.id}@${pack.version} `;
  if (!sourceRef.startsWith(prefix)) return false;
  const [kind, id] = sourceRef.slice(prefix.length).split(":");
  const items = kind === "node" ? pack.nodes : kind === "edge" ? pack.edges : kind === "mc" ? pack.misconceptions : [];
  return items.some((item) => item.id === id);
}

export async function verifyNewClaims(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(state.session.packId);
  const userSegmentIds = new Set(state.segments.filter((segment) => segment.speaker === "user").map((segment) => segment.id));
  const claims = state.claims.filter((claim) => claim.status === "observed" && claim.segmentIds.some((id) => userSegmentIds.has(id)));
  if (claims.length === 0) return;
  const previousContradictions = state.claims.filter((claim) => claim.status === "contradicted");
  const evidenceSegmentIds = new Set([...previousContradictions, ...claims].flatMap((claim) => claim.segmentIds));
  let output: VerifierOutput;
  try {
    output = await jsonCall<VerifierOutput>({
      system: verifierSystem(pack),
      user: JSON.stringify({
        claims: claims.map(({ id, statement, originalText, nodeIds, segmentIds }) => ({ id, statement, originalText, nodeIds, segmentIds })),
        transcript: state.segments.filter((segment) => evidenceSegmentIds.has(segment.id)).map(({ id, text }) => ({ id, text })),
        earlierContradictions: previousContradictions.map(({ id, statement, originalText }) => ({ id, statement, originalText })),
      }),
      schema: verificationSchema,
      maxTokens: 2_000,
    });
  } catch (error) {
    emitAgentEvent(sessionId, {
      id: nanoid(), sessionId, agent: "verifier",
      message: `Verification deferred for ${claims.length} claims; no keyword match has been treated as proof`,
      tMs: Date.now(),
    });
    throw new Error("Claim verification is unavailable. Try again before finishing the lesson.", { cause: error });
  }

  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const repairCandidates = new Set([...previousContradictions, ...claims].map((claim) => claim.id));
  const repairResults: VerificationResult[] = [];
  const seen = new Set<string>();
  for (const result of Array.isArray(output.results) ? output.results : []) {
    const claim = claimById.get(result.claimId);
    if (!claim || seen.has(claim.id) || !["verified", "uncertain", "contradicted"].includes(result.status)) continue;
    seen.add(claim.id);
    const status = typeof result.sourceRef === "string" && hasPackCitation(result.sourceRef, pack) ? result.status : "uncertain";
    const explanation = status !== result.status
      ? "The verifier did not provide a valid reference to this pack. The claim needs review."
      : result.explanation;
    const misconception = status === "contradicted"
      ? pack.misconceptions.find((item) => item.id === result.misconceptionId)
      : undefined;
    const updated: AtomicClaim = {
      ...claim, status,
      ...(misconception ? { misconceptionId: misconception.id } : {}),
    };
    upsertClaim(sessionId, updated);
    if (status === "verified") repairResults.push(result);
    if (status === "contradicted") {
      addFinding(sessionId, {
        id: nanoid(), sessionId, type: "factual_contradiction", severity: "major", confidence: "likely",
        title: misconception?.statement ?? "Claim conflicts with the concept pack",
        explanation,
        claimIds: [claim.id], segmentIds: claim.segmentIds, nodeIds: updated.nodeIds,
        sourceRef: misconception ? `pack:${pack.id}@${pack.version} mc:${misconception.id}` : result.sourceRef,
        reviewStatus: "not_required",
      });
    } else if (status === "uncertain") {
      addFinding(sessionId, {
        id: nanoid(), sessionId, type: "causal_leap", severity: "moderate", confidence: "uncertain",
        title: "Claim needs expert review", explanation: explanation || "The explanation supports this, but does not settle it.",
        claimIds: [claim.id], segmentIds: claim.segmentIds, nodeIds: claim.nodeIds,
        ...(result.sourceRef ? { sourceRef: result.sourceRef } : {}), reviewStatus: "queued",
      });
    }
  }
  // Classify the entire batch before applying repairs: provider result order
  // must not determine whether a correction can resolve an earlier assertion.
  const segmentOrder = new Map(state.segments.map((segment, index) => [segment.id, index]));
  const isEarlier = (earlier: AtomicClaim, later: AtomicClaim): boolean => {
    const earlierIndex = Math.max(...earlier.segmentIds.map((id) => segmentOrder.get(id) ?? Infinity));
    const laterIndex = Math.min(...later.segmentIds.map((id) => segmentOrder.get(id) ?? -1));
    if (earlierIndex !== laterIndex) return earlierIndex < laterIndex;
    const text = state.segments[earlierIndex]?.text;
    if (!text || !earlier.originalText || !later.originalText) return false;
    const before = text.indexOf(earlier.originalText);
    const after = text.indexOf(later.originalText);
    return before >= 0 && after >= before + earlier.originalText.length &&
      before === text.lastIndexOf(earlier.originalText) && after === text.lastIndexOf(later.originalText);
  };
  for (const result of repairResults) {
    const claim = state.claims.find((item) => item.id === result.claimId)!;
    const repairs = Array.isArray(result.repairedClaimIds)
      ? [...new Set(result.repairedClaimIds)].flatMap((id) => {
          const earlier = state.claims.find((item) => item.id === id);
          return repairCandidates.has(id) && earlier?.status === "contradicted" && isEarlier(earlier, claim) ? [earlier] : [];
        })
      : [];
    if (!repairs.length) continue;
    upsertClaim(sessionId, {
      ...claim, supersedesClaimId: repairs[0].id,
      nodeIds: [...new Set([...claim.nodeIds, ...repairs.flatMap((repair) => repair.nodeIds)])],
    });
    for (const earlier of repairs) upsertClaim(sessionId, { ...earlier, status: "superseded" });
  }
  emitAgentEvent(sessionId, {
    id: nanoid(), sessionId, agent: "verifier",
    message: `Semantically verified ${seen.size} claims against the concept pack`, tMs: Date.now(),
    payload: { claimIds: [...seen] },
  });
  if (seen.size !== claims.length) throw new Error("Some claims were not verified. Try again before finishing the lesson.");
}

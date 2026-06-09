import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import { addFinding, emitAgentEvent, getSessionState, upsertClaim, upsertFinding } from "../store";
import type { AtomicClaim, ConceptPack, Finding, Misconception } from "../types";

interface VerificationResult {
  claimId: string;
  status: "verified" | "uncertain" | "contradicted";
  explanation: string;
  sourceRef: string;
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
        required: ["claimId", "status", "explanation", "sourceRef"],
        properties: {
          claimId: { type: "string" },
          status: { type: "string", enum: ["verified", "uncertain", "contradicted"] },
          explanation: { type: "string" },
          sourceRef: { type: "string" },
        },
      },
    },
  },
} as const;

function userDerived(claim: AtomicClaim, userSegmentIds: Set<string>): boolean {
  return claim.segmentIds.some((id) => userSegmentIds.has(id));
}

function hintHit(text: string, misconception: Misconception): boolean {
  const lower = text.toLocaleLowerCase();
  return misconception.detectionHints.some((hint) => lower.includes(hint.toLocaleLowerCase()));
}

function mappedNodes(text: string, pack: ConceptPack): string[] {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const lower = normalize(text);
  return pack.nodes
    .filter((node) => [node.name, ...node.aliases].some((name) => lower.includes(normalize(name))))
    .map((node) => node.id);
}

function deterministicPass(sessionId: string, pack: ConceptPack): void {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const userSegments = state.segments.filter((segment) => segment.speaker === "user");
  const userSegmentIds = new Set(userSegments.map((segment) => segment.id));
  const recentSegments = userSegments.slice(-12);

  for (const misconception of pack.misconceptions) {
    const hitSegments = recentSegments.filter((segment) => hintHit(segment.text, misconception));
    const directClaims = state.claims.filter((claim) =>
      ["observed", "uncertain"].includes(claim.status) &&
      userDerived(claim, userSegmentIds) &&
      hintHit(`${claim.statement}\n${claim.originalText}`, misconception));
    const linkedClaims = state.claims.filter((claim) =>
      ["observed", "uncertain"].includes(claim.status) &&
      userDerived(claim, userSegmentIds) &&
      claim.segmentIds.some((id) => hitSegments.some((segment) => segment.id === id)));
    const candidateClaims = directClaims.length > 0 ? directClaims : linkedClaims.slice(0, 1);

    if (hitSegments.length === 0 && candidateClaims.length === 0) continue;

    let attachedClaims = candidateClaims;
    if (attachedClaims.length === 0 && hitSegments.length > 0) {
      const alreadyDetected = state.claims.some((claim) =>
        claim.misconceptionId === misconception.id &&
        claim.segmentIds.some((id) => hitSegments.some((segment) => segment.id === id)));
      if (alreadyDetected) continue;
      const segment = hitSegments[0];
      const claim: AtomicClaim = {
        id: nanoid(),
        sessionId,
        statement: segment.text,
        originalText: segment.text,
        segmentIds: [segment.id],
        nodeIds: mappedNodes(segment.text, pack),
        status: "observed",
        createdAtMs: segment.tMs,
      };
      upsertClaim(sessionId, claim);
      attachedClaims = [claim];
    }

    for (const claim of attachedClaims) {
      const inferredNodeIds = claim.nodeIds.length > 0
        ? claim.nodeIds
        : mappedNodes(`${claim.statement} ${misconception.statement} ${misconception.explanation}`, pack);
      claim.nodeIds = inferredNodeIds;
      upsertClaim(sessionId, { ...claim, nodeIds: inferredNodeIds, status: "contradicted", misconceptionId: misconception.id });
    }

    const freshState = getSessionState(sessionId);
    if (!freshState) throw new Error(`Unknown session: ${sessionId}`);
    const existingFinding = freshState.findings.find((finding) =>
      finding.sourceRef === `pack:${pack.id}@${pack.version} mc:${misconception.id}`);
    if (!existingFinding) {
      addFinding(sessionId, {
        id: nanoid(),
        sessionId,
        type: "factual_contradiction",
        severity: "major",
        confidence: "verified",
        title: misconception.statement,
        explanation: misconception.explanation,
        claimIds: attachedClaims.map((claim) => claim.id),
        segmentIds: [...new Set([...hitSegments.map((segment) => segment.id), ...attachedClaims.flatMap((claim) => claim.segmentIds)])],
        nodeIds: [...new Set(attachedClaims.flatMap((claim) => claim.nodeIds))],
        sourceRef: `pack:${pack.id}@${pack.version} mc:${misconception.id}`,
        reviewStatus: "not_required",
      });
    } else {
      upsertFinding(sessionId, {
        ...existingFinding,
        claimIds: [...new Set([...existingFinding.claimIds, ...attachedClaims.map((claim) => claim.id)])],
        segmentIds: [...new Set([...existingFinding.segmentIds, ...hitSegments.map((segment) => segment.id)])],
        nodeIds: [...new Set([...existingFinding.nodeIds, ...attachedClaims.flatMap((claim) => claim.nodeIds)])],
      });
    }
    emitAgentEvent(sessionId, {
      id: nanoid(),
      sessionId,
      agent: "verifier",
      message: `Contradiction detected: ${misconception.statement}`,
      tMs: Date.now(),
      payload: { misconceptionId: misconception.id },
    });
  }

}

function verifierSystem(pack: ConceptPack): string {
  return [
    "You are Curio's evidence verifier. Classify every supplied claim exactly once.",
    "verified means directly supported by a concept node or edge. uncertain means the pack does not cover it or the wording is genuinely unclear.",
    "contradicted means it conflicts with a node or edge. For contradicted results, sourceRef must cite that node or edge.",
    "Every acceptable simplification listed below is verified, never contradicted.",
    `Pack id/version: ${pack.id}@${pack.version}`,
    `Nodes: ${JSON.stringify(pack.nodes.map(({ id, name, definition }) => ({ id, name, definition })))}`,
    `Edges: ${JSON.stringify(pack.edges)}`,
    `Acceptable simplifications: ${JSON.stringify(pack.acceptableSimplifications)}`,
  ].join("\n");
}

function addLlmFinding(sessionId: string, claim: AtomicClaim, result: VerificationResult): void {
  const state = getSessionState(sessionId);
  if (!state || state.findings.some((finding) => finding.type === "factual_contradiction" && finding.claimIds.includes(claim.id))) return;
  addFinding(sessionId, {
    id: nanoid(),
    sessionId,
    type: "factual_contradiction",
    severity: "major",
    confidence: "likely",
    title: "Claim conflicts with the concept pack",
    explanation: result.explanation,
    claimIds: [claim.id],
    segmentIds: claim.segmentIds,
    nodeIds: claim.nodeIds,
    sourceRef: result.sourceRef,
    reviewStatus: "not_required",
  });
}

function queueFirstUncertainFinding(sessionId: string, claim: AtomicClaim, result: VerificationResult): void {
  const state = getSessionState(sessionId);
  if (!state || state.findings.some((finding) => finding.confidence === "uncertain" && finding.reviewStatus === "queued")) return;
  addFinding(sessionId, {
    id: nanoid(),
    sessionId,
    type: "causal_leap",
    severity: "moderate",
    confidence: "uncertain",
    title: "Claim needs expert review",
    explanation: result.explanation || "The explanation supports this, but does not settle it.",
    claimIds: [claim.id],
    segmentIds: claim.segmentIds,
    nodeIds: claim.nodeIds,
    ...(result.sourceRef ? { sourceRef: result.sourceRef } : {}),
    reviewStatus: "queued",
  });
}

export async function verifyNewClaims(sessionId: string): Promise<void> {
  const initialState = getSessionState(sessionId);
  if (!initialState) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(initialState.session.packId);

  deterministicPass(sessionId, pack);

  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const userSegmentIds = new Set(state.segments.filter((segment) => segment.speaker === "user").map((segment) => segment.id));
  const claims = state.claims.filter((claim) => claim.status === "observed" && userDerived(claim, userSegmentIds));
  if (claims.length === 0) {
    if (!state.agentEvents.some((event) => event.agent === "verifier" && event.tMs >= initialState.session.createdAt)) {
      emitAgentEvent(sessionId, {
        id: nanoid(), sessionId, agent: "verifier", message: "No new claims to verify", tMs: Date.now(),
      });
    }
    return;
  }

  let output: VerifierOutput;
  try {
    output = await jsonCall<VerifierOutput>({
      system: verifierSystem(pack),
      user: JSON.stringify({ claims: claims.map(({ id, statement, originalText, nodeIds }) => ({ id, statement, originalText, nodeIds })) }),
      schema: verificationSchema,
      maxTokens: 1_500,
    });
  } catch (error) {
    console.error("Verifier LLM call failed; deterministic results remain available", error);
    emitAgentEvent(sessionId, {
      id: nanoid(),
      sessionId,
      agent: "verifier",
      message: `Verification deferred for ${claims.length} claims; deterministic checks completed`,
      tMs: Date.now(),
    });
    return;
  }

  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  let verified = 0;
  let contradicted = 0;
  let uncertain = 0;
  for (const result of Array.isArray(output.results) ? output.results : []) {
    const claim = claimById.get(result.claimId);
    if (!claim || !["verified", "uncertain", "contradicted"].includes(result.status)) continue;
    upsertClaim(sessionId, { ...claim, status: result.status });
    if (result.status === "verified") verified += 1;
    if (result.status === "contradicted") {
      contradicted += 1;
      addLlmFinding(sessionId, claim, result);
    }
    if (result.status === "uncertain") {
      uncertain += 1;
      queueFirstUncertainFinding(sessionId, claim, result);
    }
  }

  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "verifier",
    message: `Verified ${verified} claims; ${contradicted} contradicted, ${uncertain} uncertain`,
    tMs: Date.now(),
    payload: { claimIds: claims.map((claim) => claim.id) },
  });
}

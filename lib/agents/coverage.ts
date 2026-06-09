import { nanoid } from "nanoid";

import { loadPack } from "../packs";
import {
  emitAgentEvent,
  getSessionState,
  setConceptState,
  upsertAssumptionDebt,
  upsertFinding,
} from "../store";
import type { AssumptionDebtItem, AtomicClaim, ConceptPack, Finding, TranscriptSegment } from "../types";

const PHASES_PAST_QUESTIONING = new Set(["repair", "transfer", "teachback", "report", "complete"]);

function repairedContradictions(
  nodeId: string,
  claims: AtomicClaim[],
  findings: Finding[],
): { repaired: boolean; findingIds: string[] } {
  const findingIds: string[] = [];
  let repaired = false;
  const contradictions = claims.filter((claim) =>
    claim.nodeIds.includes(nodeId) &&
    (claim.status === "contradicted" || findings.some((finding) =>
      finding.type === "factual_contradiction" && finding.claimIds.includes(claim.id))));

  for (const contradiction of contradictions) {
    const repair = claims.find((claim) =>
      claim.status === "verified" &&
      claim.nodeIds.includes(nodeId) &&
      claim.createdAtMs > contradiction.createdAtMs &&
      (claim.supersedesClaimId === contradiction.id || contradiction.status === "superseded"));
    if (!repair) continue;
    repaired = true;
    for (const finding of findings) {
      if (finding.type === "factual_contradiction" && finding.claimIds.includes(contradiction.id)) findingIds.push(finding.id);
    }
  }
  return { repaired, findingIds: [...new Set(findingIds)] };
}

function downgradeRepairedFindings(sessionId: string, findingIds: string[]): void {
  const state = getSessionState(sessionId);
  if (!state) return;
  for (const findingId of findingIds) {
    const finding = state.findings.find((item) => item.id === findingId);
    if (!finding) continue;
    const repairNote = "Repaired by a later verified claim on the same concept.";
    upsertFinding(sessionId, {
      ...finding,
      severity: "minor",
      explanation: finding.explanation.includes(repairNote)
        ? finding.explanation
        : `${finding.explanation} ${repairNote}`,
    });
  }
}

function termAppears(text: string, term: string): boolean {
  const lower = text.toLocaleLowerCase();
  const normalizedTerm = term.toLocaleLowerCase().trim();
  if (lower.includes(normalizedTerm)) return true;
  const words = normalizedTerm.match(/[a-z0-9]+/g) ?? [];
  return words.length > 1 && words.every((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function definesTerm(text: string, term: string): boolean {
  if (!termAppears(text, term)) return false;
  return /\b(means|is when|is like|that is)\b/i.test(text);
}

function assumptionDebt(pack: ConceptPack, segments: TranscriptSegment[], claims: AtomicClaim[]): AssumptionDebtItem[] {
  const sources = [
    ...segments.map((segment) => ({ text: segment.text, tMs: segment.tMs })),
    ...claims.map((claim) => ({ text: `${claim.statement} ${claim.originalText}`, tMs: claim.createdAtMs })),
  ].sort((a, b) => a.tMs - b.tMs);

  return pack.vocabulary.flatMap((term) => {
    const firstUse = sources.find((source) => termAppears(source.text, term));
    if (!firstUse) return [];
    const laterExplained = sources.some((source) => source.tMs >= firstUse.tMs && definesTerm(source.text, term));
    return [{
      term,
      firstUsedMs: firstUse.tMs,
      laterExplained,
      note: laterExplained
        ? `"${term}" was defined when or after it was first used.`
        : `"${term}" was used without a later definition.`,
    }];
  });
}

export async function audit(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(state.session.packId);
  const requiredNodes = new Set(pack.objectives.flatMap((objective) => objective.requiredNodeIds));

  for (const node of pack.nodes) {
    const mappedClaims = state.claims.filter((claim) => claim.nodeIds.includes(node.id));
    const verifiedClaims = mappedClaims.filter((claim) => claim.status === "verified");
    const contradictedClaims = mappedClaims.filter((claim) => claim.status === "contradicted");
    const repair = repairedContradictions(node.id, state.claims, state.findings);
    const hasContradictionEvidence = contradictedClaims.length > 0 || state.findings.some((finding) =>
      finding.type === "factual_contradiction" && (
        finding.nodeIds.includes(node.id) ||
        finding.claimIds.some((claimId) => mappedClaims.some((claim) => claim.id === claimId))
      ));
    if (repair.repaired) downgradeRepairedFindings(sessionId, repair.findingIds);

    if (verifiedClaims.length > 0 && (!hasContradictionEvidence || repair.repaired)) {
      setConceptState(sessionId, node.id, state.session.hintLevelByNode[node.id] > 0 ? "assisted" : "established");
    } else if (hasContradictionEvidence && !repair.repaired) {
      setConceptState(sessionId, node.id, "misconceived");
    } else if (pack.prerequisites.includes(node.id)) {
      setConceptState(sessionId, node.id, "assumed");
    } else if (requiredNodes.has(node.id) && PHASES_PAST_QUESTIONING.has(state.session.phase) && mappedClaims.length === 0) {
      setConceptState(sessionId, node.id, "missing");
    } else {
      setConceptState(sessionId, node.id, "unvisited");
    }
  }

  const debt = assumptionDebt(pack, state.segments, state.claims);
  for (const item of debt) upsertAssumptionDebt(sessionId, item);

  const freshState = getSessionState(sessionId);
  if (!freshState) throw new Error(`Unknown session: ${sessionId}`);
  const established = Object.values(freshState.conceptStates).filter((conceptState) =>
    conceptState === "established" || conceptState === "assisted").length;
  const misconceived = Object.values(freshState.conceptStates).filter((conceptState) => conceptState === "misconceived").length;
  const undefinedTerms = freshState.assumptionDebt.filter((item) => !item.laterExplained).map((item) => item.term);
  const debtSummary = undefinedTerms.length > 0
    ? `; assumption debt: '${undefinedTerms[0]}' undefined${undefinedTerms.length > 1 ? ` (+${undefinedTerms.length - 1})` : ""}`
    : "; assumption debt: none";

  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "coverage",
    message: `${established}/${pack.nodes.length} concepts established, ${misconceived} misconceived${debtSummary}`,
    tMs: Date.now(),
    payload: { undefinedTerms },
  });
}

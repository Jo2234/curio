"use client";

import { useState } from "react";

import type { AtomicClaim, ConceptPack, LearnerBelief, TranscriptSegment } from "@/lib/types";

interface LearnerVsReferenceProps {
  startedAt: number;
  teachbackScript?: string;
  beliefs: LearnerBelief[];
  claims: AtomicClaim[];
  segments: TranscriptSegment[];
  referenceSummary: ConceptPack["referenceSummary"];
  objectives: ConceptPack["objectives"];
}

function elapsed(tMs: number, startedAt: number): string {
  const seconds = Math.max(0, Math.floor((tMs - startedAt) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function EvidenceBracket({ segment, claimId, startedAt }: {
  segment: TranscriptSegment;
  claimId: string;
  startedAt: number;
}) {
  return (
    <blockquote className="relative m-0 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] px-6 py-5 pl-10">
      <span className="absolute bottom-4 left-4 top-4 w-2 border-y-2 border-l-2 border-[var(--accent)]" aria-hidden="true" />
      <p className="m-0 max-w-none font-[var(--font-display)] text-[18px] leading-7 text-[var(--text-primary)]">{segment.text}</p>
      <footer className="mt-3 font-mono text-[12px] leading-[18px] text-[var(--text-muted)]">
        {segment.speaker === "user" ? "Teacher" : "Novice"} · {elapsed(segment.tMs, startedAt)} · transcript {segment.id.slice(0, 6)} · claim {claimId.slice(0, 6)}
      </footer>
    </blockquote>
  );
}

export default function LearnerVsReference({
  startedAt,
  teachbackScript,
  beliefs,
  claims,
  segments,
  referenceSummary,
  objectives,
}: LearnerVsReferenceProps) {
  const [tab, setTab] = useState<"learner" | "reference">("learner");
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  return (
    <section aria-labelledby="learner-reference-heading" className="border-2 border-[var(--border-strong)] bg-[var(--bg-panel)]">
      <h2 id="learner-reference-heading" className="sr-only">Learner understanding and verified reference model</h2>
      <div role="tablist" aria-label="Report evidence modes" className="grid border-b-2 border-[var(--border-strong)] md:grid-cols-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "learner"}
          onClick={() => setTab("learner")}
          className={`min-h-16 border-b-2 px-5 text-left text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--focus)] md:border-b-0 md:border-r-2 md:border-[var(--border-strong)] ${tab === "learner" ? "bg-[var(--bg-raised)] text-[var(--text-primary)]" : "bg-[var(--bg-sunken)] text-[var(--text-secondary)]"}`}
        >
          What your learner understood
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reference"}
          onClick={() => setTab("reference")}
          className={`min-h-16 px-5 text-left text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--focus)] ${tab === "reference" ? "bg-[var(--bg-raised)] text-[var(--text-primary)]" : "bg-[var(--bg-sunken)] text-[var(--text-secondary)]"}`}
        >
          <span className="flex flex-wrap items-center gap-3">
            Verified reference model
            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-[2px] border border-b-2 border-[var(--claim-verified)] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--claim-verified)]">
              ✓ Instructor-approved source
            </span>
          </span>
        </button>
      </div>

      <div className="border-b border-dashed border-[var(--accent)] bg-[var(--bg-sunken)] px-5 py-3 text-center font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
        These are deliberately kept separate.
      </div>

      {tab === "learner" ? (
        <div role="tabpanel" className="p-5 md:p-8">
          <p className="mb-2 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Teach-back reconstruction</p>
          {teachbackScript ? (
            <div className="relative border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] px-6 py-5 pl-10">
              <span className="absolute bottom-4 left-4 top-4 w-2 border-y-2 border-l-2 border-[var(--accent)]" aria-hidden="true" />
              <p className="m-0 max-w-none font-[var(--font-display)] text-[20px] leading-8 text-[var(--text-primary)]">{teachbackScript}</p>
              <p className="mb-0 mt-3 max-w-none font-mono text-[12px] text-[var(--text-muted)]">Novice teach-back · reconstructed only from learner beliefs</p>
            </div>
          ) : (
            <p className="m-0 max-w-none border border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] p-5 text-[16px] text-[var(--text-secondary)]">
              Session incomplete — teach-back not run
            </p>
          )}

          <div className="mt-8">
            <h3 className="m-0 font-[var(--font-display)] text-[22px] leading-7 text-[var(--text-primary)]">Beliefs in the learner model</h3>
            {beliefs.length === 0 ? (
              <p className="mb-0 mt-3 max-w-none text-[16px] text-[var(--text-secondary)]">No learner beliefs have been reconstructed yet.</p>
            ) : (
              <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {beliefs.map((belief) => {
                  const supportingClaims = belief.supportingClaimIds.flatMap((id) => claimById.get(id) ? [claimById.get(id)!] : []);
                  return (
                    <details key={belief.id} className="group bg-[var(--bg-panel)] px-4 py-4 open:bg-[var(--bg-raised)]">
                      <summary className="cursor-pointer list-none text-[16px] font-semibold leading-6 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                        <span className="mr-3 inline-grid h-6 w-6 place-items-center border border-[var(--border-strong)] font-mono text-[12px] group-open:bg-[var(--accent)] group-open:text-[var(--ink-on-accent)]" aria-hidden="true">+</span>
                        {belief.statement}
                        <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{belief.status}</span>
                      </summary>
                      <div className="mt-5 grid gap-5 pl-9">
                        {belief.ambiguityNote ? <p className="m-0 max-w-none text-[14px] text-[var(--claim-uncertain)]">Uncertainty: {belief.ambiguityNote}</p> : null}
                        {supportingClaims.length === 0 ? (
                          <p className="m-0 max-w-none text-[14px] text-[var(--text-secondary)]">No supporting claim was retained for this belief.</p>
                        ) : supportingClaims.map((claim) => (
                          <div key={claim.id} className="grid gap-3">
                            <p className="m-0 max-w-none text-[14px] text-[var(--text-secondary)]"><span className="font-mono text-[12px] text-[var(--text-muted)]">Claim {claim.id.slice(0, 6)}</span> · {claim.statement}</p>
                            {claim.segmentIds.flatMap((id) => segmentById.get(id) ? [segmentById.get(id)!] : []).map((segment) => (
                              <EvidenceBracket key={`${claim.id}:${segment.id}`} segment={segment} claimId={claim.id} startedAt={startedAt} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div role="tabpanel" className="border-l-[3px] border-[var(--claim-verified)] p-5 md:p-8">
          <p className="m-0 max-w-none font-[var(--font-display)] text-[20px] leading-8 text-[var(--text-primary)]">{referenceSummary}</p>
          <h3 className="mb-0 mt-8 font-[var(--font-display)] text-[22px] leading-7 text-[var(--text-primary)]">Instructor objectives</h3>
          <ol className="mb-0 mt-4 grid gap-3 pl-0">
            {objectives.map((objective, index) => (
              <li key={objective.id} className="grid grid-cols-[32px_1fr] gap-3 border-t border-[var(--border)] pt-3 text-[16px] leading-6 text-[var(--text-secondary)]">
                <span className="font-mono text-[12px] text-[var(--claim-verified)]">{String(index + 1).padStart(2, "0")}</span>
                <span>{objective.statement}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

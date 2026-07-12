import Link from "next/link";

import ConceptMap from "@/components/ConceptMap";
import LearnerVsReference from "@/components/LearnerVsReference";
import type { SessionReport } from "@/lib/agents/reportComposer";
import type { ConceptPack, Finding, Session } from "@/lib/types";

export type ReviewedFinding = Finding & {
  reviewerAttribution?: string;
  reviewNote?: string;
  reviewedAt?: number;
};

export interface ReportViewProps {
  session: Session;
  pack: ConceptPack;
  report: SessionReport;
}

const phaseOrder: Array<{ key: string; label: string }> = [
  { key: "listening", label: "Teach" },
  { key: "questioning", label: "Probe" },
  { key: "teachback", label: "Teach-back" },
  { key: "report", label: "Examine" },
];

const findingMarks: Record<Finding["type"], string> = {
  factual_contradiction: "≠",
  material_omission: "−",
  undefined_term: "T",
  causal_leap: "→",
  broken_analogy: "A",
  visual_ambiguity: "V",
  transfer_failure: "X",
};

function duration(session: Session, report: SessionReport): string {
  const elapsedTimes = report.segments.map((segment) =>
    segment.tMs >= 1_000_000_000_000
      ? segment.tMs - session.createdAt
      : segment.tMs,
  );
  const seconds = Math.max(0, Math.floor(Math.max(0, ...elapsedTimes) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function timestamp(tMs: number, startedAt: number): string {
  const seconds = Math.max(0, Math.floor((tMs - startedAt) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function hintPhrase(level: 0 | 1 | 2): string {
  if (level === 1) return "after a nudge";
  if (level === 2) return "after explanation";
  return "repaired independently";
}

function countLine(pack: ConceptPack, report: SessionReport): string {
  const established = pack.nodes.filter((node) => ["established", "assisted"].includes(report.conceptStates[node.id])).length;
  const repairedNodes = new Set(
    report.findings.filter((finding) => finding.type === "factual_contradiction").flatMap((finding) => finding.nodeIds)
      .filter((id) => ["established", "assisted"].includes(report.conceptStates[id])),
  );
  const hinted = Object.values(report.hintLevelByNode).filter((level) => level > 0).length;
  const assumed = Object.values(report.conceptStates).filter((state) => state === "assumed").length;
  return `${established} of ${pack.nodes.length} core relationships established · ${repairedNodes.size} repaired after a counterexample · ${hinted} required a hint · ${assumed} prerequisite${assumed === 1 ? " was" : "s were"} assumed`;
}

function EvidenceQuote({ text, speaker, tMs, startedAt, segmentId, claimId }: {
  text: string;
  speaker: string;
  tMs: number;
  startedAt: number;
  segmentId: string;
  claimId?: string;
}) {
  return (
    <blockquote className="relative m-0 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] px-6 py-5 pl-10">
      <span className="absolute bottom-4 left-4 top-4 w-2 border-y-2 border-l-2 border-[var(--accent)]" aria-hidden="true" />
      <p className="m-0 max-w-none font-[var(--font-display)] text-[18px] leading-7 text-[var(--text-primary)]">{text}</p>
      <footer className="mt-3 font-mono text-[12px] leading-[18px] text-[var(--text-muted)]">
        {speaker} · {timestamp(tMs, startedAt)} · transcript {segmentId.slice(0, 6)}{claimId ? ` · claim ${claimId.slice(0, 6)}` : ""}
      </footer>
    </blockquote>
  );
}

export default function ReportView({ session, pack, report }: ReportViewProps) {
  const segmentById = new Map(report.segments.map((segment) => [segment.id, segment]));
  const claimById = new Map(report.claims.map((claim) => [claim.id, claim]));
  const findings = report.findings as ReviewedFinding[];
  const currentPhaseIndex = ["setup", "listening", "questioning", "repair", "transfer", "teachback", "report", "complete"].indexOf(session.phase);

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-8 text-[var(--text-primary)] sm:px-5 lg:px-8 lg:py-12">
      <div className="mx-auto grid w-full max-w-[1440px] gap-12">
        <header className="border-b-2 border-[var(--border-strong)] pb-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Curio session evidence</p>
              <h1 className="mb-0 mt-2 font-[var(--font-display)] text-[40px] font-semibold leading-[44px] text-[var(--text-primary)]">{pack.title}</h1>
              {report.summary ? <p className="mb-0 mt-4 max-w-3xl text-[18px] leading-7 text-[var(--text-secondary)]">{report.summary}</p> : null}
            </div>
            <dl className="m-0 grid min-w-[280px] gap-2 border-l-2 border-[var(--border-strong)] pl-5 text-[14px]">
              <div className="flex justify-between gap-6"><dt className="text-[var(--text-muted)]">Pack</dt><dd className="m-0 font-mono">{pack.id}@{pack.version}</dd></div>
              <div className="flex justify-between gap-6"><dt className="text-[var(--text-muted)]">Duration</dt><dd className="m-0 font-mono tabular-nums">{duration(session, report)}</dd></div>
              <div className="mt-1">
                <span className="inline-flex min-h-7 items-center gap-1.5 rounded-[2px] border border-b-2 border-[var(--claim-verified)] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--claim-verified)]">
                  ✓ {pack.verificationStatus === "instructor_approved" ? "Instructor approved" : pack.verificationStatus.replaceAll("_", " ")}
                </span>
              </div>
            </dl>
          </div>
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Session phases completed">
            {phaseOrder.map((phase) => {
              const index = ["listening", "questioning", "teachback", "report"].indexOf(phase.key);
              const complete = currentPhaseIndex >= [1, 2, 5, 6][index];
              return (
                <span key={phase.key} className={`inline-flex h-8 items-center gap-2 rounded-full border-2 px-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${complete ? "border-[var(--claim-verified)] text-[var(--text-primary)]" : "border-[var(--border-strong)] text-[var(--text-muted)]"}`}>
                  <span className={`h-2 w-2 ${complete ? "bg-[var(--claim-verified)]" : "border border-[var(--text-muted)]"}`} aria-hidden="true" />
                  {phase.label}
                </span>
              );
            })}
          </div>
        </header>

        <LearnerVsReference
          teachbackScript={report.teachbackResult?.script}
          beliefs={report.beliefs}
          claims={report.claims}
          segments={report.segments}
          referenceSummary={pack.referenceSummary}
          objectives={pack.objectives}
        />

        <section aria-labelledby="coverage-heading" className="grid gap-4">
          <div>
            <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Evidence map</p>
            <h2 id="coverage-heading" className="mb-0 mt-1 font-[var(--font-display)] text-[30px] font-semibold leading-9">Concept coverage</h2>
          </div>
          <ConceptMap nodes={pack.nodes} conceptStates={report.conceptStates} />
          <p className="m-0 max-w-none border-l-2 border-[var(--accent)] bg-[var(--bg-panel)] px-5 py-4 text-[16px] font-semibold leading-6 text-[var(--text-primary)]">
            {countLine(pack, report)}
          </p>
        </section>

        <section aria-labelledby="findings-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Examiner docket</p>
              <h2 id="findings-heading" className="mb-0 mt-1 font-[var(--font-display)] text-[30px] font-semibold leading-9">Findings</h2>
            </div>
            <span className="font-mono text-[12px] text-[var(--text-muted)]">{findings.length} evidence item{findings.length === 1 ? "" : "s"}</span>
          </div>
          {findings.length === 0 ? (
            <p className="m-0 max-w-none border border-dashed border-[var(--border-strong)] bg-[var(--bg-panel)] p-5 text-[16px] text-[var(--text-secondary)]">No findings were recorded in this session.</p>
          ) : (
            <div className="divide-y divide-[var(--border)] border-y-2 border-[var(--border-strong)]">
              {findings.map((finding) => {
                const evidence = finding.segmentIds.flatMap((id) => segmentById.get(id) ? [segmentById.get(id)!] : []);
                const claims = finding.claimIds.flatMap((id) => claimById.get(id) ? [claimById.get(id)!] : []);
                const hintLevel = Math.max(0, ...finding.nodeIds.map((id) => report.hintLevelByNode[id] ?? 0)) as 0 | 1 | 2;
                return (
                  <details key={finding.id} className={`group bg-[var(--bg-panel)] open:bg-[var(--bg-raised)] ${finding.confidence === "uncertain" ? "border-l-[3px] border-dashed border-l-[var(--claim-uncertain)]" : finding.severity === "critical" || finding.severity === "major" ? "border-l-[3px] border-l-[var(--severity-critical)]" : "border-l-[3px] border-l-[var(--severity-attention)]"}`}>
                    <summary className="grid cursor-pointer list-none grid-cols-[40px_1fr_auto] items-start gap-3 px-4 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--focus)]">
                      <span className="grid h-8 w-8 place-items-center rounded-[2px] border border-current font-mono text-[16px]" aria-hidden="true">{findingMarks[finding.type]}</span>
                      <span>
                        <span className="block text-[16px] font-semibold leading-[22px] text-[var(--text-primary)]">{finding.title}</span>
                        <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{finding.type.replaceAll("_", " ")} · {finding.severity}</span>
                      </span>
                      <span className={`inline-flex min-h-7 items-center rounded-[2px] border px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${finding.confidence === "verified" ? "border-b-2 border-[var(--claim-verified)] text-[var(--claim-verified)]" : finding.confidence === "uncertain" ? "border-dashed border-[var(--claim-uncertain)] text-[var(--claim-uncertain)]" : "border-[var(--severity-attention)] text-[var(--severity-attention)]"}`}>
                        {finding.confidence}
                      </span>
                    </summary>
                    <div className="grid gap-5 border-t border-[var(--border)] px-5 py-6 md:px-8">
                      {evidence.length ? evidence.map((segment) => (
                        <EvidenceQuote
                          key={segment.id}
                          text={segment.text}
                          speaker={segment.speaker === "user" ? "Teacher" : "Novice"}
                          tMs={segment.tMs}
                          startedAt={session.createdAt}
                          segmentId={segment.id}
                          claimId={claims.find((claim) => claim.segmentIds.includes(segment.id))?.id}
                        />
                      )) : <p className="m-0 max-w-none text-[14px] text-[var(--text-muted)]">No transcript excerpt was retained for this finding.</p>}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h3 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">Interpretation</h3>
                          <p className="mb-0 mt-2 max-w-none text-[16px] leading-6 text-[var(--text-secondary)]">{finding.explanation}</p>
                        </div>
                        <dl className="m-0 grid content-start gap-3 border-l border-[var(--border)] pl-4 text-[14px]">
                          <div><dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Source</dt><dd className="m-0 mt-1 break-words text-[var(--text-secondary)]">{finding.sourceRef ?? "No pack rule attached"}</dd></div>
                          <div><dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Repair history</dt><dd className="m-0 mt-1 text-[var(--text-secondary)]">{hintPhrase(hintLevel)}</dd></div>
                          {finding.reviewerAttribution ? <div><dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Expert review</dt><dd className="m-0 mt-1 text-[var(--claim-verified)]">Reviewed by {finding.reviewerAttribution}{finding.reviewNote ? ` · ${finding.reviewNote}` : ""}</dd></div> : null}
                        </dl>
                      </div>
                      {finding.reviewStatus === "queued" ? (
                        <Link href={`/review?finding=${encodeURIComponent(finding.id)}`} className="w-fit border-b border-[var(--accent)] text-[16px] font-semibold text-[var(--accent)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                          Queued for expert review →
                        </Link>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="debt-heading">
          <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Unresolved foundations</p>
          <h2 id="debt-heading" className="mb-4 mt-1 font-[var(--font-display)] text-[30px] font-semibold leading-9">Assumption debt</h2>
          <div className="overflow-x-auto border-y-2 border-[var(--border-strong)] bg-[var(--bg-panel)]">
            <table className="w-full min-w-[720px] border-collapse text-left text-[14px] leading-5">
              <thead className="bg-[var(--bg-sunken)] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                <tr><th className="px-4 py-3">Term</th><th className="px-4 py-3">First used</th><th className="px-4 py-3">Later explained</th><th className="px-4 py-3">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.assumptionDebt.length ? report.assumptionDebt.map((item) => (
                  <tr key={`${item.term}:${item.firstUsedMs}`}>
                    <th className="px-4 py-4 text-[16px] font-semibold">{item.term}</th>
                    <td className="px-4 py-4 font-mono tabular-nums text-[var(--text-secondary)]">{timestamp(item.firstUsedMs, session.createdAt)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{item.laterExplained ? "Yes — resolved" : "No — still assumed"}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{item.note}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-4 py-5 text-[16px] text-[var(--text-secondary)]">No assumption debt was recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="hint-heading">
          <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Repair provenance</p>
          <h2 id="hint-heading" className="mb-4 mt-1 font-[var(--font-display)] text-[30px] font-semibold leading-9">Hint dependency</h2>
          <div className="grid border-y-2 border-[var(--border-strong)] sm:grid-cols-2 lg:grid-cols-3">
            {pack.nodes.map((node) => {
              const level = report.hintLevelByNode[node.id] ?? 0;
              return (
                <div key={node.id} className="border-b border-r border-[var(--border)] bg-[var(--bg-panel)] px-4 py-4">
                  <p className="m-0 max-w-none text-[14px] font-semibold text-[var(--text-primary)]">{node.name}</p>
                  <p className={`mb-0 mt-1 max-w-none text-[14px] ${level ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>{hintPhrase(level)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="next-heading" className="relative border-2 border-[var(--accent)] bg-[var(--paper)] p-6 pl-10 text-[var(--ink-paper)] shadow-[4px_4px_0_var(--shadow-hard)]">
          <span className="absolute bottom-4 left-4 top-4 border-l-[3px] border-[var(--ink-paper)]" aria-hidden="true" />
          <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-paper)]">Recommended next step</p>
          <h2 id="next-heading" className="mb-0 mt-2 font-[var(--font-display)] text-[30px] font-semibold leading-9 text-[var(--ink-paper)]">{report.recommendedNextStep}</h2>
        </section>
      </div>
    </main>
  );
}

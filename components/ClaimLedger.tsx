"use client";

import type { AtomicClaim, Finding } from "@/lib/types";

const statusView = {
  observed: { icon: "○", label: "Observed", color: "var(--claim-observed)" },
  verified: { icon: "✓", label: "Verified", color: "var(--claim-verified)" },
  contradicted: { icon: "×", label: "Contradicted", color: "var(--claim-contradicted)" },
  uncertain: { icon: "?", label: "Uncertain", color: "var(--claim-uncertain)" },
  superseded: { icon: "—", label: "Superseded", color: "var(--text-disabled)" },
} as const;

export default function ClaimLedger({ claims, findings, misconceptionTitles = {} }: { claims: AtomicClaim[]; findings: Finding[]; misconceptionTitles?: Record<string, string> }) {
  const findingByClaim = new Map(findings.flatMap((finding) => finding.claimIds.map((claimId) => [claimId, finding])));

  return (
    <section className="curio-panel flex h-full min-h-0 flex-col" aria-labelledby="claims-heading">
      <header className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-4 py-3">
        <h2 id="claims-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          Claim ledger
        </h2>
        <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">{claims.length}</span>
      </header>
      <div className="curio-scroll min-h-0 flex-1 overflow-y-auto">
        {claims.length === 0 ? (
          <p className="m-0 px-5 py-8 text-[16px] leading-6 text-[var(--text-muted)]">
            No testable claims yet. Definitions and examples will appear here as you teach.
          </p>
        ) : (
          <ol>
            {claims.map((claim, index) => {
              const view = statusView[claim.status];
              const finding = findingByClaim.get(claim.id);
              const misconceptionTitle = claim.misconceptionId ? misconceptionTitles[claim.misconceptionId] : undefined;
              return (
                <li
                  key={claim.id}
                  className={`claim-row grid grid-cols-[48px_1fr_auto] items-start gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3 ${claim.status === "contradicted" ? "border-l-[3px] border-l-[var(--claim-contradicted)]" : ""} ${claim.status === "uncertain" ? "border-l-[3px] border-l-[var(--claim-uncertain)]" : ""} ${claim.status === "verified" ? "border-b-2 border-b-[var(--claim-verified)]" : ""}`}
                >
                  <span className="font-mono text-[12px] text-[var(--text-muted)]">C-{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className={`m-0 line-clamp-3 text-[14px] font-medium leading-5 text-[var(--text-primary)] ${claim.status === "superseded" ? "line-through opacity-60" : ""}`}>
                      {claim.statement}
                    </p>
                    {claim.status === "contradicted" && (misconceptionTitle || finding) ? (
                      <p className="mt-2 mb-0 text-[12px] leading-4 text-[var(--claim-contradicted)]">{misconceptionTitle ?? finding?.title}</p>
                    ) : null}
                  </div>
                  <span
                    className="inline-flex min-h-6 items-center gap-1 border px-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]"
                    style={{ color: view.color, borderColor: view.color }}
                    title={view.label}
                  >
                    <span aria-hidden="true">{view.icon}</span>
                    <span className="hidden 2xl:inline">{view.label}</span>
                    <span className="sr-only 2xl:hidden">{view.label}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

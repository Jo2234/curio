"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentEvent, AgentName, Directive } from "@/lib/types";

const agentView: Record<AgentName, { label: string; color: string; mark: string }> = {
  claim_mapper: { label: "Claim mapper", color: "var(--agent-claim)", mark: "C" },
  verifier: { label: "Verifier", color: "var(--agent-verifier)", mark: "V" },
  coverage: { label: "Coverage auditor", color: "var(--agent-curriculum)", mark: "A" },
  pedagogy: { label: "Pedagogy", color: "var(--agent-question)", mark: "P" },
  visual: { label: "Visual describer", color: "var(--agent-concept)", mark: "D" },
  learner_model: { label: "Learner model", color: "var(--agent-jargon)", mark: "L" },
  teachback: { label: "Learner model", color: "var(--agent-jargon)", mark: "L" },
  report: { label: "Report composer", color: "var(--agent-jargon)", mark: "R" },
};

function formatTime(tMs: number, startedAtMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((tMs - startedAtMs) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function DirectiveCard({ directive }: { directive: Directive }) {
  return (
    <article className="directive-card relative m-3 border-2 border-[var(--accent)] bg-[var(--paper)] p-6 pl-9 text-[var(--ink-paper)] shadow-[4px_4px_0_var(--shadow-hard)]">
      <span className="absolute bottom-4 left-4 top-4 w-[3px] bg-[var(--ink-paper)]" aria-hidden="true" />
      <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em]">Why this question</p>
      <h3 className="my-2 font-[var(--font-display)] text-[22px] font-semibold leading-[30px]">
        Pedagogy → asking: {directive.utteranceInstruction}
      </h3>
      <p className="m-0 text-[15px] leading-[23px]">{directive.reason}</p>
      <footer className="mt-4 border-t border-[color-mix(in_srgb,var(--ink-paper)_30%,transparent)] pt-3 font-mono text-[11px] uppercase tracking-[0.05em]">
        Target: {directive.targetNodeIds.length ? directive.targetNodeIds.join(", ").replaceAll("_", " ") : "whole explanation"}
      </footer>
    </article>
  );
}

export default function AgentPanel({ agentEvents, directives }: { agentEvents: AgentEvent[]; directives: Directive[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);
  const [following, setFollowing] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const latestDirective = directives.at(-1);
  const startedAtMs = agentEvents[0]?.tMs ?? 0;

  useEffect(() => {
    const added = Math.max(0, agentEvents.length - previousCount.current);
    previousCount.current = agentEvents.length;
    if (!added) return;
    if (following) {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    } else {
      setUnseen((count) => count + added);
    }
  }, [agentEvents.length, following]);

  const resumeFollowing = () => {
    setFollowing(true);
    setUnseen(0);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  return (
    <section className="curio-panel flex h-full min-h-0 flex-col" aria-labelledby="agents-heading">
      <header className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-4 py-3">
        <h2 id="agents-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Agent docket</h2>
        <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">{agentEvents.length}</span>
      </header>

      <div
        ref={scrollRef}
        className="curio-scroll relative min-h-0 flex-1 overflow-y-auto"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          setFollowing(isNearBottom);
          if (isNearBottom) setUnseen(0);
        }}
      >
        {latestDirective ? <DirectiveCard directive={latestDirective} /> : null}
        {agentEvents.length === 0 ? (
          <p className="m-0 px-5 py-8 text-[16px] leading-6 text-[var(--text-muted)]">
            The examiners are listening. Their observations will enter here.
          </p>
        ) : (
          <ol>
            {agentEvents.map((event) => {
              const view = agentView[event.agent];
              return (
                <li key={event.id} className="agent-event relative grid min-h-[68px] grid-cols-[4px_28px_1fr] gap-x-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3 hover:bg-[var(--bg-raised)]">
                  <span className="agent-rule h-full w-1 origin-top" style={{ backgroundColor: view.color }} aria-hidden="true" />
                  <span className="grid h-7 w-7 place-items-center rounded-[2px] border font-mono text-[12px] font-semibold" style={{ color: view.color, borderColor: view.color }} aria-hidden="true">
                    {view.mark}
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[12px] font-semibold" style={{ color: view.color }}>{view.label}</span>
                      <time className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{formatTime(event.tMs, startedAtMs)}</time>
                    </div>
                    <p className="m-0 text-[14px] font-medium leading-5 text-[var(--text-primary)]">{event.message}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {unseen > 0 ? (
        <button type="button" className="m-3 border border-[var(--border-strong)] bg-[var(--bg-raised)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]" onClick={resumeFollowing}>
          {unseen} new {unseen === 1 ? "observation" : "observations"}
        </button>
      ) : null}
    </section>
  );
}

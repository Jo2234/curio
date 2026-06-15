"use client";

import type { ConceptNode, ConceptState } from "@/lib/types";

const stateView: Record<ConceptState, { icon: string; label: string }> = {
  unvisited: { icon: "·", label: "Unvisited" },
  established: { icon: "✓", label: "Established" },
  assisted: { icon: "+", label: "Assisted" },
  fragile: { icon: "!", label: "Fragile" },
  misconceived: { icon: "×", label: "Misconceived" },
  missing: { icon: "□", label: "Not taught yet" },
  assumed: { icon: "○", label: "Assumed" },
  out_of_scope: { icon: "—", label: "Out of scope" },
};

function ConceptPill({ node, state }: { node: ConceptNode; state: ConceptState }) {
  const view = stateView[state];
  return (
    <div
      key={`${node.id}:${state}`}
      className="concept-pill inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-[14px] font-semibold leading-5"
      data-state={state}
      title={`${node.name}: ${view.label}`}
    >
      <span className="grid h-[14px] min-w-[14px] place-items-center border border-current text-[10px] leading-none" aria-hidden="true">{view.icon}</span>
      <span>{node.name}</span>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.05em] opacity-85">{view.label}</span>
    </div>
  );
}

export default function ConceptMap({ nodes, conceptStates }: { nodes: ConceptNode[]; conceptStates: Record<string, ConceptState> }) {
  const groups = [
    { label: "Core", nodes: nodes.filter((node) => node.importance === "core") },
    { label: "Supporting", nodes: nodes.filter((node) => node.importance === "supporting") },
  ];

  return (
    <section className="curio-panel px-5 py-3" aria-labelledby="concepts-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="concepts-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Concept-state map</h2>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">Live learner model</span>
      </div>
      {nodes.length === 0 ? (
        <p className="m-0 text-[14px] text-[var(--text-muted)]">Concept states will appear when the lesson pack is ready.</p>
      ) : (
        <div className="grid gap-2 2xl:grid-cols-2">
          {groups.map((group) => group.nodes.length ? (
            <div key={group.label} className="flex min-w-0 items-start gap-3">
              <span className="mt-2 w-[74px] shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{group.label}</span>
              <div className="flex min-w-0 flex-wrap gap-2">
                {group.nodes.map((node) => (
                  <ConceptPill key={`${node.id}:${conceptStates[node.id] ?? "unvisited"}`} node={node} state={conceptStates[node.id] ?? "unvisited"} />
                ))}
              </div>
            </div>
          ) : null)}
        </div>
      )}
    </section>
  );
}

export function ConceptMapCompact({ nodes, conceptStates }: { nodes: ConceptNode[]; conceptStates: Record<string, ConceptState> }) {
  const counts = nodes.reduce<Partial<Record<ConceptState, number>>>((summary, node) => {
    const state = conceptStates[node.id] ?? "unvisited";
    summary[state] = (summary[state] ?? 0) + 1;
    return summary;
  }, {});
  const established = counts.established ?? 0;
  const needsAttention = (counts.fragile ?? 0) + (counts.misconceived ?? 0);
  const remaining = nodes.length - established;

  return (
    <section className="curio-panel flex min-h-[58px] items-center gap-4 px-5 py-2.5" aria-labelledby="concept-progress-heading">
      <div className="shrink-0 border-r-2 border-[var(--border-strong)] pr-4">
        <h2 id="concept-progress-heading" className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Concept progress</h2>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">Live learner model</span>
      </div>
      {nodes.length === 0 ? (
        <p className="m-0 text-[14px] text-[var(--text-muted)]">Concept states will appear when the lesson pack is ready.</p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1" aria-label={`${established} of ${nodes.length} concepts established; ${needsAttention} need attention`}>
          <p className="m-0 text-[15px] text-[var(--text-primary)]">
            <strong className="font-semibold text-[var(--concept-established)]">{established} of {nodes.length}</strong> established <span className="text-[var(--text-muted)]">· {remaining} still unfolding</span>
          </p>
          {needsAttention > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-dashed border-[var(--claim-uncertain)] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--claim-uncertain)]">
              <span aria-hidden="true">!</span>{needsAttention} need attention
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1" aria-hidden="true">
            {nodes.map((node) => {
              const state = conceptStates[node.id] ?? "unvisited";
              return <span key={node.id} className="concept-progress-mark h-2.5 w-5 border" data-state={state} title={`${node.name}: ${stateView[state].label}`} />;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

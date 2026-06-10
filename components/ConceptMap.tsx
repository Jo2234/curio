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

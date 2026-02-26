import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import Link from "next/link";

import type { ReviewedFinding } from "@/components/ReportView";
import { loadPack } from "@/lib/packs";
import { getSessionState, type SessionState } from "@/lib/store";
import type { ConceptPack } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ReviewTask {
  state: SessionState;
  finding: ReviewedFinding;
  pack: ConceptPack;
}

async function queuedTasks(): Promise<ReviewTask[]> {
  const directory = path.join(process.cwd(), "data", "sessions");
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const tasks = await Promise.all(names.map(async (name): Promise<ReviewTask[]> => {
    try {
      const diskState = JSON.parse(await readFile(path.join(directory, name), "utf8")) as SessionState;
      const state = getSessionState(diskState.session.id) ?? diskState;
      const pack = loadPack(state.session.packId);
      return (state.findings as ReviewedFinding[])
        .filter((finding) => finding.reviewStatus === "queued")
        .map((finding) => ({ state, finding, pack }));
    } catch {
      return [];
    }
  }));

  return tasks.flat().sort((a, b) => {
    const severity = { critical: 0, major: 1, moderate: 2, minor: 3 } as const;
    return severity[a.finding.severity] - severity[b.finding.severity]
      || a.state.session.createdAt - b.state.session.createdAt;
  });
}

function packRule(pack: ConceptPack, sourceRef?: string): string {
  if (!sourceRef) return "No pack rule was attached; expert judgment is required.";
  const edgeId = sourceRef.match(/edge:([^\s]+)/)?.[1];
  if (edgeId) return pack.edges.find((edge) => edge.id === edgeId)?.explanation ?? sourceRef;
  const nodeId = sourceRef.match(/node:([^\s]+)/)?.[1];
  if (nodeId) return pack.nodes.find((node) => node.id === nodeId)?.definition ?? sourceRef;
  const misconceptionId = sourceRef.match(/mc:([^\s]+)/)?.[1];
  if (misconceptionId) return pack.misconceptions.find((item) => item.id === misconceptionId)?.explanation ?? sourceRef;
  return sourceRef;
}

function time(tMs: number, startedAt: number): string {
  const seconds = Math.max(0, Math.floor((tMs - startedAt) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ finding?: string }> }) {
  const query = await searchParams;
  const tasks = await queuedTasks();
  const selected = tasks.find((task) => task.finding.id === query.finding) ?? tasks[0];

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-8 text-[var(--text-primary)] sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b-2 border-[var(--border-strong)] pb-5">
          <div>
            <p className="m-0 max-w-none font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Curio expert service</p>
            <h1 className="mb-0 mt-2 font-[var(--font-display)] text-[40px] font-semibold leading-[44px]">Human review queue</h1>
            <p className="mb-0 mt-3 max-w-2xl text-[16px] leading-6 text-[var(--text-secondary)]">Agents surface only the evidence that needs subject judgment. The full learner trail remains attached.</p>
          </div>
          <div className="border-l-2 border-[var(--claim-verified)] pl-4 text-right">
            <p className="m-0 max-w-none text-[16px] font-semibold">J. Vaz</p>
            <p className="mb-0 mt-1 max-w-none font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--claim-verified)]">Subject expert · Earth science</p>
          </div>
        </header>

        {tasks.length === 0 ? (
          <section className="mt-8 border-2 border-[var(--border-strong)] bg-[var(--bg-panel)] p-8">
            <h2 className="m-0 font-[var(--font-display)] text-[30px] leading-9">Nothing requires expert judgment.</h2>
            <p className="mb-0 mt-3 max-w-none text-[16px] text-[var(--text-secondary)]">The evidence trail is still available.</p>
          </section>
        ) : (
          <div className="mt-6 grid min-h-[620px] gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(620px,1.6fr)]">
            <aside aria-label="Queued findings" className="border-2 border-[var(--border-strong)] bg-[var(--bg-sunken)]">
              <div className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-4 py-3">
                <h2 className="m-0 text-[16px] font-semibold">Needs judgment</h2>
                <span className="font-mono text-[12px] text-[var(--text-muted)]">{tasks.length} item{tasks.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid gap-2 p-2">
                {tasks.map((task) => {
                  const active = task.finding.id === selected?.finding.id;
                  return (
                    <Link
                      key={`${task.state.session.id}:${task.finding.id}`}
                      href={`/review?finding=${encodeURIComponent(task.finding.id)}`}
                      className={`grid min-h-[112px] grid-cols-[6px_1fr_auto] overflow-hidden rounded-[4px] border bg-[var(--bg-panel)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${active ? "border-[var(--border-strong)] bg-[var(--bg-raised)]" : "border-[var(--border)]"}`}
                    >
                      <span className={task.finding.severity === "critical" || task.finding.severity === "major" ? "bg-[var(--severity-critical)]" : "bg-[var(--severity-attention)]"} aria-hidden="true" />
                      <span className="p-4">
                        <span className="block text-[16px] font-semibold leading-[22px]">{task.finding.title}</span>
                        <span className="mt-2 block text-[14px] leading-5 text-[var(--text-secondary)]">{task.finding.segmentIds.length} evidence excerpt{task.finding.segmentIds.length === 1 ? "" : "s"} · {task.pack.title}</span>
                      </span>
                      <span className="p-4 text-right font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--accent)]">~40s<br />Review</span>
                    </Link>
                  );
                })}
              </div>
            </aside>

            {selected ? (() => {
              const claim = selected.state.claims.find((item) => selected.finding.claimIds.includes(item.id));
              const segments = selected.finding.segmentIds.flatMap((id) => {
                const segment = selected.state.segments.find((item) => item.id === id);
                return segment ? [segment] : [];
              });
              return (
                <section aria-labelledby="review-detail-heading" className="border-2 border-[var(--border-strong)] bg-[var(--bg-panel)]">
                  <div className="border-b-2 border-[var(--border-strong)] px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="m-0 max-w-none font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--claim-uncertain)]">Uncertain · {selected.finding.severity} · {selected.finding.type.replaceAll("_", " ")}</p>
                        <h2 id="review-detail-heading" className="mb-0 mt-2 font-[var(--font-display)] text-[22px] font-semibold leading-7">{selected.finding.title}</h2>
                      </div>
                      <span className="inline-flex h-7 items-center rounded-[2px] border border-dashed border-[var(--claim-uncertain)] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--claim-uncertain)]">Needs expert</span>
                    </div>
                  </div>

                  <div className="grid gap-6 p-5 xl:grid-cols-2">
                    <div className="grid content-start gap-5">
                      <div>
                        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Claim under review</h3>
                        <p className="mb-0 mt-2 max-w-none text-[18px] font-semibold leading-7">{claim?.statement ?? "No atomic claim was retained."}</p>
                      </div>
                      <div className="grid gap-3">
                        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Transcript evidence</h3>
                        {segments.length ? segments.map((segment) => (
                          <blockquote key={segment.id} className="relative m-0 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] px-6 py-5 pl-10">
                            <span className="absolute bottom-4 left-4 top-4 w-2 border-y-2 border-l-2 border-[var(--accent)]" aria-hidden="true" />
                            <p className="m-0 max-w-none font-[var(--font-display)] text-[18px] leading-7">{segment.text}</p>
                            <footer className="mt-3 font-mono text-[12px] text-[var(--text-muted)]">{segment.speaker === "user" ? "Teacher" : "Novice"} · {time(segment.tMs, selected.state.session.createdAt)} · transcript {segment.id.slice(0, 6)}</footer>
                          </blockquote>
                        )) : <p className="m-0 max-w-none text-[14px] text-[var(--text-muted)]">No transcript excerpt was retained.</p>}
                      </div>
                    </div>

                    <div className="grid content-start gap-5 border-l border-[var(--border)] pl-5">
                      <div>
                        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Pack rule</h3>
                        <p className="mb-0 mt-2 max-w-none text-[16px] leading-6 text-[var(--text-secondary)]">{packRule(selected.pack, selected.finding.sourceRef)}</p>
                        {selected.finding.sourceRef ? <p className="mb-0 mt-2 max-w-none break-words font-mono text-[11px] text-[var(--text-muted)]">{selected.finding.sourceRef}</p> : null}
                      </div>
                      <div>
                        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">AI recommendation</h3>
                        <p className="mb-0 mt-2 max-w-none text-[16px] leading-6 text-[var(--text-secondary)]">{selected.finding.explanation}</p>
                      </div>
                      <div className="border-t-2 border-[var(--border-strong)] pt-5">
                        <p className="m-0 max-w-none text-[14px] text-[var(--text-secondary)]">Record expert judgment <span className="font-mono text-[11px] text-[var(--text-muted)]">· estimated ~40s</span></p>
                        <div className="mt-4 grid gap-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <form action="/api/review" method="post">
                              <input type="hidden" name="sessionId" value={selected.state.session.id} />
                              <input type="hidden" name="findingId" value={selected.finding.id} />
                              <input type="hidden" name="decision" value="confirm" />
                              <button className="min-h-11 w-full border-2 border-[var(--claim-verified)] bg-[var(--claim-verified)] px-4 text-[14px] font-semibold text-[var(--ink-on-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Confirm</button>
                            </form>
                            <form action="/api/review" method="post">
                              <input type="hidden" name="sessionId" value={selected.state.session.id} />
                              <input type="hidden" name="findingId" value={selected.finding.id} />
                              <input type="hidden" name="decision" value="simplification" />
                              <button className="min-h-11 w-full border-2 border-[var(--border-strong)] bg-[var(--bg-raised)] px-3 text-[14px] font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Mark acceptable simplification</button>
                            </form>
                          </div>
                          <form action="/api/review" method="post" className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input type="hidden" name="sessionId" value={selected.state.session.id} />
                            <input type="hidden" name="findingId" value={selected.finding.id} />
                            <input type="hidden" name="decision" value="correct" />
                            <label className="sr-only" htmlFor={`correction-${selected.finding.id}`}>Expert correction</label>
                            <input id={`correction-${selected.finding.id}`} required maxLength={500} name="correction" placeholder="Write the concise correction" className="min-h-11 border-2 border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]" />
                            <button className="min-h-11 border-2 border-[var(--severity-critical)] px-4 text-[14px] font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Correct</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })() : null}
          </div>
        )}
      </div>
    </main>
  );
}

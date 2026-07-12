import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Teach it. Get questioned. Discover what you missed.",
};

const steps = [
  ["01", "Explain by voice", "Teach naturally. Curio listens for the claims and connections you make."],
  ["02", "Agents map your claims against the curriculum", "The evidence trail marks what is clear, missing, or uncertain."],
  ["03", "The novice teaches back only what you taught", "Hear your explanation reconstructed with its gaps left intact."],
] as const;

const liveLoop = [
  { label: "You speak", detail: "Your explanation enters as evidence.", color: "var(--accent)" },
  { label: "Claim mapper", detail: "Extracts atomic claims.", color: "var(--agent-claim)" },
  { label: "Verifier", detail: "Tests each claim against the compiled curriculum contract.", color: "var(--agent-verifier)" },
  { label: "Coverage auditor", detail: "Maps what is established, missing, or assumed.", color: "var(--agent-concept)" },
  { label: "Pedagogy orchestrator", detail: "Scores candidate questions and records why it chose one.", color: "var(--agent-question)" },
  { label: "Curio", detail: "Asks exactly one question.", color: "var(--agent-curriculum)" },
  { label: "You answer", detail: "The answer re-enters the loop.", color: "var(--accent)" },
] as const;

const compileLoop = ["Sources", "Concept graph", "Misconception probes", "Pack critic", "Human approval", "Versioned evaluation contract"] as const;
const learnerLoop = ["Claims", "Beliefs", "Reverse teach-back", "Your corrections", "Revised beliefs"] as const;

function LoopSequence({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-col min-[900px]:flex-row min-[900px]:items-stretch">
      {items.map((item, index) => (
        <div key={item} className="contents">
          <div className="flex min-h-14 flex-1 items-center border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3 font-mono text-[12px] font-semibold leading-4 text-[var(--text-primary)]">
            {item}
          </div>
          {index < items.length - 1 ? (
            <span aria-hidden="true" className="flex h-7 shrink-0 items-center justify-center font-mono text-[16px] text-[var(--accent)] min-[900px]:h-auto min-[900px]:w-7"><span className="min-[900px]:hidden">↓</span><span className="hidden min-[900px]:inline">→</span></span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid min-h-[calc(100svh-56px)] w-full max-w-[1600px] content-between px-4 py-12 sm:px-5 md:py-16 lg:px-8 lg:py-20">
        <div className="grid items-end gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] xl:gap-20">
          <div>
            <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">The understanding rehearsal</p>
            <h1 className="mt-4 max-w-[1050px] font-[var(--font-display)] text-[clamp(44px,6.2vw,88px)] font-semibold leading-[.98] tracking-[-0.035em] text-[var(--text-primary)]">
              Teach it. Get questioned. Discover what you missed.
            </h1>
          </div>
          <div className="border-l-2 border-[var(--accent)] pl-5 xl:mb-2">
            <p className="m-0 max-w-[560px] text-[18px] leading-7 text-[var(--text-secondary)] sm:text-[20px] sm:leading-8">
              Curio is an AI student that knows nothing until you teach it. It builds a model of what you actually explained — then teaches it back to you.
            </p>
          </div>
        </div>

        <div className="mt-14 lg:mt-20">
          <div className="grid border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] md:grid-cols-3">
            {steps.map(([number, title, detail], index) => (
              <article key={number} className={`grid min-h-[180px] grid-cols-[48px_1fr] gap-3 px-4 py-6 sm:px-5 ${index ? "border-t border-[var(--border)] md:border-l md:border-t-0" : ""}`}>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--accent)]">{number}</span>
                <div>
                  <h2 className="m-0 font-[var(--font-display)] text-[22px] font-semibold leading-7">{title}</h2>
                  <p className="mb-0 mt-3 max-w-[380px] text-[15px] leading-6 text-[var(--text-secondary)]">{detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/setup?mode=teacher" className="inline-flex min-h-12 items-center justify-center rounded-[4px] border-2 border-[var(--accent)] bg-[var(--accent)] px-5 text-[16px] font-semibold text-[var(--ink-on-accent)] no-underline transition-colors duration-150 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
              Crash-test a lesson <span className="ml-3" aria-hidden="true">→</span>
            </Link>
            <Link href="/setup?mode=student" className="inline-flex min-h-12 items-center justify-center rounded-[4px] border-2 border-[var(--border-strong)] bg-[var(--bg-panel)] px-5 text-[16px] font-semibold text-[var(--text-primary)] no-underline transition-colors duration-150 hover:border-[var(--accent)] hover:bg-[var(--bg-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
              Test my understanding <span className="ml-3" aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="mt-12 flex flex-col justify-between gap-4 border-y border-[var(--border)] px-1 py-4 text-[14px] text-[var(--text-secondary)] sm:flex-row sm:items-center">
            <Link href="/compiler" className="w-fit border-b border-transparent no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">Compile your own curriculum into an understanding test →</Link>
            <Link href="/review" className="w-fit border-b border-transparent no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">Expert review console</Link>
          </div>

          <section id="loop-engineering" aria-labelledby="loop-engineering-title" className="mt-20 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] lg:mt-24">
            <header className="border-b-2 border-[var(--border-strong)] px-4 py-8 sm:px-6 lg:px-8">
              <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">System docket / 04</p>
              <h2 id="loop-engineering-title" className="mb-0 mt-3 max-w-[900px] font-[var(--font-display)] text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.025em] text-[var(--text-primary)]">
                Under the hood: a loop-engineering harness
              </h2>
              <p className="mb-0 mt-4 max-w-[780px] text-[16px] leading-6 text-[var(--text-secondary)] sm:text-[18px] sm:leading-7">
                Specialized agents steer the same underlying models through differently bounded roles. Each structured output becomes the next loop&apos;s steering input.
              </p>
            </header>

            <article className="border-b border-[var(--border)] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
              <div className="mb-5 flex items-baseline gap-3">
                <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">LOOP 01</span>
                <h3 className="m-0 font-[var(--font-display)] text-[22px] font-semibold leading-7">The live loop</h3>
              </div>
              <div className="flex flex-col min-[900px]:flex-row min-[900px]:items-stretch">
                {liveLoop.map((item, index) => (
                  <div key={item.label} className="contents">
                    <div className="min-h-[112px] flex-1 border border-[var(--border)] bg-[var(--bg-panel)] p-3" style={{ borderTop: `3px solid ${item.color}` }}>
                      <span className="inline-flex rounded-[2px] border px-2 py-1 font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.06em]" style={{ borderColor: item.color, color: item.color }}>
                        {item.label}
                      </span>
                      <p className="mb-0 mt-3 text-[13px] leading-5 text-[var(--text-secondary)]">{item.detail}</p>
                    </div>
                    {index < liveLoop.length - 1 ? (
                      <span aria-hidden="true" className="flex h-8 shrink-0 items-center justify-center font-mono text-[18px] text-[var(--accent)] min-[900px]:h-auto min-[900px]:w-7">
                        <span className="min-[900px]:hidden">↓</span><span className="hidden min-[900px]:inline">→</span>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="mb-0 mt-5 border-l-2 border-[var(--accent)] pl-4 text-[15px] leading-6 text-[var(--text-primary)]">
                Every output steers the next turn. One conversation = many revolutions of this loop.
              </p>
            </article>

            <div className="grid min-[1280px]:grid-cols-2">
              <article className="border-b border-[var(--border)] px-4 py-8 sm:px-6 lg:px-8 min-[1280px]:border-r">
                <div className="mb-5 flex items-baseline gap-3">
                  <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">LOOP 02</span>
                  <h3 className="m-0 font-[var(--font-display)] text-[22px] font-semibold leading-7">The compile loop</h3>
                </div>
                <LoopSequence items={compileLoop} />
                <p className="mb-0 mt-5 text-[15px] leading-6 text-[var(--text-secondary)]">Human judgment, compiled once, executed by agents every session.</p>
              </article>

              <article className="border-b border-[var(--border)] px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-5 flex items-baseline gap-3">
                  <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">LOOP 03</span>
                  <h3 className="m-0 font-[var(--font-display)] text-[22px] font-semibold leading-7">The learner-model loop</h3>
                </div>
                <LoopSequence items={learnerLoop} />
                <p className="mb-0 mt-5 text-[15px] leading-6 text-[var(--text-secondary)]">What Curio believes is rebuilt continuously — and it can only know what you taught.</p>
              </article>
            </div>

            <aside aria-labelledby="context-boundaries-title" className="border-b border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
              <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Runtime guards</p>
              <h3 id="context-boundaries-title" className="mb-0 mt-2 font-[var(--font-display)] text-[28px] font-semibold leading-8 text-[var(--text-primary)]">Same models. Three different minds.</h3>
              <div className="mt-6 grid border-2 border-[var(--border-strong)] min-[900px]:grid-cols-3">
                <div className="border-l-[3px] border-l-[var(--accent)] p-5">
                  <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">The novice</p>
                  <p className="mb-0 mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">Knowledge-bounded: it cannot use what you have not taught.</p>
                </div>
                <div className="border-t border-[var(--border)] border-l-[3px] border-l-[var(--agent-verifier)] p-5 min-[900px]:border-t-0">
                  <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--agent-verifier)]">The verifier</p>
                  <p className="mb-0 mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">Pack-grounded: it cannot assert beyond the approved contract.</p>
                </div>
                <div className="border-t border-[var(--border)] border-l-[3px] border-l-[var(--agent-curriculum)] p-5 min-[900px]:border-t-0">
                  <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--agent-curriculum)]">The teach-back generator</p>
                  <p className="mb-0 mt-3 text-[15px] leading-6 text-[var(--text-secondary)]">Code-isolated from the answer key: a runtime guard rejects reference-model content from its context.</p>
                </div>
              </div>
            </aside>

            <p className="m-0 px-4 py-4 font-mono text-[12px] leading-5 text-[var(--text-muted)] sm:px-6 lg:px-8">
              5 specialized agents · 2 model tiers · 3 enforced context boundaries · every question carries its recorded reason.
            </p>
          </section>

          <footer className="pt-8 font-mono text-[12px] leading-5 text-[var(--text-muted)]">
            One educator. Thousands of rehearsals. Agents deliver, a human reviews what matters.
          </footer>
        </div>
      </section>
    </main>
  );
}

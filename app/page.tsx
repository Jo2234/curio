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

          <footer className="pt-8 font-mono text-[12px] leading-5 text-[var(--text-muted)]">
            One educator. Thousands of rehearsals. Agents deliver, a human reviews what matters.
          </footer>
        </div>
      </section>
    </main>
  );
}

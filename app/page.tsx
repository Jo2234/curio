import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Teach it. Get questioned. Discover what you missed.",
};

const steps = [
  ["01", "Explain it out loud", "Teach naturally, in your own words."],
  ["02", "Get one sharp question", "Curio listens for what is clear and what may be missing."],
  ["03", "Hear it taught back", "Find out what your explanation made a learner believe."],
] as const;

const minds = [
  ["The Student", "Only knows what you taught it.", "var(--accent)"],
  ["The Fact-checker", "Only trusts the approved syllabus.", "var(--claim-verified)"],
  ["The Mirror", "Never sees the answer key.", "var(--claim-observed)"],
] as const;

const comparisons = [
  ["Chat AI", "Answers your questions. You stay the listener."],
  ["Document AI", "Reads your files and summarizes them for you. You stay the reader."],
  ["Curio", "Makes YOU do the explaining — and shows you exactly what a learner would walk away believing."],
] as const;

export default function Home() {
  return (
    <main>
      <section className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-5 md:py-16 lg:px-8 lg:py-20">
        <div className="grid min-h-[calc(100svh-152px)] content-between">
          <div className="grid items-end gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] xl:gap-20">
            <div>
              <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">The understanding rehearsal</p>
              <h1 className="mt-4 max-w-[1050px] font-[var(--font-display)] text-[clamp(44px,6.2vw,88px)] font-semibold leading-[.98] tracking-[-0.035em] text-[var(--text-primary)]">
                Teach it. Get questioned. Discover what you missed.
              </h1>
            </div>
            <div className="border-l-2 border-[var(--accent)] pl-5 xl:mb-2">
              <p className="m-0 max-w-[560px] text-[18px] leading-7 text-[var(--text-secondary)] sm:text-[20px] sm:leading-8">
                Curio is an AI student that knows nothing until you teach it. It builds a picture of what you actually explained — then teaches it back to you.
              </p>
            </div>
          </div>

          <div className="mt-14 lg:mt-20">
            <div className="grid border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] md:grid-cols-3">
              {steps.map(([number, title, detail], index) => (
                <article key={number} className={`grid min-h-[150px] grid-cols-[48px_1fr] gap-3 px-4 py-6 sm:px-5 ${index ? "border-t border-[var(--border)] md:border-l md:border-t-0" : ""}`}>
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--accent)]">{number}</span>
                  <div>
                    <h2 className="m-0 font-[var(--font-display)] text-[22px] font-semibold leading-7">{title}</h2>
                    <p className="mb-0 mt-3 max-w-[380px] text-[16px] leading-6 text-[var(--text-secondary)]">{detail}</p>
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
              <Link href="/compiler" className="w-fit border-b border-transparent no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">Turn your curriculum into an understanding test →</Link>
              <Link href="/review" className="w-fit border-b border-transparent no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">Teacher review</Link>
            </div>
          </div>
        </div>

        <section aria-labelledby="how-it-works-title" className="mt-20 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] lg:mt-28">
          <header className="border-b-2 border-[var(--border-strong)] px-4 py-8 sm:px-6 lg:px-8">
            <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Three simple steps</p>
            <h2 id="how-it-works-title" className="mb-0 mt-3 font-[var(--font-display)] text-[clamp(34px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.025em] text-[var(--text-primary)]">How it works</h2>
          </header>

          <div className="grid lg:grid-cols-3">
            <article className="flex min-h-[460px] flex-col border-b border-[var(--border)] p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-8">
              <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">01</span>
              <div aria-hidden="true" className="my-8 flex min-h-[150px] items-center justify-center border-y border-[var(--border)] bg-[var(--bg-panel)] px-5">
                <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent)]">
                  <div className="h-[56px] w-[36px] shrink-0 rounded-[18px] border-2 border-[var(--text-primary)]" />
                  <div className="absolute bottom-[12px] h-[16px] w-[48px] rounded-b-full border-b-2 border-x-2 border-[var(--text-primary)]" />
                  <div className="absolute -left-8 flex items-center gap-1"><i className="block h-4 w-[2px] bg-[var(--accent)]" /><i className="block h-8 w-[2px] bg-[var(--accent)]" /><i className="block h-5 w-[2px] bg-[var(--accent)]" /></div>
                  <div className="absolute -right-8 flex items-center gap-1"><i className="block h-5 w-[2px] bg-[var(--accent)]" /><i className="block h-8 w-[2px] bg-[var(--accent)]" /><i className="block h-4 w-[2px] bg-[var(--accent)]" /></div>
                </div>
              </div>
              <h3 className="m-0 font-[var(--font-display)] text-[28px] font-semibold leading-8">You teach it</h3>
              <p className="mb-0 mt-4 text-[18px] leading-7 text-[var(--text-secondary)]">Curio is a student that knows nothing until you explain it. Out loud, in your own words — whiteboard optional.</p>
            </article>

            <article className="flex min-h-[460px] flex-col border-b border-[var(--border)] p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-8">
              <span className="font-mono text-[12px] font-semibold text-[var(--claim-verified)]">02</span>
              <div aria-hidden="true" className="my-8 grid min-h-[150px] content-center gap-2 border-y border-[var(--border)] bg-[var(--bg-panel)] px-4 py-5">
                {[
                  "Your words",
                  "Split into claims",
                  "Checked against the teacher-approved syllabus",
                  "One sharp question back",
                ].map((item, index) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className={`flex min-h-8 flex-1 items-center border px-3 py-2 font-mono text-[11px] font-semibold leading-4 ${index === 3 ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-[var(--border-strong)] text-[var(--text-primary)]"}`}>{item}</span>
                    {index < 3 ? <span className="text-[var(--claim-verified)]">↓</span> : null}
                  </div>
                ))}
              </div>
              <h3 className="m-0 font-[var(--font-display)] text-[28px] font-semibold leading-8">It checks everything you say</h3>
              <p className="mb-0 mt-4 text-[18px] leading-7 text-[var(--text-secondary)]">While you talk, Curio&apos;s team of checkers compares every statement to what the curriculum actually says — then asks the one question most likely to expose a gap.</p>
            </article>

            <article className="flex min-h-[460px] flex-col p-5 sm:p-7 lg:p-8">
              <span className="font-mono text-[12px] font-semibold text-[var(--claim-observed)]">03</span>
              <div aria-hidden="true" className="my-8 grid min-h-[150px] grid-cols-[1fr_36px_1fr] items-center border-y border-[var(--border)] bg-[var(--bg-panel)] px-4 py-5">
                <div className="border-2 border-[var(--accent)] bg-[var(--paper)] p-3 text-center font-[var(--font-display)] text-[15px] font-semibold text-[var(--ink-paper)]">Your lesson</div>
                <div className="text-center font-mono text-[22px] text-[var(--accent)]">⇄</div>
                <div className="border-2 border-[var(--claim-observed)] bg-[var(--bg-evidence)] p-3 text-center font-[var(--font-display)] text-[15px] font-semibold text-[var(--text-primary)]">Curio&apos;s lesson</div>
              </div>
              <h3 className="m-0 font-[var(--font-display)] text-[28px] font-semibold leading-8">Then it teaches it back</h3>
              <p className="mb-0 mt-4 text-[18px] leading-7 text-[var(--text-secondary)]">At the end, Curio explains the topic back using only what YOU taught it. Taught it wrong? It repeats your mistake to your face. The correct answer is locked away from this step — it can&apos;t cheat.</p>
            </article>
          </div>
        </section>

        <section aria-labelledby="three-minds-title" className="mt-20 lg:mt-24">
          <div className="flex items-end justify-between gap-6 border-b-2 border-[var(--border-strong)] pb-5">
            <h2 id="three-minds-title" className="m-0 font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">Three minds, one rule each</h2>
          </div>
          <div className="grid bg-[var(--bg-sunken)] md:grid-cols-3">
            {minds.map(([title, detail, color], index) => (
              <article key={title} className={`min-h-[170px] border-l-[3px] p-6 ${index ? "border-t border-t-[var(--border)] md:border-t-0" : ""}`} style={{ borderLeftColor: color }}>
                <h3 className="m-0 font-[var(--font-display)] text-[23px] font-semibold leading-7" style={{ color }}>{title}</h3>
                <p className="mb-0 mt-4 text-[18px] leading-7 text-[var(--text-secondary)]">{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="not-chatbot-title" className="mt-20 border-y-2 border-[var(--border-strong)] bg-[var(--bg-evidence)] lg:mt-24">
          <header className="px-5 py-8 sm:px-7 lg:px-8">
            <h2 id="not-chatbot-title" className="m-0 font-[var(--font-display)] text-[clamp(34px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.025em]">This is not a chatbot</h2>
          </header>
          <div className="grid border-t border-[var(--border)] md:grid-cols-3">
            {comparisons.map(([title, detail], index) => (
              <article key={title} className={`min-h-[220px] p-6 sm:p-7 ${index ? "border-t border-[var(--border)] md:border-l md:border-t-0" : ""} ${index === 2 ? "border-2 !border-[var(--accent)] bg-[var(--bg-raised)] md:-m-[2px]" : ""}`}>
                <p className={`m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${index === 2 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{title}</p>
                <p className={`mb-0 mt-5 font-[var(--font-display)] text-[22px] font-semibold leading-8 ${index === 2 ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{detail}</p>
              </article>
            ))}
          </div>
          <p className="m-0 border-t-2 border-[var(--border-strong)] px-5 py-7 text-center font-[var(--font-display)] text-[clamp(22px,3vw,32px)] font-semibold leading-tight text-[var(--accent)] sm:px-7">Reading feels like knowing. Explaining proves it.</p>
        </section>

        <footer className="pt-8 font-mono text-[12px] leading-5 text-[var(--text-muted)]">
          One educator. Thousands of rehearsals. Agents deliver, a human reviews what matters.
        </footer>
      </section>
    </main>
  );
}

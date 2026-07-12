"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "teacher" | "student";

interface PackOption {
  id: string;
  title: string;
  subject: string;
  level: string;
  version: string;
  verificationStatus: "ai_generated_draft" | "source_grounded" | "instructor_approved";
}

const comingSoon = ["Cellular Respiration", "Digestive System"];

export default function SetupForm({ packs, initialMode }: { packs: PackOption[]; initialMode: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const selectedPack = packs.find((pack) => pack.id === packId);

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    router.replace(`/setup?mode=${nextMode}`, { scroll: false });
  }

  async function startSession() {
    if (!packId || isStarting) return;
    setIsStarting(true);
    setError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, mode }),
      });
      const result = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok || !result.sessionId) throw new Error(result.error || "The session could not be created.");
      router.push(`/session/${encodeURIComponent(result.sessionId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not be created.");
      setIsStarting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-5 md:py-14 lg:px-8">
      <header className="mb-8 border-b-2 border-[var(--border-strong)] pb-6">
        <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Lesson docket / new session</p>
        <h1 className="mb-0 mt-2 max-w-3xl font-[var(--font-display)] text-[40px] font-semibold leading-[44px] tracking-[-0.02em]">What will you teach Curio?</h1>
        <p className="mb-0 mt-3 max-w-2xl text-[16px] leading-[25px] text-[var(--text-secondary)]">Choose a verified reference and your intent. The novice begins with only the listed prerequisite knowledge.</p>
      </header>

      <div className="grid overflow-hidden rounded-[6px] border-2 border-[var(--border-strong)] bg-[var(--bg-panel)] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-5 sm:p-6 lg:p-8">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[2px] border border-[var(--border-strong)] font-mono text-[12px] font-semibold text-[var(--accent)]">01</span>
              <span><span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Reference pack</span><span className="block font-[var(--font-display)] text-[22px] font-semibold leading-7">Choose the lesson boundary</span></span>
            </legend>

            <div className="grid gap-3">
              {packs.map((pack) => {
                const selected = pack.id === packId;
                return (
                  <label key={pack.id} className={`grid cursor-pointer grid-cols-[20px_1fr_auto] items-start gap-3 rounded-[4px] border p-4 transition-colors duration-150 hover:border-[var(--accent)] hover:bg-[var(--bg-raised)] ${selected ? "border-[var(--accent)] bg-[var(--bg-evidence)]" : "border-[var(--border)]"}`}>
                    <input className="mt-1 h-4 w-4 accent-[var(--accent)]" type="radio" name="pack" value={pack.id} checked={selected} onChange={() => setPackId(pack.id)} />
                    <span className="min-w-0">
                      <span className="block text-[17px] font-semibold leading-6">{pack.title}</span>
                      <span className="mt-1 block text-[14px] leading-5 text-[var(--text-secondary)]">{pack.subject} · {pack.level}</span>
                    </span>
                    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-[2px] border border-[var(--claim-verified)] border-b-[3px] px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--claim-verified)]">
                      <span aria-hidden="true">✓</span>{pack.verificationStatus === "instructor_approved" ? `Instructor-approved v${pack.version}` : `Source-grounded v${pack.version}`}
                    </span>
                  </label>
                );
              })}
              {comingSoon.map((title) => (
                <div key={title} aria-disabled="true" className="grid grid-cols-[20px_1fr_auto] items-center gap-3 rounded-[4px] border border-dashed border-[var(--border)] p-4 text-[var(--text-disabled)]">
                  <span className="h-4 w-4 border border-[var(--text-disabled)]" aria-hidden="true" />
                  <span className="font-semibold">{title}</span>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]">Coming soon</span>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 mt-8 border-0 border-t border-[var(--border)] p-0 pt-7">
            <legend className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[2px] border border-[var(--border-strong)] font-mono text-[12px] font-semibold text-[var(--accent)]">02</span>
              <span><span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Session intent</span><span className="block font-[var(--font-display)] text-[22px] font-semibold leading-7">Choose your role</span></span>
            </legend>
            <div className="grid grid-cols-2 rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)] p-1" role="group" aria-label="Session mode">
              <button type="button" aria-pressed={mode === "teacher"} onClick={() => chooseMode("teacher")} className={`min-h-11 rounded-[2px] border px-3 text-[14px] font-semibold transition-colors ${mode === "teacher" ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)]"}`}>I’m teaching</button>
              <button type="button" aria-pressed={mode === "student"} onClick={() => chooseMode("student")} className={`min-h-11 rounded-[2px] border px-3 text-[14px] font-semibold transition-colors ${mode === "student" ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)]"}`}>Test my understanding</button>
            </div>
          </fieldset>
        </div>

        <aside className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-sunken)] p-5 sm:p-6 lg:border-l-2 lg:border-t-0" aria-label="Session summary">
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Docket summary</p>
          <dl className="mt-5 grid gap-5">
            <div className="border-l-2 border-[var(--accent)] pl-3"><dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Topic</dt><dd className="m-0 mt-1 text-[16px] font-semibold">{selectedPack?.title ?? "No pack available"}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Novice profile</dt><dd className="m-0 mt-1 text-[15px] text-[var(--text-secondary)]">Literal novice · lower secondary</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">Intent</dt><dd className="m-0 mt-1 text-[15px] text-[var(--text-secondary)]">{mode === "teacher" ? "Crash-test my lesson" : "Test my understanding"}</dd></div>
          </dl>

          <div className="mt-8 border-y border-[var(--border)] py-4 text-[13px] leading-5 text-[var(--text-muted)]">
            Audio is processed live and not stored; board captures stay on this device&apos;s session file.
          </div>

          {error ? <p role="alert" className="mb-0 mt-4 text-[14px] leading-5 text-[var(--claim-contradicted)]">{error}</p> : null}
          <button type="button" onClick={() => void startSession()} disabled={!packId || isStarting} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[4px] border-2 border-[var(--accent)] bg-[var(--accent)] px-5 text-[16px] font-semibold text-[var(--ink-on-accent)] transition-colors hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--bg-raised)] disabled:text-[var(--text-disabled)]">
            {isStarting ? "Opening the live room…" : "Start session →"}
          </button>
          <p className="mb-0 mt-3 text-center font-mono text-[11px] text-[var(--text-muted)]">One click. Microphone permission follows.</p>
        </aside>
      </div>
    </main>
  );
}

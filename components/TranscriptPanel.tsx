"use client";

import { useEffect, useRef } from "react";

import type { TranscriptSegment } from "@/lib/types";

function formatTime(tMs: number, startedAtMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((tMs - startedAtMs) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function TranscriptPanel({ segments }: { segments: TranscriptSegment[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const startedAtMs = segments[0]?.tMs ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length]);

  return (
    <section className="curio-panel flex min-h-0 flex-1 flex-col" aria-labelledby="transcript-heading">
      <header className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-5 py-3">
        <h2 id="transcript-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          Live transcript
        </h2>
        <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
          {segments.length} {segments.length === 1 ? "line" : "lines"}
        </span>
      </header>

      <div className="curio-scroll min-h-[280px] flex-1 overflow-y-auto px-5 py-4">
        {segments.length === 0 ? (
          <div className="grid min-h-full place-items-center px-8 text-center">
            <p className="max-w-md font-[var(--font-display)] text-[20px] leading-8 text-[var(--text-secondary)]">
              I’m listening. Start wherever you would start with a new student.
            </p>
          </div>
        ) : (
          <ol className="space-y-5">
            {segments.map((segment) => {
              const isUser = segment.speaker === "user";
              return (
                <li key={segment.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <article className={`max-w-[88%] ${isUser ? "text-right" : "text-left"}`}>
                    <div className={`mb-1.5 flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${isUser ? "text-[var(--text-secondary)]" : "text-[var(--accent)]"}`}>
                        {isUser ? "You" : "Novice"}
                      </span>
                      <time className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
                        {formatTime(segment.tMs, startedAtMs)}
                      </time>
                    </div>
                    <p className={`m-0 border-l-2 px-4 py-2 text-[18px] leading-[30px] text-[var(--text-primary)] ${isUser ? "border-[var(--border-strong)] bg-[var(--bg-raised)]" : "border-[var(--accent)] bg-[var(--bg-evidence)] font-[var(--font-display)]"}`}>
                      {segment.text}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>
    </section>
  );
}

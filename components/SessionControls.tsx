"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import AgentPanel from "@/components/AgentPanel";
import ClaimLedger from "@/components/ClaimLedger";
import ConceptMap from "@/components/ConceptMap";
import TranscriptPanel from "@/components/TranscriptPanel";
import { useSessionStream } from "@/components/useSessionStream";
import VoiceClientImport from "@/components/VoiceClient";
import type { ConceptNode, Misconception, SessionPhase } from "@/lib/types";

const VoiceClient = VoiceClientImport as ComponentType<{
  sessionId: string;
  onNoviceSpeakingChange?: (speaking: boolean) => void;
}>;

const BoardCapture = dynamic(() => import("@/components/BoardCapture"), {
  ssr: false,
  loading: () => <p className="m-0 text-[14px] text-[var(--text-muted)]">Opening board capture…</p>,
}) as ComponentType<{ sessionId?: string; onClose?: () => void }>;

type AdvanceAction = "hint" | "teachback";

interface PackView {
  title: string;
  version: string;
  verificationStatus: "ai_generated_draft" | "source_grounded" | "instructor_approved";
  nodes: ConceptNode[];
  misconceptions: Misconception[];
}

const phaseSteps = [
  { label: "Teach", phases: ["setup", "listening"] },
  { label: "Probe", phases: ["questioning", "repair", "transfer"] },
  { label: "Teach-back", phases: ["teachback"] },
  { label: "Examine", phases: ["report", "complete"] },
] as const;

function phaseIndex(phase: SessionPhase): number {
  return Math.max(0, phaseSteps.findIndex((step) => (step.phases as readonly string[]).includes(phase)));
}

function VerificationBadge({ pack }: { pack: PackView }) {
  const label = pack.verificationStatus === "instructor_approved"
    ? `Instructor-approved v${pack.version}`
    : pack.verificationStatus === "source_grounded"
      ? `Source-grounded v${pack.version}`
      : `Draft v${pack.version}`;
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border border-[var(--claim-verified)] border-b-[3px] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--claim-verified)]">
      <span aria-hidden="true">✓</span>{label}
    </span>
  );
}

function PhaseTrack({ phase }: { phase: SessionPhase }) {
  const active = phaseIndex(phase);
  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label="Session phase">
      {phaseSteps.map((step, index) => (
        <span
          key={step.label}
          className={`inline-flex h-8 items-center gap-2 rounded-full border-2 px-3 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${index === active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          aria-current={index === active ? "step" : undefined}
        >
          {index === active ? <span className="h-1.5 w-1.5 bg-current" aria-hidden="true" /> : null}
          {step.label}
        </span>
      ))}
    </nav>
  );
}

function NovicePresence({ speaking }: { speaking: boolean }) {
  return (
    <div className="curio-panel flex min-h-[92px] items-center gap-5 px-5 py-4">
      <div className={`novice-orb grid h-14 w-14 shrink-0 place-items-center border-2 ${speaking ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-[var(--border-strong)] bg-[var(--bg-sunken)] text-[var(--text-secondary)]"}`} aria-hidden="true">
        <svg viewBox="0 0 32 32" className="h-8 w-8 fill-none stroke-current" strokeWidth="1.5">
          <circle cx="16" cy="12" r="5" /><path d="M7 27c1.5-6 4.5-9 9-9s7.5 3 9 9" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Novice</span>
          <span className={`speaking-bars inline-flex h-4 items-end gap-[3px] ${speaking ? "is-speaking" : ""}`} aria-label={speaking ? "Novice is speaking" : "Novice is listening"}>
            <i /><i /><i />
          </span>
        </div>
        <p className="m-0 mt-1 text-[16px] text-[var(--text-secondary)]">{speaking ? "Working the idea through aloud…" : "Listening for the shape of your explanation."}</p>
      </div>
    </div>
  );
}

export default function SessionControls({ sessionId, phase, onAdvance }: { sessionId: string; phase: SessionPhase; onAdvance?: (action: AdvanceAction) => Promise<void> }) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [pending, setPending] = useState<AdvanceAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localAdvance = useCallback(async (action: AdvanceAction) => {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) throw new Error("The session could not advance. Try once more.");
  }, [sessionId]);

  const run = async (action: AdvanceAction) => {
    setPending(action);
    setError(null);
    try {
      await (onAdvance ?? localAdvance)(action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not advance.");
    } finally {
      setPending(null);
    }
  };

  if (phase === "report" || phase === "complete") {
    return (
      <Link href={`/report/${encodeURIComponent(sessionId)}`} className="inline-flex min-h-12 items-center justify-center border-2 border-[var(--accent)] bg-[var(--accent)] px-5 text-[16px] font-semibold text-[var(--ink-on-accent)] no-underline hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
        View report →
      </Link>
    );
  }

  return (
    <section className="curio-panel px-4 py-3" aria-label="Session controls">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="curio-button" onClick={() => setBoardOpen((open) => !open)} aria-expanded={boardOpen}>
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="3" width="15" height="12" /><path d="m5 13 3-3 2.5 2 2.5-3 2 4M7 17h6" /></svg>
          Capture board
        </button>
        <button type="button" className="curio-button" onClick={() => void run("hint")} disabled={pending !== null}>
          {pending === "hint" ? "Preparing hint…" : "Hint"}
        </button>
        <button type="button" className="curio-button curio-button-primary ml-auto" onClick={() => void run("teachback")} disabled={pending !== null}>
          {pending === "teachback" ? "Starting teach-back…" : "Finish & teach-back"}
        </button>
      </div>
      {boardOpen ? <div className="mt-3 border-t border-[var(--border)] pt-3"><BoardCapture sessionId={sessionId} onClose={() => setBoardOpen(false)} /></div> : null}
      {error ? <p role="alert" className="m-0 mt-2 text-[14px] text-[var(--claim-contradicted)]">{error}</p> : null}
    </section>
  );
}

export function SessionRoom({ sessionId, pack }: { sessionId: string; pack: PackView }) {
  const stream = useSessionStream(sessionId);
  const [presentationMode, setPresentationMode] = useState(true);
  const [noviceSpeaking, setNoviceSpeaking] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => setNoviceSpeaking(Boolean((event as CustomEvent<{ speaking?: boolean }>).detail?.speaking));
    window.addEventListener("curio:novice-speaking", listener);
    return () => window.removeEventListener("curio:novice-speaking", listener);
  }, []);

  useEffect(() => {
    const latest = stream.segments.at(-1);
    if (latest?.speaker !== "novice") return;
    setNoviceSpeaking(true);
    const timer = window.setTimeout(() => setNoviceSpeaking(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [stream.segments]);

  const misconceptionNames = useMemo(() => new Map(pack.misconceptions.map((item) => [item.id, item.statement])), [pack.misconceptions]);
  const misconceptionTitles = useMemo(() => Object.fromEntries(misconceptionNames), [misconceptionNames]);
  const findings = useMemo(() => stream.findings.map((finding) => {
    if (finding.title) return finding;
    const claim = stream.claims.find((item) => finding.claimIds.includes(item.id));
    const title = claim?.misconceptionId ? misconceptionNames.get(claim.misconceptionId) : undefined;
    return title ? { ...finding, title } : finding;
  }), [misconceptionNames, stream.claims, stream.findings]);

  const advance = useCallback(async (action: AdvanceAction) => {
    setAdvanceError(null);
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      const message = body?.error || "The session could not advance. Try once more.";
      setAdvanceError(message);
      throw new Error(message);
    }
  }, [sessionId]);

  const teachbackActive = stream.phase === "teachback";
  const reportActive = stream.phase === "report" || stream.phase === "complete";

  return (
    <main className="curio-room min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <style jsx global>{`
        .curio-room {
          --bg-canvas:#0d1714;--bg-panel:#14231e;--bg-raised:#1c3029;--bg-evidence:#10201b;--bg-sunken:#09110f;
          --paper:#f0e4bf;--ink-paper:#182019;--text-primary:#f4eedb;--text-secondary:#c9d2ca;--text-muted:#9eaea3;
          --text-disabled:#728078;--ink-on-accent:#182019;--border:#385047;--border-strong:#6f8479;--shadow-hard:#050b09;
          --focus:#f6cf79;--accent:#e6b85c;--accent-hover:#f0c970;--claim-observed:#72a7bd;--claim-verified:#6fb18b;
          --claim-contradicted:#d96c5f;--claim-uncertain:#e6b85c;--concept-established:#7fc29a;--concept-misconceived:#e17b6f;
          --concept-assisted:#79adc2;--concept-missing:#91a198;--concept-assumed:#d4a956;--agent-claim:#74a9bd;
          --agent-verifier:#72b18c;--agent-jargon:#d0a85d;--agent-question:#d98568;--agent-concept:#9b91c1;--agent-curriculum:#82aaa0;
          --font-display:"Bitter",Georgia,serif;--font-sans:"IBM Plex Sans",Arial,sans-serif;--font-mono:"IBM Plex Mono",Consolas,monospace;
          font-family:var(--font-sans); background-color:var(--bg-canvas); background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 31px,rgba(244,238,219,.06) 32px);
        }
        .curio-panel{border:1px solid var(--border);border-radius:6px;background:var(--bg-panel)}
        .curio-scroll{scrollbar-width:thin;scrollbar-color:var(--border-strong) var(--bg-sunken)}
        .curio-button{display:inline-flex;min-height:40px;align-items:center;gap:8px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-raised);padding:8px 12px;color:var(--text-primary);font:600 14px/20px var(--font-sans);cursor:pointer}
        .curio-button:hover{border-color:var(--accent)}.curio-button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.curio-button:disabled{cursor:wait;opacity:.6}
        .curio-button-primary{border:2px solid var(--accent);background:var(--accent);color:var(--ink-on-accent)}.curio-button-primary:hover{background:var(--accent-hover)}
        .voice-mount:empty::before{display:block;padding:8px 4px;color:var(--text-muted);font-size:14px;content:"Voice controls are connecting…"}
        .novice-orb{border-radius:50%;transition:background 150ms cubic-bezier(.2,0,0,1),border-color 150ms cubic-bezier(.2,0,0,1)}
        .speaking-bars i{display:block;width:3px;height:4px;background:var(--accent);transition:height 150ms cubic-bezier(.2,0,0,1)}
        .speaking-bars.is-speaking i{animation:curio-speaking 900ms linear infinite}.speaking-bars.is-speaking i:nth-child(2){animation-delay:150ms}.speaking-bars.is-speaking i:nth-child(3){animation-delay:300ms}
        .agent-event{animation:curio-enter 220ms cubic-bezier(.2,0,0,1) both}.agent-rule{animation:curio-rule 180ms cubic-bezier(.2,0,0,1) both}
        .claim-row{transition:border-color 180ms cubic-bezier(.2,0,0,1),background 180ms cubic-bezier(.2,0,0,1)}
        .concept-pill{animation:curio-concept 280ms cubic-bezier(.2,0,0,1) both;position:relative}
        .concept-pill[data-state="unvisited"]{border-color:var(--border);color:var(--text-muted);background:var(--bg-sunken)}
        .concept-pill[data-state="established"]{border-color:var(--concept-established);background:var(--concept-established);color:var(--ink-on-accent);box-shadow:inset 0 0 0 1px var(--bg-canvas)}
        .concept-pill[data-state="assisted"]{border-color:var(--concept-assisted);background:var(--concept-assisted);color:var(--ink-on-accent)}
        .concept-pill[data-state="misconceived"]{border-color:var(--concept-misconceived);background:var(--concept-misconceived);color:var(--ink-on-accent);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
        .concept-pill[data-state="missing"]{border-style:dashed;border-color:var(--concept-missing);color:var(--text-secondary);background:transparent}
        .concept-pill[data-state="assumed"]{border-color:var(--concept-assumed);color:var(--text-primary);background:repeating-linear-gradient(135deg,rgba(212,169,86,.32) 0,rgba(212,169,86,.32) 3px,var(--bg-panel) 3px,var(--bg-panel) 7px)}
        .concept-pill[data-state="fragile"]{border-style:dashed;border-color:var(--claim-uncertain);color:var(--claim-uncertain);background:var(--bg-sunken)}
        .concept-pill[data-state="out_of_scope"]{border-color:var(--border);color:var(--text-disabled);background:transparent;opacity:.65}
        @keyframes curio-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes curio-rule{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes curio-concept{0%{transform:scaleX(.94)}100%{transform:scaleX(1)}}
        @keyframes curio-speaking{0%,100%{height:4px}35%{height:14px}70%{height:8px}}
        @media (prefers-reduced-motion:reduce){.agent-event,.agent-rule,.concept-pill,.speaking-bars.is-speaking i{animation:none!important;scroll-behavior:auto!important}}
      `}</style>

      <header className="border-b-2 border-[var(--border-strong)] bg-[var(--bg-panel)] px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-[var(--font-display)] text-[24px] font-semibold text-[var(--accent)]">Curio</span>
              <span className="h-6 w-px bg-[var(--border-strong)]" aria-hidden="true" />
              <h1 className="m-0 truncate text-[20px] font-semibold leading-7">{pack.title}</h1>
              <VerificationBadge pack={pack} />
            </div>
          </div>
          <PhaseTrack phase={stream.phase} />
          <button type="button" role="switch" aria-checked={presentationMode} className="curio-button" onClick={() => setPresentationMode((enabled) => !enabled)}>
            <span className={`h-3 w-3 border ${presentationMode ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--text-muted)]"}`} aria-hidden="true" />
            Presentation mode
          </button>
          {!reportActive ? <button type="button" className="curio-button curio-button-primary" onClick={() => void advance("teachback").catch(() => undefined)}>Finish</button> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-3 px-4 py-3 md:px-5 lg:px-8">
        {teachbackActive ? (
          <div className="border-l-[3px] border-[var(--accent)] bg-[var(--bg-evidence)] px-5 py-3 text-[18px] leading-7 text-[var(--text-primary)]">
            The novice is now explaining back what it learned — interrupt if it’s wrong.
          </div>
        ) : stream.phase === "listening" || stream.phase === "setup" ? (
          <div className="border-l-[3px] border-[var(--accent)] bg-[var(--bg-evidence)] px-5 py-2 text-[16px] text-[var(--text-secondary)]">Teach freely. I’ll wait for the idea to take shape.</div>
        ) : null}
        {advanceError ? <p role="alert" className="m-0 border-l-[3px] border-[var(--claim-contradicted)] bg-[var(--bg-evidence)] px-5 py-2 text-[14px] text-[var(--claim-contradicted)]">{advanceError}</p> : null}
        <ConceptMap nodes={pack.nodes} conceptStates={stream.conceptStates} />
        <div className={`grid min-h-0 gap-3 ${presentationMode ? "xl:grid-cols-12" : "grid-cols-1"}`}>
          <div className={`${presentationMode ? "xl:col-span-6" : ""} flex min-h-[590px] min-w-0 flex-col gap-3`}>
            <NovicePresence speaking={noviceSpeaking} />
            <div className="voice-mount curio-panel px-4 py-2"><VoiceClient sessionId={sessionId} onNoviceSpeakingChange={setNoviceSpeaking} /></div>
            <TranscriptPanel segments={stream.segments} />
            <SessionControls sessionId={sessionId} phase={stream.phase} onAdvance={advance} />
          </div>
          {presentationMode ? (
            <>
              <div className="min-h-[590px] min-w-0 xl:col-span-3"><AgentPanel agentEvents={stream.agentEvents} directives={stream.directives} /></div>
              <div className="min-h-[590px] min-w-0 xl:col-span-3"><ClaimLedger claims={stream.claims} findings={findings} misconceptionTitles={misconceptionTitles} /></div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

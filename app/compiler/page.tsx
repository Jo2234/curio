"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CompiledPackDraft,
  CompilerResult,
  ScopeLabel,
} from "@/lib/agents/compiler";

const progressLabels = [
  "Parsing source…",
  "Extracting learning outcomes…",
  "Mapping concepts…",
  "Generating misconception probes…",
  "Running pack critic…",
] as const;

const scopeCopy: Record<ScopeLabel, string> = {
  required: "Required",
  assumed_prerequisite: "Assumed prerequisite",
  acceptable_simplification: "Acceptable simplification",
  out_of_scope: "Out of scope",
};

function quote(value: string) {
  return value.replace(/^['“”"]+|['“”"]+$/g, "");
}

export default function CompilerPage() {
  const [sourceText, setSourceText] = useState("");
  const [sourceRole, setSourceRole] = useState("Scope authority (syllabus)");
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState<{ approvedBy: string; approvedAt: string } | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!isCompiling) return;
    const interval = window.setInterval(() => {
      setProgressStage((stage) => Math.min(stage + 1, progressLabels.length - 1));
    }, 850);
    return () => window.clearInterval(interval);
  }, [isCompiling]);

  const sourceLines = useMemo(
    () => sourceText.split("\n").filter((line) => line.trim()).length,
    [sourceText],
  );

  async function loadSample() {
    setIsLoadingSample(true);
    setError("");
    try {
      const response = await fetch("/api/compiler?sample=1", { cache: "no-store" });
      const data = (await response.json()) as { source?: string; error?: string };
      if (!response.ok || !data.source) throw new Error(data.error || "Sample unavailable.");
      setSourceText(data.source);
      setResult(null);
      setApproval(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The sample could not be loaded.");
    } finally {
      setIsLoadingSample(false);
    }
  }

  async function compile(event: FormEvent) {
    event.preventDefault();
    if (!sourceText.trim() || isCompiling) return;
    setIsCompiling(true);
    setProgressStage(0);
    setError("");
    setResult(null);
    setApproval(null);

    try {
      const response = await fetch("/api/compiler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText, sourceRole }),
      });
      const data = (await response.json()) as CompilerResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "Compilation stopped unexpectedly.");
      setProgressStage(progressLabels.length);
      setResult(data);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Compilation stopped unexpectedly.");
    } finally {
      setIsCompiling(false);
    }
  }

  async function approve(draft: CompiledPackDraft) {
    setIsApproving(true);
    setError("");
    try {
      const response = await fetch("/api/compiler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, approvedBy: "Instructor" }),
      });
      const data = (await response.json()) as {
        approvedBy?: string;
        approvedAt?: string;
        error?: string;
      };
      if (!response.ok || !data.approvedBy || !data.approvedAt) {
        throw new Error(data.error || "Approval could not be saved.");
      }
      setApproval({ approvedBy: data.approvedBy, approvedAt: data.approvedAt });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Approval could not be saved.");
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <main className="compiler-shell">
      <header className="docket-header">
        <div>
          <Link className="wordmark" href="/">Curio</Link>
          <p className="eyebrow-local">Knowledge pack compiler / proof desk</p>
          <h1>Turn a syllabus into evidence you can inspect.</h1>
          <p className="lede">
            Paste curriculum text. Curio maps its claims, limits, and likely teaching traps into a draft an instructor can approve.
          </p>
        </div>
        <div className="folio" aria-label="Draft status">
          <span>Folio</span>
          <strong>PACK / DRAFT</strong>
          <small>Pasted text only</small>
        </div>
      </header>

      <form onSubmit={compile} className="proof-grid">
        <section className="proof-column source-column" aria-labelledby="source-heading">
          <div className="column-heading">
            <span className="column-number">01</span>
            <div>
              <p>Source</p>
              <h2 id="source-heading">Curriculum copy</h2>
            </div>
          </div>

          <label className="field-label" htmlFor="source-role">Source role</label>
          <select
            id="source-role"
            value={sourceRole}
            onChange={(event) => setSourceRole(event.target.value)}
            disabled={isCompiling}
          >
            <option>Scope authority (syllabus)</option>
            <option>Reference material</option>
            <option>Instructor notes</option>
          </select>

          <div className="source-toolbar">
            <span>{sourceLines ? `${sourceLines} source lines` : "No source loaded"}</span>
            <button type="button" className="text-button" onClick={loadSample} disabled={isLoadingSample || isCompiling}>
              {isLoadingSample ? "Loading source…" : "Load sample syllabus"}
            </button>
          </div>
          <label className="sr-only" htmlFor="syllabus-source">Syllabus excerpt</label>
          <textarea
            id="syllabus-source"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="Paste a syllabus excerpt here…"
            disabled={isCompiling}
          />
          <button className="compile-button" type="submit" disabled={!sourceText.trim() || isCompiling}>
            {isCompiling ? "Compiling proof…" : "Compile pack"}
          </button>
        </section>

        <section className="proof-column concepts-column" aria-labelledby="concepts-heading">
          <div className="column-heading">
            <span className="column-number">02</span>
            <div>
              <p>Extraction</p>
              <h2 id="concepts-heading">Objectives & concepts</h2>
            </div>
          </div>

          {!result ? (
            <ProgressDocket active={isCompiling} progressStage={progressStage} />
          ) : (
            <>
              <ProgressDocket active progressStage={progressLabels.length} complete />
              <SectionRule label={`${result.draft.objectives.length} learning objectives`} />
              <div className="card-stack">
                {result.draft.objectives.map((objective) => (
                  <article className="draft-card objective-card" key={objective.id}>
                    <div className="card-meta">
                      <span>{objective.id}</span>
                      <span>Draft field</span>
                    </div>
                    <h3>{objective.statement}</h3>
                    <blockquote>
                      <span>from syllabus:</span> &lsquo;{quote(objective.sourceQuote)}&rsquo;
                    </blockquote>
                  </article>
                ))}
              </div>

              <SectionRule label={`${result.draft.nodes.length} mapped concepts`} />
              <div className="concept-list">
                {result.draft.nodes.map((node) => (
                  <article className="draft-card concept-card" key={node.id}>
                    <div className="concept-title">
                      <h3>{node.name}</h3>
                      <ScopeChip scope={node.scopeLabel} />
                    </div>
                    <p>{node.definition}</p>
                    <div className="card-meta">
                      <span>{node.id}</span>
                      <span>{node.importance}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="proof-column exceptions-column" aria-labelledby="exceptions-heading">
          <div className="column-heading">
            <span className="column-number">03</span>
            <div>
              <p>Exceptions</p>
              <h2 id="exceptions-heading">Review margin</h2>
            </div>
          </div>

          {error && <div className="error-panel" role="alert">{error}</div>}

          {!result ? (
            <div className="empty-margin">
              <span className="margin-mark">?</span>
              <h3>Waiting for a source</h3>
              <p>Scope exceptions, misconception probes, and critic notes will collect here.</p>
            </div>
          ) : (
            <ReviewMargin result={result} approval={approval} isApproving={isApproving} onApprove={approve} />
          )}
        </aside>
      </form>

      <style jsx global>{`
        .compiler-shell {
          --bg-canvas: #0d1714; --bg-panel: #14231e; --bg-raised: #1c3029; --bg-evidence: #10201b;
          --paper: #f0e4bf; --ink-paper: #182019; --text-primary: #f4eedb; --text-secondary: #c9d2ca;
          --text-muted: #9eaea3; --border: #385047; --border-strong: #6f8479; --accent: #e6b85c;
          --accent-hover: #f0c970; --focus: #f6cf79; --attention: #e6b85c; --verified: #6fb18b;
          min-height: 100vh; padding: 32px; color: var(--text-primary); font-family: "IBM Plex Sans", Arial, sans-serif;
          background-color: var(--bg-canvas); background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(244,238,219,.06) 32px);
        }
        .docket-header { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 48px; align-items: end; max-width: 1600px; margin: 0 auto 32px; padding-bottom: 24px; border-bottom: 2px solid var(--border-strong); }
        .wordmark { color: var(--accent); font: 650 22px/28px Bitter, Georgia, serif; text-decoration: none; }
        .eyebrow-local, .column-heading p { margin: 8px 0 0; color: var(--text-secondary); font: 650 12px/16px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
        h1 { max-width: 850px; margin: 10px 0 8px; font: 650 40px/44px Bitter, Georgia, serif; letter-spacing: -.02em; }
        .lede { max-width: 760px; margin: 0; color: var(--text-secondary); font-size: 16px; line-height: 25px; }
        .folio { min-width: 190px; border-left: 2px solid var(--accent); padding: 10px 0 10px 16px; font-family: "IBM Plex Mono", monospace; }
        .folio span, .folio small { display: block; color: var(--text-secondary); font-size: 12px; line-height: 18px; }
        .folio strong { display: block; margin: 4px 0; font-size: 13px; letter-spacing: .06em; }
        .proof-grid { display: grid; grid-template-columns: minmax(280px, 3fr) minmax(440px, 5fr) minmax(300px, 4fr); max-width: 1600px; margin: 0 auto; border: 1px solid var(--border); background: var(--bg-panel); }
        .proof-column { min-width: 0; padding: 20px; }
        .proof-column + .proof-column { border-left: 2px solid var(--border-strong); }
        .column-heading { display: flex; align-items: center; gap: 12px; min-height: 52px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
        .column-heading p { margin: 0; }
        .column-heading h2 { margin: 2px 0 0; font: 650 22px/28px Bitter, Georgia, serif; }
        .column-number { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid var(--border-strong); border-radius: 2px; color: var(--accent); font: 650 12px/18px "IBM Plex Mono", monospace; }
        .field-label { display: block; margin-bottom: 6px; color: var(--text-secondary); font: 650 12px/16px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
        select, textarea { width: 100%; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--text-primary); background: #09110f; font: 450 14px/21px "IBM Plex Sans", sans-serif; }
        select { height: 42px; padding: 0 12px; }
        textarea { min-height: 520px; resize: vertical; padding: 14px; font-family: "IBM Plex Mono", monospace; line-height: 21px; }
        select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
        .source-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; min-height: 48px; color: var(--text-secondary); font: 500 12px/18px "IBM Plex Mono", monospace; }
        button { font: inherit; }
        .text-button { padding: 4px 0; border: 0; border-bottom: 1px solid var(--accent); color: var(--accent); background: transparent; cursor: pointer; }
        .compile-button { width: 100%; min-height: 46px; margin-top: 12px; border: 2px solid var(--accent); border-radius: 4px; color: var(--ink-paper); background: var(--accent); font-weight: 700; cursor: pointer; }
        .compile-button:hover:not(:disabled), .approve-button:hover:not(:disabled) { background: var(--accent-hover); }
        button:disabled, textarea:disabled, select:disabled { opacity: .58; cursor: not-allowed; }
        .progress-docket { margin-top: 32px; border-block: 2px solid var(--border-strong); background: var(--bg-evidence); }
        .progress-intro { margin: 0; padding: 20px; color: var(--text-secondary); font-size: 16px; line-height: 25px; border-bottom: 1px solid var(--border); }
        .progress-list { list-style: none; margin: 0; padding: 0; }
        .progress-list li { display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; min-height: 58px; padding: 10px 16px; border-bottom: 1px solid var(--border); color: var(--text-secondary); animation: enter 220ms cubic-bezier(.2,0,0,1); }
        .progress-index, .card-meta { color: var(--text-secondary); font: 500 12px/18px "IBM Plex Mono", monospace; }
        .progress-state { color: var(--accent); font: 650 12px/18px "IBM Plex Mono", monospace; }
        .section-rule { display: flex; gap: 10px; align-items: center; margin: 24px 0 12px; color: var(--text-secondary); font: 650 12px/16px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
        .section-rule::after { content: ""; flex: 1; border-top: 1px solid var(--border); }
        .card-stack, .concept-list { display: grid; gap: 10px; }
        .draft-card { position: relative; padding: 16px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-evidence); }
        .draft-card::after { content: ""; position: absolute; top: 9px; right: 9px; width: 8px; height: 8px; border-top: 1px solid var(--text-muted); border-right: 1px solid var(--text-muted); }
        .card-meta { display: flex; justify-content: space-between; gap: 16px; text-transform: uppercase; }
        .draft-card h3 { margin: 8px 0 0; color: var(--text-primary); font-size: 16px; line-height: 23px; }
        .objective-card { border-left: 2px solid var(--accent); }
        blockquote { margin: 14px 0 0; padding: 10px 12px; border-left: 2px solid var(--accent); color: var(--text-secondary); background: var(--bg-panel); font: 500 14px/21px Bitter, Georgia, serif; }
        blockquote span { display: block; color: var(--text-secondary); font: 500 11px/16px "IBM Plex Mono", monospace; text-transform: uppercase; }
        .concept-title { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
        .concept-title h3 { margin: 0; }
        .concept-card > p { margin: 8px 0 12px; max-width: none; color: var(--text-secondary); font-size: 14px; line-height: 21px; }
        .scope-chip { display: inline-flex; flex: none; align-items: center; gap: 6px; min-height: 26px; padding: 3px 7px; border: 1px solid currentColor; border-radius: 2px; font: 650 10px/16px "IBM Plex Mono", monospace; letter-spacing: .04em; text-transform: uppercase; }
        .scope-chip::before { content: ""; width: 7px; height: 7px; border: 1px solid currentColor; }
        .scope-required { color: #7fc29a; border-bottom-width: 2px; }
        .scope-assumed_prerequisite { color: #e6b85c; border-style: dashed; background-image: repeating-linear-gradient(135deg,transparent 0,transparent 4px,rgba(230,184,92,.12) 4px,rgba(230,184,92,.12) 6px); }
        .scope-acceptable_simplification { color: #79adc2; }
        .scope-out_of_scope { color: #d96c5f; border-left-width: 3px; }
        .empty-margin { margin-top: 32px; padding: 24px 20px; border-block: 2px solid var(--border-strong); border-left: 2px solid var(--accent); background: var(--bg-evidence); }
        .margin-mark { display: grid; width: 32px; height: 32px; place-items: center; border: 1px dashed var(--accent); color: var(--accent); font: 650 14px/20px "IBM Plex Mono", monospace; }
        .empty-margin h3 { margin: 16px 0 5px; font: 650 18px/24px Bitter, Georgia, serif; }
        .empty-margin p { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 21px; }
        .error-panel { margin-bottom: 16px; padding: 14px; border: 1px solid #d96c5f; border-left-width: 3px; color: #f4d2cd; background: #281b18; font-size: 14px; line-height: 21px; }
        .review-section { margin-bottom: 22px; }
        .review-section h3 { margin: 0 0 10px; color: var(--text-secondary); font: 650 12px/16px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
        .term-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .term { padding: 5px 8px; border: 1px solid var(--border-strong); border-radius: 2px; color: var(--text-secondary); background: var(--bg-evidence); font-size: 13px; line-height: 18px; }
        .probe-card, .exclusion-row { margin-bottom: 8px; padding: 12px; border: 1px solid var(--border); background: var(--bg-evidence); }
        .probe-card { border-left: 3px solid #d96c5f; }
        .probe-card strong { display: block; font-size: 14px; line-height: 21px; }
        .probe-card p { margin: 7px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 20px; }
        .probe-card p span { color: var(--accent); }
        .exclusion-row { display: grid; grid-template-columns: 18px 1fr; gap: 8px; color: var(--text-secondary); font-size: 13px; line-height: 20px; }
        .exclusion-row span:first-child { color: #d96c5f; font-family: "IBM Plex Mono", monospace; }
        .critic-panel { margin: 20px 0; padding: 16px; border: 2px solid var(--attention); border-left-width: 4px; background: #2b2618; }
        .critic-panel h3 { margin: 0 0 10px; color: var(--attention); font: 650 12px/16px "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
        .critic-panel ul { margin: 0; padding-left: 18px; color: #eee1bd; font-size: 14px; line-height: 21px; }
        .critic-panel li + li { margin-top: 8px; }
        .approval-docket { padding-top: 18px; border-top: 2px solid var(--border-strong); }
        .verification-badge { display: inline-flex; min-height: 28px; align-items: center; gap: 7px; padding: 4px 8px; border: 1px dashed var(--attention); border-radius: 2px; color: var(--attention); font: 650 11px/16px "IBM Plex Mono", monospace; letter-spacing: .06em; text-transform: uppercase; }
        .verification-badge::before { content: "?"; display: grid; width: 14px; height: 14px; place-items: center; border: 1px solid currentColor; }
        .verification-badge.approved { color: var(--verified); border-style: solid; border-bottom-width: 3px; }
        .verification-badge.approved::before { content: "✓"; }
        .attribution { margin: 8px 0 14px; color: var(--text-secondary); font: 500 12px/18px "IBM Plex Mono", monospace; }
        .approve-button, .session-link { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; border-radius: 4px; font-weight: 700; text-decoration: none; }
        .approve-button { border: 2px solid var(--accent); color: var(--ink-paper); background: var(--accent); cursor: pointer; }
        .session-link { margin-top: 8px; border: 1px solid var(--verified); color: var(--verified); background: transparent; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @keyframes enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .progress-list li { animation: none; } }
        @media (max-width: 1080px) { .proof-grid { grid-template-columns: minmax(280px, 2fr) minmax(400px, 3fr); } .exceptions-column { grid-column: 1 / -1; border-left: 0 !important; border-top: 2px solid var(--border-strong); } }
        @media (max-width: 720px) { .compiler-shell { padding: 16px; } .docket-header { grid-template-columns: 1fr; gap: 16px; } h1 { font-size: 30px; line-height: 36px; } .folio { display: none; } .proof-grid { display: block; } .proof-column + .proof-column { border-left: 0; border-top: 2px solid var(--border-strong); } textarea { min-height: 360px; } .concept-title { display: block; } .scope-chip { margin-top: 8px; } }
      `}</style>
    </main>
  );
}

function ProgressDocket({ active, progressStage, complete = false }: { active: boolean; progressStage: number; complete?: boolean }) {
  if (!active) {
    return (
      <div className="empty-margin">
        <span className="margin-mark">→</span>
        <h3>The extraction desk is clear</h3>
        <p>Load the sample or paste a source, then compile a structured draft.</p>
      </div>
    );
  }

  return (
    <div className="progress-docket" aria-live="polite">
      <p className="progress-intro">
        {complete ? "The draft is assembled. Its evidence trail is ready for review." : "Curio is assembling the draft and checking its evidence trail."}
      </p>
      <ol className="progress-list">
        {progressLabels.map((label, index) =>
          index <= progressStage ? (
            <li key={label}>
              <span className="progress-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{label}</span>
              <span className="progress-state">{complete || index < progressStage ? "✓" : "IN REVIEW"}</span>
            </li>
          ) : null,
        )}
      </ol>
    </div>
  );
}

function SectionRule({ label }: { label: string }) {
  return <div className="section-rule">{label}</div>;
}

function ScopeChip({ scope }: { scope: ScopeLabel }) {
  return <span className={`scope-chip scope-${scope}`}>{scopeCopy[scope]}</span>;
}

function ReviewMargin({
  result,
  approval,
  isApproving,
  onApprove,
}: {
  result: CompilerResult;
  approval: { approvedBy: string; approvedAt: string } | null;
  isApproving: boolean;
  onApprove: (draft: CompiledPackDraft) => void;
}) {
  return (
    <>
      <section className="review-section">
        <h3>Required vocabulary</h3>
        <div className="term-list">
          {result.draft.vocabulary.map((term) => <span className="term" key={term}>{term}</span>)}
        </div>
      </section>

      <section className="review-section">
        <h3>Misconception probes</h3>
        {result.draft.misconceptions.map((misconception) => (
          <article className="probe-card" key={misconception.statement}>
            <strong>{misconception.statement}</strong>
            <p><span>Counter-question:</span> {misconception.counterQuestion}</p>
          </article>
        ))}
      </section>

      <section className="review-section">
        <h3>Scope exclusions</h3>
        {result.draft.exclusions.length ? result.draft.exclusions.map((exclusion) => (
          <div className="exclusion-row" key={exclusion}><span>×</span><span>{exclusion}</span></div>
        )) : <div className="exclusion-row"><span>—</span><span>No explicit exclusions extracted.</span></div>}
      </section>

      <section className="critic-panel" aria-labelledby="critic-heading">
        <h3 id="critic-heading">Pack critic / {result.warnings.length} exceptions</h3>
        <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </section>

      <section className="approval-docket">
        <span className={`verification-badge${approval ? " approved" : ""}`}>
          {approval ? "Instructor-approved" : "AI-generated draft"}
        </span>
        <p className="attribution">
          {approval
            ? `${approval.approvedBy} · ${new Date(approval.approvedAt).toLocaleString()}`
            : "Awaiting named human judgment"}
        </p>
        {!approval ? (
          <button type="button" className="approve-button" onClick={() => onApprove(result.draft)} disabled={isApproving}>
            {isApproving ? "Recording approval…" : "Approve as instructor"}
          </button>
        ) : (
          <Link className="session-link" href="/setup">Use in a session →</Link>
        )}
      </section>
    </>
  );
}

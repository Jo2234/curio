import { readFile } from "node:fs/promises";
import path from "node:path";

import { notFound } from "next/navigation";

import ReportView from "@/components/ReportView";
import { assembleReport, type SessionReport } from "@/lib/agents/reportComposer";
import { loadPack } from "@/lib/packs";
import { getSessionState, type SessionState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SnapshotWithReport = SessionState & {
  report?: SessionReport;
  session: SessionState["session"] & { report?: SessionReport };
};

const sessionIdPattern = /^[a-zA-Z0-9_-]+$/;

async function loadSnapshot(id: string): Promise<SnapshotWithReport | undefined> {
  if (!sessionIdPattern.test(id)) return undefined;
  try {
    const file = path.join(process.cwd(), "data", "sessions", `${id}.json`);
    return JSON.parse(await readFile(file, "utf8")) as SnapshotWithReport;
  } catch {
    return undefined;
  }
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = (getSessionState(id) as SnapshotWithReport | undefined) ?? await loadSnapshot(id);
  if (!state) notFound();

  const pack = loadPack(state.session.packId);
  const storedReport = state.session.report ?? state.report;
  const report = storedReport
    ? { ...storedReport, findings: state.findings, claims: state.claims, segments: state.segments }
    : assembleReport(state);

  return <ReportView session={state.session} pack={pack} report={report} />;
}

import { notFound } from "next/navigation";

import ReportView from "@/components/ReportView";
import { normalizeReport, type SessionReport } from "@/lib/agents/reportComposer";
import { loadPack } from "@/lib/packs";
import { getSessionState, type SessionState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SnapshotWithReport = SessionState & {
  report?: SessionReport;
  session: SessionState["session"] & { report?: SessionReport };
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = getSessionState(id) as SnapshotWithReport | undefined;
  if (!state) notFound();

  const pack = loadPack(state.session.packId);
  const storedReport = state.session.report ?? state.report;
  const report = normalizeReport(state, storedReport);

  return <ReportView session={state.session} pack={pack} report={report} />;
}

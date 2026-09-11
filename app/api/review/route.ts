import { NextRequest, NextResponse } from "next/server";

import type { ReviewedFinding } from "@/components/ReportView";
import { getSessionState, type SessionState, upsertFinding } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idPattern = /^[a-zA-Z0-9_-]+$/;
const reviewerAttribution = "J. Vaz (subject expert)";

type StateWithStoredReport = SessionState & {
  session: SessionState["session"] & {
    report?: { findings: ReviewedFinding[] };
  };
};

type Decision = "confirm" | "simplification" | "correct";

function redirect(request: NextRequest, findingId?: string): NextResponse {
  const target = new URL("/review", request.url);
  if (findingId) target.searchParams.set("reviewed", findingId);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  const findingId = String(form.get("findingId") ?? "");
  const decision = String(form.get("decision") ?? "") as Decision;
  const correction = String(form.get("correction") ?? "").trim().slice(0, 500);

  if (!idPattern.test(sessionId) || !idPattern.test(findingId) || !["confirm", "simplification", "correct"].includes(decision)) {
    return Response.json({ error: "The review action was incomplete." }, { status: 400 });
  }
  if (decision === "correct" && !correction) {
    return Response.json({ error: "A correction is required." }, { status: 400 });
  }

  const state = getSessionState(sessionId);
  if (!state) return Response.json({ error: "The session snapshot could not be found." }, { status: 404 });
  const finding = (state.findings as ReviewedFinding[]).find((item) => item.id === findingId);
  if (!finding) return Response.json({ error: "The queued finding could not be found." }, { status: 404 });

  const reviewed: ReviewedFinding = {
    ...finding,
    reviewStatus: decision === "correct" ? "corrected" : "approved",
    reviewerAttribution,
    reviewedAt: Date.now(),
    reviewNote: decision === "simplification"
      ? "Accepted as an appropriate simplification"
      : decision === "correct"
        ? correction
        : "Finding confirmed",
  };

  const report = (state as StateWithStoredReport).session.report;
  const reportIndex = Array.isArray(report?.findings) ? report.findings.findIndex((item) => item.id === findingId) : -1;
  if (report && reportIndex >= 0) report.findings[reportIndex] = reviewed;
  upsertFinding(sessionId, reviewed);

  return redirect(request, findingId);
}

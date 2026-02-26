import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

  const filePath = path.join(process.cwd(), "data", "sessions", `${sessionId}.json`);
  let diskState: SessionState;
  try {
    diskState = JSON.parse(await readFile(filePath, "utf8")) as SessionState;
  } catch {
    return Response.json({ error: "The session snapshot could not be found." }, { status: 404 });
  }

  const memoryState = getSessionState(sessionId);
  const state = memoryState ?? diskState;
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

  if (memoryState) {
    const report = (memoryState as StateWithStoredReport).session.report;
    const reportIndex = report?.findings.findIndex((item) => item.id === findingId) ?? -1;
    if (report && reportIndex >= 0) report.findings[reportIndex] = reviewed;
    upsertFinding(sessionId, reviewed);
  } else {
    const index = diskState.findings.findIndex((item) => item.id === findingId);
    diskState.findings[index] = reviewed;
    const report = (diskState as StateWithStoredReport).session.report;
    const reportIndex = report?.findings.findIndex((item) => item.id === findingId) ?? -1;
    if (report && reportIndex >= 0) report.findings[reportIndex] = reviewed;
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(diskState, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  }

  return redirect(request, findingId);
}

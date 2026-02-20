import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { compilePack, type CompiledPackDraft } from "@/lib/agents/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const samplePath = path.join(process.cwd(), "packs", "seasons-syllabus-excerpt.md");
const outputPath = path.join(process.cwd(), "data", "compiled-pack.json");
const allowedRoles = new Set([
  "Scope authority (syllabus)",
  "Reference material",
  "Instructor notes",
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected compiler error.";
}

function isDraft(value: unknown): value is CompiledPackDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CompiledPackDraft>;
  return (
    Array.isArray(draft.objectives) &&
    Array.isArray(draft.nodes) &&
    Array.isArray(draft.vocabulary) &&
    Array.isArray(draft.misconceptions) &&
    Array.isArray(draft.exclusions)
  );
}

export async function GET() {
  try {
    const source = await readFile(samplePath, "utf8");
    return Response.json(
      { source },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "The sample syllabus could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sourceText?: unknown; sourceRole?: unknown };
    const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
    const sourceRole = typeof body.sourceRole === "string" ? body.sourceRole : "";

    if (!sourceText) {
      return Response.json({ error: "Paste a syllabus excerpt before compiling." }, { status: 400 });
    }
    if (sourceText.length > 50_000) {
      return Response.json({ error: "Keep the pasted source under 50,000 characters." }, { status: 413 });
    }
    if (!allowedRoles.has(sourceRole)) {
      return Response.json({ error: "Choose a valid source role." }, { status: 400 });
    }

    const result = await compilePack(sourceText, sourceRole);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pack compilation failed", error);
    return Response.json(
      { error: `Compilation stopped: ${errorMessage(error)}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { draft?: unknown; approvedBy?: unknown };
    if (!isDraft(body.draft)) {
      return Response.json({ error: "The draft is incomplete and was not approved." }, { status: 400 });
    }

    const approvedAt = new Date().toISOString();
    const approvedBy =
      typeof body.approvedBy === "string" && body.approvedBy.trim()
        ? body.approvedBy.trim().slice(0, 80)
        : "Instructor";
    const approvedPack = {
      ...body.draft,
      verificationStatus: "instructor_approved" as const,
      approvedBy,
      approvedAt,
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(approvedPack, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outputPath);

    return Response.json({ approvedBy, approvedAt });
  } catch (error) {
    console.error("Pack approval failed", error);
    return Response.json(
      { error: `Approval could not be saved: ${errorMessage(error)}` },
      { status: 500 },
    );
  }
}

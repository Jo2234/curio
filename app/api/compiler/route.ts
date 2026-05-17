import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { assertCompiledDraft, compilePack } from "@/lib/agents/compiler";
import { saveApprovedPack } from "@/lib/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const samplePath = path.join(process.cwd(), "packs", "seasons-syllabus-excerpt.md");
const allowedRoles = new Set([
  "Scope authority (syllabus)",
  "Reference material",
  "Instructor notes",
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected compiler error.";
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
  let body: { draft?: unknown; approvedBy?: unknown; sourceText?: unknown; sourceRole?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object") throw new Error("A draft and its source are required.");
    if (typeof body.sourceText !== "string" || !body.sourceText.trim() || body.sourceText.length > 50_000) {
      throw new Error("The draft's source text is required and must be under 50,000 characters.");
    }
    if (typeof body.sourceRole !== "string" || !allowedRoles.has(body.sourceRole)) throw new Error("Choose a valid source role.");
    assertCompiledDraft(body.draft, body.sourceText);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
  const approvedBy = typeof body.approvedBy === "string" && body.approvedBy.trim()
    ? body.approvedBy.trim().slice(0, 80) : "Instructor";
  try {
    // Preserve the exact reviewed source with the runtime contract.
    const result = await saveApprovedPack({ ...body.draft, sourceText: body.sourceText, sourceRole: body.sourceRole }, approvedBy);
    return Response.json(result);
  } catch (error) {
    console.error("Pack approval failed", error);
    return Response.json({ error: `Approval could not be saved: ${errorMessage(error)}` }, { status: 500 });
  }
}

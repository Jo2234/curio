import { nanoid } from "nanoid";

import { addSegment, getSessionState } from "@/lib/store";
import type { TranscriptSegment } from "@/lib/types";

type PipelineModule = {
  runPipelineTick?: (sessionId: string) => void | Promise<void>;
};

function triggerPipeline(sessionId: string): void {
  void (async () => {
    try {
      const pipeline = (await import("@/lib/agents/claimMapper")) as unknown as PipelineModule;
      await pipeline.runPipelineTick?.(sessionId);
    } catch (error) {
      console.error(`Pipeline tick failed for session ${sessionId}`, error);
    }
  })();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await context.params;
  if (!getSessionState(sessionId)) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
  }

  const { speaker, text, tMs } = body as Record<string, unknown>;
  if (speaker !== "user" && speaker !== "novice") {
    return Response.json({ error: "speaker must be user or novice" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 20_000) {
    return Response.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0) {
    return Response.json({ error: "tMs must be a non-negative number" }, { status: 400 });
  }

  const segment: TranscriptSegment = {
    id: nanoid(),
    sessionId,
    speaker,
    text: text.trim(),
    tMs,
  };

  try {
    addSegment(sessionId, segment);
  } catch (error) {
    console.error(`Could not add transcript segment to ${sessionId}`, error);
    return Response.json({ error: "Could not save transcript" }, { status: 500 });
  }

  triggerPipeline(sessionId);
  return Response.json({ segment }, { status: 201 });
}

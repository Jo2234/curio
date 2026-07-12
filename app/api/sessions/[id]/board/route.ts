import { getSessionState } from "@/lib/store";

type VisualModule = {
  describe?: (sessionId: string, imageDataUrl: string, tMs: number) => void | Promise<void>;
};

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i;
const MAX_DATA_URL_LENGTH = 8_000_000;

function triggerDescription(sessionId: string, imageDataUrl: string, tMs: number): void {
  void (async () => {
    try {
      const visual = (await import("@/lib/agents/visual")) as VisualModule;
      if (typeof visual.describe !== "function") throw new Error("Visual describer is unavailable");
      await visual.describe(sessionId, imageDataUrl, tMs);
    } catch (error) {
      console.error(`Visual description failed for session ${sessionId}`, error);
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

  const { imageDataUrl, tMs } = body as Record<string, unknown>;
  if (
    typeof imageDataUrl !== "string" ||
    imageDataUrl.length > MAX_DATA_URL_LENGTH ||
    !IMAGE_DATA_URL.test(imageDataUrl)
  ) {
    return Response.json({ error: "imageDataUrl must be a base64 JPEG, PNG, or WebP image" }, { status: 400 });
  }
  if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0) {
    return Response.json({ error: "tMs must be a non-negative number" }, { status: 400 });
  }

  triggerDescription(sessionId, imageDataUrl, tMs);
  return Response.json({ status: "accepted" }, { status: 202 });
}

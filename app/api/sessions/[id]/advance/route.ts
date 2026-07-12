import { advance } from "@/lib/agents/pedagogy";
import { getSessionState } from "@/lib/store";

const ACTIONS = new Set(["hint", "teachback", "finish"] as const);
type AdvanceAction = "hint" | "teachback" | "finish";

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
  const action = body && typeof body === "object" ? (body as { action?: unknown }).action : undefined;
  if (typeof action !== "string" || !ACTIONS.has(action as AdvanceAction)) {
    return Response.json({ error: "action must be hint, teachback, or finish" }, { status: 400 });
  }

  try {
    await advance(sessionId, action as AdvanceAction);
    return Response.json({ session: getSessionState(sessionId)?.session });
  } catch (error) {
    console.error(`Could not advance Curio session ${sessionId}`, error);
    return Response.json({ error: "Could not advance session" }, { status: 500 });
  }
}

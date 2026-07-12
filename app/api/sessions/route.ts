import { NextResponse } from "next/server";

import { createSession } from "@/lib/store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null ||
    typeof (body as { packId?: unknown }).packId !== "string" ||
    !["teacher", "student"].includes(String((body as { mode?: unknown }).mode))
  ) {
    return NextResponse.json({ error: "packId and a valid mode are required" }, { status: 400 });
  }

  try {
    const { packId, mode } = body as { packId: string; mode: "teacher" | "student" };
    const state = createSession(packId, mode);
    return NextResponse.json({ sessionId: state.session.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create session" }, { status: 404 });
  }
}

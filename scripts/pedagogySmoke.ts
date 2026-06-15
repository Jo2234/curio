import { strict as assert } from "node:assert";

import { nanoid } from "nanoid";

import { advance, decide } from "../lib/agents/pedagogy";
import { audit } from "../lib/agents/coverage";
import { verifyNewClaims } from "../lib/agents/verifier";
import {
  addSegment,
  createSession,
  getSessionState,
  setPhase,
  upsertClaim,
} from "../lib/store";

function pass(message: string): void {
  console.log(`PASS — ${message}`);
}

async function main(): Promise<void> {
  // Missing keys must not prevent the deterministic mapper/verifier/pedagogy path.
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.REASONING_PROVIDER = "openai";

  const { session } = createSession("earth-seasons", "teacher");
  setPhase(session.id, "listening");
  const now = Date.now();
  const plantedSegments = [
    "Let me start with the yearly pattern of summer and winter.",
    "Summer happens because Earth is closer to the Sun, and winter happens when it is farther away.",
  ];
  const plantedIds = plantedSegments.map(() => nanoid());
  plantedSegments.forEach((text, index) => addSegment(session.id, {
    id: plantedIds[index],
    sessionId: session.id,
    speaker: "user",
    text,
    tMs: now - 70_000 + index * 5_000,
  }));

  upsertClaim(session.id, {
    id: nanoid(),
    sessionId: session.id,
    statement: plantedSegments[1],
    originalText: plantedSegments[1],
    segmentIds: [plantedIds[1]],
    nodeIds: ["sun-distance", "seasons"],
    status: "observed",
    createdAtMs: now - 65_000,
  });
  await verifyNewClaims(session.id);
  await audit(session.id);
  await decide(session.id);
  let state = getSessionState(session.id);
  assert(state, "session should remain in the store");
  const counterQuestion = state.directives.find((directive) =>
    directive.utteranceInstruction.startsWith("If being closer causes summer"));
  assert(counterQuestion, "the planted distance misconception should surface its counter-question");
  assert.equal(
    counterQuestion.reason,
    "User stated the distance misconception; counterexample probes whether the belief is load-bearing.",
  );
  assert.equal(state.session.phase, "repair");
  pass("mc-distance surfaces the verbatim counter-question with its recorded reason");

  const contradiction = state.claims.find((claim) => claim.misconceptionId === "mc-distance");
  assert(contradiction, "the deterministic verifier should create the planted contradicted claim");
  const repairSegmentId = nanoid();
  const repairText = "Actually it's the tilt — the axis is tilted 23.5 degrees so the sunlight hits at a steeper angle.";
  addSegment(session.id, {
    id: repairSegmentId,
    sessionId: session.id,
    speaker: "user",
    text: repairText,
    tMs: now - 30_000,
  });

  // Model the verifier contract explicitly: repair completes only when a verified,
  // superseding claim lands. This keeps the pedagogy smoke independent of API keys.
  upsertClaim(session.id, { ...contradiction, status: "superseded" });
  upsertClaim(session.id, {
    id: nanoid(),
    sessionId: session.id,
    statement: repairText,
    originalText: repairText,
    segmentIds: [repairSegmentId],
    nodeIds: [...new Set([...contradiction.nodeIds, "axial-tilt", "sunlight-angle"])],
    status: "verified",
    supersedesClaimId: contradiction.id,
    createdAtMs: now - 30_000,
  });
  await audit(session.id);
  await decide(session.id);

  state = getSessionState(session.id);
  assert(state);
  assert(
    contradiction.nodeIds.some((nodeId) => ["established", "assisted"].includes(state!.conceptStates[nodeId])),
    "at least one misconception target should flip out of misconceived after repair",
  );
  assert.equal(
    state.directives.filter((directive) => directive.utteranceInstruction === counterQuestion.utteranceInstruction).length,
    1,
    "the repaired misconception question must not repeat",
  );
  assert.notEqual(state.session.phase, "repair");
  pass("verified repair flips concept state and the same counter-question is not repeated");

  await advance(session.id, "teachback");
  state = getSessionState(session.id);
  assert(state);
  assert.equal(state.session.phase, "teachback");
  pass("advance(teachback) enters teachback and safely invokes the optional generator");
}

void main().catch((error) => {
  console.error("FAIL — pedagogy smoke crashed", error);
  process.exitCode = 1;
});

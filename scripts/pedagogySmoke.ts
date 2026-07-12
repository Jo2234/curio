import { strict as assert } from "node:assert";

import { nanoid } from "nanoid";

import { advance, decide } from "../lib/agents/pedagogy";
import { audit } from "../lib/agents/coverage";
import { verifyNewClaims } from "../lib/agents/verifier";
import {
  addBelief,
  addSegment,
  createSession,
  getSessionState,
  setClaimMapperCursor,
  setPhase,
  upsertClaim,
} from "../lib/store";

function pass(message: string): void {
  console.log(`PASS — ${message}`);
}

async function main(): Promise<void> {
  const provider = process.env.REASONING_PROVIDER ?? "anthropic";
  const liveKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  assert(liveKey, `pedagogy smoke requires the live ${provider} key from .env.local`);

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
  addBelief(session.id, {
    id: nanoid(),
    sessionId: session.id,
    statement: "Summer happens because Earth is closer to the Sun.",
    supportingClaimIds: [contradiction.id],
    nodeIds: contradiction.nodeIds,
    status: "believed",
  });
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
  // superseding claim lands; the live key is then used for belief flush and finale generation.
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

  setClaimMapperCursor(session.id, state.segments.length);
  const recentDirectiveEvent = [...state.agentEvents].reverse().find((event) =>
    event.agent === "pedagogy" && Boolean((event.payload as { directiveId?: string } | undefined)?.directiveId));
  assert(recentDirectiveEvent, "the counter-question should have a pedagogy directive event");
  recentDirectiveEvent.tMs = Date.now() - 5_000;

  await advance(session.id, "teachback");
  state = getSessionState(session.id);
  assert(state);
  assert.equal(state.session.phase, "teachback");
  const teachbackDirective = state.directives.find((directive) => directive.kind === "teachback");
  assert(teachbackDirective, "teach-back directive must be pushed despite a directive five seconds earlier");
  pass("teach-back terminal action bypasses the 20-second directive debounce");

  const beliefText = state.beliefs.map((belief) => belief.statement).join(" ").toLocaleLowerCase();
  assert(
    beliefText.includes("tilt") || beliefText.includes("axis"),
    "belief flush should include the repaired axial-tilt statement",
  );
  assert(
    !state.beliefs.some((belief) =>
      belief.statement.toLocaleLowerCase().includes("closer") && belief.status !== "revised"),
    "belief flush must not leave the distance misconception as an unrevised belief",
  );
  assert(
    teachbackDirective.utteranceInstruction.toLocaleLowerCase().includes("tilt") ||
      teachbackDirective.utteranceInstruction.toLocaleLowerCase().includes("axis"),
    "teach-back should reconstruct the repaired belief, not the stale misconception",
  );
  pass("teach-back waits for belief revision and reconstructs the repair");

  await advance(session.id, "finish");
  state = getSessionState(session.id);
  assert(state);
  assert.equal(state.session.phase, "report");
  const report = (state.session as typeof state.session & { report?: unknown }).report;
  assert(report, "finishing teach-back should compose and store the report");
  pass("full finale reaches report and stores the composed report");
}

void main().catch((error) => {
  console.error("FAIL — pedagogy smoke crashed", error);
  process.exitCode = 1;
});

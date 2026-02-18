import { nanoid } from "nanoid";

import { runPipelineTick } from "../lib/agents/claimMapper";
import { listPacks } from "../lib/packs";
import { addSegment, createSession, getSessionState, setPhase } from "../lib/store";

const cannedSegments = [
  "Earth's tilt changes the angle at which sunlight reaches each hemisphere.",
  "Summer happens because the Earth gets closer to the Sun.",
  "The sunlight is more direct in summer.",
  "Direct rays spread the same energy over a smaller area.",
  "In winter, sunlight arrives at a shallower angle and warms the ground less.",
];

function assertion(label: string, passed: boolean): boolean {
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
  return passed;
}

async function main(): Promise<void> {
  const packs = listPacks();
  const pack = packs.find((candidate) => candidate.id === "earth-seasons") ?? packs[0];
  if (!pack) {
    console.error("FAIL — no concept pack is installed (expected packs/earth-seasons.json)");
    process.exitCode = 1;
    return;
  }

  const { session } = createSession(pack.id, "teacher");
  setPhase(session.id, "listening");
  const start = Date.now();
  cannedSegments.forEach((text, index) => {
    addSegment(session.id, {
      id: nanoid(),
      sessionId: session.id,
      speaker: "user",
      text,
      tMs: start + index * 1_000,
    });
  });

  await runPipelineTick(session.id);
  const state = getSessionState(session.id);
  if (!state) throw new Error("Smoke session disappeared from the store");

  const results = [
    assertion("at least four atomic claims exist", state.claims.length >= 4),
    assertion(
      "distance misconception is deterministically contradicted",
      state.claims.some((claim) => claim.status === "contradicted" && claim.misconceptionId === "mc-distance"),
    ),
    assertion(
      "a factual contradiction finding exists",
      state.findings.some((finding) => finding.type === "factual_contradiction"),
    ),
    assertion(
      "concept coverage states were updated",
      Object.values(state.conceptStates).some((conceptState) => !["unvisited", "assumed"].includes(conceptState)),
    ),
    assertion(
      "an undefined vocabulary term creates assumption debt",
      state.assumptionDebt.some((item) => !item.laterExplained),
    ),
    assertion(
      "all three pipeline agents emitted live events",
      ["claim_mapper", "verifier", "coverage"].every((agent) =>
        state.agentEvents.some((event) => event.agent === agent)),
    ),
  ];

  if (results.every(Boolean)) console.log(`PASS — pipeline smoke completed for session ${session.id}`);
  else process.exitCode = 1;
}

void main().catch((error) => {
  console.error("FAIL — pipeline smoke crashed", error);
  process.exitCode = 1;
});

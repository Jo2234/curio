import { nanoid } from "nanoid";

import { assertTeachbackContextIsolation, generate } from "../lib/agents/teachback";
import { listPacks } from "../lib/packs";
import { addBelief, createSession, getSessionState } from "../lib/store";
import type { LearnerBelief } from "../lib/types";

function assertion(label: string, passed: boolean): boolean {
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
  return passed;
}

function seedBelief(
  sessionId: string,
  statement: string,
  nodeIds: string[],
  status: LearnerBelief["status"] = "believed",
  ambiguityNote?: string,
): void {
  addBelief(sessionId, {
    id: nanoid(),
    sessionId,
    statement,
    supportingClaimIds: [nanoid()],
    nodeIds,
    status,
    ...(ambiguityNote ? { ambiguityNote } : {}),
  });
}

async function main(): Promise<void> {
  const pack = listPacks().find((candidate) => candidate.id === "earth-seasons");
  if (!pack) throw new Error("The earth-seasons concept pack is required");
  const results: boolean[] = [];

  const sessionA = createSession(pack.id, "teacher").session;
  seedBelief(sessionA.id, "Earth's changing distance from the Sun is what causes the seasons.", ["sun-distance", "seasons"]);
  seedBelief(sessionA.id, "Summer happens when Earth moves closer to the Sun, so it becomes warmer.", ["sun-distance", "seasons"]);
  seedBelief(sessionA.id, "Winter happens when Earth is farther from the Sun, so it becomes colder.", ["sun-distance", "seasons"]);
  seedBelief(
    sessionA.id,
    "The exact amount that the Earth-Sun distance changes is unclear to me.",
    ["sun-distance"],
    "tentative",
    "I was not told how large the distance change is.",
  );
  const directiveA = await generate(sessionA.id);
  const scriptA = directiveA.utteranceInstruction.toLocaleLowerCase();
  results.push(assertion(
    "session A preserves closeness/distance as the cause",
    scriptA.includes("closer") || scriptA.includes("distance"),
  ));
  results.push(assertion("session A does not import axial tilt", !scriptA.includes("tilt")));
  results.push(assertion("session A stores belief provenance", (getSessionState(sessionA.id)?.teachbackResult?.usedBeliefIds.length ?? 0) > 0));

  const sessionB = createSession(pack.id, "teacher").session;
  seedBelief(sessionB.id, "Earth's axial tilt changes the angle at which sunlight reaches each hemisphere.", ["axial-tilt", "sunlight-angle"]);
  seedBelief(sessionB.id, "A hemisphere tilted toward the Sun receives more direct sunlight.", ["axial-tilt", "sunlight-angle", "hemisphere"]);
  seedBelief(sessionB.id, "More direct sunlight spreads the same energy over a smaller area.", ["sunlight-angle", "energy-concentration"]);
  seedBelief(sessionB.id, "That more concentrated sunlight warms the surface more and produces summer conditions.", ["energy-concentration", "seasons"]);
  const directiveB = await generate(sessionB.id);
  const scriptB = directiveB.utteranceInstruction.toLocaleLowerCase();
  results.push(assertion("session B reconstructs tilt", scriptB.includes("tilt")));
  results.push(assertion("session B does not invent day length", !scriptB.includes("day length") && !scriptB.includes("daylight")));
  results.push(assertion("session B does not invent the 23.5-degree figure", !scriptB.includes("23.5")));

  let isolationTriggered = false;
  try {
    assertTeachbackContextIsolation(pack, JSON.stringify({ smuggled: pack.referenceSummary }));
  } catch {
    isolationTriggered = true;
  }
  results.push(assertion("context allowlist rejects a smuggled referenceSummary", isolationTriggered));

  if (results.every(Boolean)) console.log("PASS — reverse teach-back smoke completed");
  else process.exitCode = 1;
}

void main().catch((error) => {
  console.error("FAIL — reverse teach-back smoke crashed", error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";

import { loadPack } from "../lib/packs";

const pack = loadPack("earth-seasons");

assert.equal(pack.id, "earth-seasons");
assert.equal(pack.version, "1.0");
assert.equal(pack.verificationStatus, "instructor_approved");
assert.equal(pack.level, "lower-secondary");

const requiredNodeIds = [
  "axial-tilt",
  "orbit",
  "seasons",
  "sunlight-angle",
  "energy-concentration",
  "day-length",
  "hemisphere",
  "opposite-seasons",
  "sun-distance",
  "fixed-axis",
  "equator-seasons",
  "solstice",
];
const requiredMisconceptionIds = [
  "mc-distance",
  "mc-same-seasons",
  "mc-wobbling-tilt",
  "mc-hotter-because-longer-only",
];
const requiredTransferProbeIds = ["tp-no-tilt", "tp-bigger-tilt"];
const requiredFallbackQuestionIds = [
  "fq-mechanism",
  "fq-daylength",
  "fq-opposite",
  "fq-fixed-axis",
  "fq-define-tilt",
];

function assertIdsExist(
  label: string,
  requiredIds: string[],
  actualIds: string[],
): void {
  const actual = new Set(actualIds);
  for (const id of requiredIds) {
    assert.ok(actual.has(id), `Missing required ${label} id: ${id}`);
  }
}

assert.equal(pack.nodes.length, requiredNodeIds.length, "Pack must contain exactly the required nodes");
assertIdsExist("node", requiredNodeIds, pack.nodes.map((node) => node.id));
assertIdsExist(
  "misconception",
  requiredMisconceptionIds,
  pack.misconceptions.map((misconception) => misconception.id),
);
assertIdsExist(
  "transfer probe",
  requiredTransferProbeIds,
  pack.transferProbes.map((probe) => probe.id),
);
assertIdsExist(
  "fallback question",
  requiredFallbackQuestionIds,
  pack.fallbackQuestions.map((question) => question.id),
);

const nodeIds = new Set(pack.nodes.map((node) => node.id));
const edgeIds = new Set(pack.edges.map((edge) => edge.id));
for (const edge of pack.edges) {
  assert.ok(nodeIds.has(edge.from), `Edge ${edge.id} has unknown from-node: ${edge.from}`);
  assert.ok(nodeIds.has(edge.to), `Edge ${edge.id} has unknown to-node: ${edge.to}`);
}
for (const objective of pack.objectives) {
  for (const nodeId of objective.requiredNodeIds) {
    assert.ok(nodeIds.has(nodeId), `Objective ${objective.id} has unknown node: ${nodeId}`);
  }
  for (const edgeId of objective.requiredEdgeIds) {
    assert.ok(edgeIds.has(edgeId), `Objective ${objective.id} has unknown edge: ${edgeId}`);
  }
}
for (const probe of pack.transferProbes) {
  for (const edgeId of probe.targetEdgeIds) {
    assert.ok(edgeIds.has(edgeId), `Transfer probe ${probe.id} has unknown edge: ${edgeId}`);
  }
}

console.log(
  `PASS earth-seasons: ${pack.nodes.length} nodes, ${pack.edges.length} edges, ${pack.misconceptions.length} misconceptions, ${pack.transferProbes.length} transfer probes, ${pack.fallbackQuestions.length} fallback questions`,
);

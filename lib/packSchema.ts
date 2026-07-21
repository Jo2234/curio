import type { ConceptPack } from "./types";

const text = { type: "string" };
const strings = { type: "array", items: text };
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const array = (properties: Record<string, unknown>) => ({ type: "array", items: object(properties) });

/** The compiler and runtime share the same complete pack contract. */
export const conceptPackProperties = {
  id: text, version: text, title: text, subject: text, level: text,
  verificationStatus: { type: "string", enum: ["ai_generated_draft", "source_grounded", "instructor_approved"] },
  objectives: array({ id: text, statement: text, requiredNodeIds: strings, requiredEdgeIds: strings }),
  prerequisites: strings, vocabulary: strings,
  nodes: array({ id: text, name: text, aliases: strings, definition: text, importance: { type: "string", enum: ["core", "supporting"] } }),
  edges: array({ id: text, from: text, relation: text, to: text, explanation: text }),
  misconceptions: array({ id: text, statement: text, detectionHints: strings, counterQuestion: text, explanation: text }),
  transferProbes: array({ id: text, question: text, expectedReasoning: text, targetEdgeIds: strings }),
  fallbackQuestions: array({ id: text, trigger: text, question: text }),
  acceptableSimplifications: strings, referenceSummary: text,
};

export const conceptPackSchema = object(conceptPackProperties);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(value: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type === "string") return typeof value === "string" && (!Array.isArray(schema.enum) || schema.enum.includes(value));
  if (schema.type === "array") return Array.isArray(value) && value.every((item) => matches(item, schema.items as Record<string, unknown>));
  if (schema.type === "object") {
    return record(value) && Object.entries(schema.properties as Record<string, Record<string, unknown>>)
      .every(([key, field]) => matches(value[key], field));
  }
  return false;
}

export function assertConceptPack(value: unknown): asserts value is ConceptPack {
  if (!matches(value, conceptPackSchema)) throw new Error("Concept pack is incomplete or has invalid fields.");
  const pack = value as ConceptPack;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(pack.id)) throw new Error("Concept pack id is invalid.");
  for (const field of [pack.version, pack.title, pack.subject, pack.level, pack.referenceSummary]) {
    if (!field.trim()) throw new Error("Concept pack metadata and reference summary must not be empty.");
  }
  if (!pack.objectives.length || !pack.nodes.length || !pack.transferProbes.length) {
    throw new Error("A pack needs objectives, concepts, and at least one assessment probe.");
  }
  function ids(items: { id: string }[], kind: string): Set<string> {
    const values = new Set(items.map((item) => item.id));
    if (values.size !== items.length || [...values].some((id) => !id.trim())) throw new Error(`Duplicate or empty ${kind} ids.`);
    return values;
  }
  for (const [label, values] of [
    ["objective", pack.objectives.map((item) => item.statement)],
    ["concept", pack.nodes.flatMap((item) => [item.name, item.definition])],
    ["edge", pack.edges.flatMap((item) => [item.relation, item.explanation])],
    ["misconception", pack.misconceptions.flatMap((item) => [item.statement, item.counterQuestion, item.explanation])],
    ["transfer probe", pack.transferProbes.flatMap((item) => [item.question, item.expectedReasoning])],
    ["fallback question", pack.fallbackQuestions.flatMap((item) => [item.trigger, item.question])],
  ] as const) {
    if (values.some((value) => !value.trim())) throw new Error(`Empty ${label} content.`);
  }
  const nodeIds = ids(pack.nodes, "node");
  const edgeIds = ids(pack.edges, "edge");
  ids(pack.objectives, "objective");
  ids(pack.misconceptions, "misconception");
  ids(pack.transferProbes, "transfer probe");
  ids(pack.fallbackQuestions, "fallback question");
  function references(values: string[], allowed: Set<string>, label: string) {
    if (values.some((id) => !allowed.has(id))) throw new Error(`Unknown ${label} reference.`);
  }
  references(pack.prerequisites, nodeIds, "prerequisite");
  for (const edge of pack.edges) references([edge.from, edge.to], nodeIds, "edge node");
  for (const objective of pack.objectives) {
    if (!objective.requiredNodeIds.length) throw new Error(`Objective ${objective.id} needs a concept reference.`);
    references(objective.requiredNodeIds, nodeIds, "objective node");
    references(objective.requiredEdgeIds, edgeIds, "objective edge");
  }
  for (const probe of pack.transferProbes) references(probe.targetEdgeIds, edgeIds, "transfer edge");
}

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ConceptPack } from "./types";

const PACKS_DIRECTORY = path.join(process.cwd(), "packs");
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string");
}

function isConceptPack(value: unknown): value is ConceptPack {
  if (!isRecord(value)) return false;
  if (!hasStrings(value, ["id", "version", "title", "subject", "level", "referenceSummary"])) return false;
  if (!["ai_generated_draft", "source_grounded", "instructor_approved"].includes(String(value.verificationStatus))) return false;
  if (!isStringArray(value.prerequisites) || !isStringArray(value.vocabulary) || !isStringArray(value.acceptableSimplifications)) return false;

  const objectivesValid = Array.isArray(value.objectives) && value.objectives.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "statement"]) && isStringArray(item.requiredNodeIds) && isStringArray(item.requiredEdgeIds));
  const nodesValid = Array.isArray(value.nodes) && value.nodes.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "name", "definition"]) && isStringArray(item.aliases) && ["core", "supporting"].includes(String(item.importance)));
  const edgesValid = Array.isArray(value.edges) && value.edges.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "from", "relation", "to", "explanation"]));
  const misconceptionsValid = Array.isArray(value.misconceptions) && value.misconceptions.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "statement", "counterQuestion", "explanation"]) && isStringArray(item.detectionHints));
  const probesValid = Array.isArray(value.transferProbes) && value.transferProbes.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "question", "expectedReasoning"]) && isStringArray(item.targetEdgeIds));
  const questionsValid = Array.isArray(value.fallbackQuestions) && value.fallbackQuestions.every((item) =>
    isRecord(item) && hasStrings(item, ["id", "trigger", "question"]));

  return objectivesValid && nodesValid && edgesValid && misconceptionsValid && probesValid && questionsValid;
}

export function loadPack(id: string): ConceptPack {
  if (!PACK_ID_PATTERN.test(id)) {
    throw new Error(`Invalid concept pack id: ${id}`);
  }

  const filePath = path.join(PACKS_DIRECTORY, `${id}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load concept pack "${id}"`, { cause: error });
  }

  if (!isConceptPack(parsed) || parsed.id !== id) {
    throw new Error(`Concept pack "${id}" does not match the frozen contract`);
  }

  return parsed;
}

export function listPacks(): ConceptPack[] {
  return readdirSync(PACKS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => loadPack(entry.name.slice(0, -5)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

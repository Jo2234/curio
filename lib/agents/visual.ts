import { nanoid } from "nanoid";

import { visionCall } from "../llm";
import { loadPack } from "../packs";
import {
  addFinding,
  emitAgentEvent,
  getSessionState,
  pushDirective,
} from "../store";
import type { SessionState } from "../store";
import type { ConceptPack, Directive, VisualArtifact } from "../types";

interface VisualDescription {
  labels: unknown;
  relations: unknown;
  ambiguities: unknown;
}

interface RelationDescription {
  from?: unknown;
  type?: unknown;
  to?: unknown;
  confidence?: unknown;
}

const visualSchema = {
  type: "object",
  additionalProperties: false,
  required: ["labels", "relations", "ambiguities"],
  properties: {
    labels: { type: "array", items: { type: "string" } },
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "type", "to", "confidence"],
        properties: {
          from: { type: "string" },
          type: { type: "string" },
          to: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    ambiguities: { type: "array", items: { type: "string" } },
  },
} as const;

const PERSON_LANGUAGE = /\b(person|people|human|face|facial|man|woman|boy|girl|teacher|presenter|student|child|adult|body)\b/i;
const ARROW_LANGUAGE = /\b(arrow|arrowhead|directional line)\b/i;
const recentVisualDirectives = new Map<string, number>();

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || PERSON_LANGUAGE.test(text)) return null;
  return text.slice(0, 500);
}

function uniqueTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanText(item);
    if (!text || seen.has(text.toLocaleLowerCase())) continue;
    seen.add(text.toLocaleLowerCase());
    result.push(text);
  }
  return result;
}

function sanitizeDescription(output: VisualDescription): Pick<VisualArtifact, "labels" | "relations" | "ambiguities"> {
  const relations = Array.isArray(output.relations)
    ? output.relations.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const relation = candidate as RelationDescription;
        const from = cleanText(relation.from);
        const type = cleanText(relation.type);
        const to = cleanText(relation.to);
        if (!from || !type || !to) return [];
        const confidence = typeof relation.confidence === "number" && Number.isFinite(relation.confidence)
          ? Math.max(0, Math.min(1, relation.confidence))
          : 0;
        return [{ from, type, to, confidence }];
      })
    : [];

  return {
    labels: uniqueTexts(output.labels),
    relations,
    ambiguities: uniqueTexts(output.ambiguities),
  };
}

function recognitionPrompt(pack: ConceptPack): string {
  const hints = pack.nodes.map(({ id, name, aliases }) => ({ id, name, aliases }));
  return [
    "Describe only the educational diagram or board content in this image. Never identify, count, characterize, or mention people or faces.",
    "Extract visible labels, depicted relations, and genuine visual ambiguities. Use short, plain phrases grounded in the image.",
    "For relations, name the visible source, relation type, destination, and a 0-to-1 confidence. Do not invent a relation when the marks are unclear.",
    "Explicitly report unlabeled arrows, unclear correspondences between labels and shapes, and missing expected diagram elements such as an axis line.",
    "An unlabeled arrow is ambiguous even if its most likely meaning can be guessed. Say what the plausible competing meanings are.",
    `Recognition hints from Curio's concept pack (hints only, not proof that an element is visible): ${JSON.stringify(hints)}`,
  ].join("\n");
}

function mappedNodeIds(artifact: Pick<VisualArtifact, "labels" | "relations" | "ambiguities">, pack: ConceptPack): string[] {
  const text = [
    ...artifact.labels,
    ...artifact.ambiguities,
    ...artifact.relations.flatMap((relation) => [relation.from, relation.type, relation.to]),
  ].join(" ").toLocaleLowerCase();
  const matched = pack.nodes
    .filter((node) => [node.name, ...node.aliases].some((hint) => text.includes(hint.toLocaleLowerCase())))
    .map((node) => node.id);
  if (ARROW_LANGUAGE.test(text) && pack.nodes.some((node) => node.id === "axial-tilt")) matched.push("axial-tilt");
  return [...new Set(matched)];
}

function eventMessage(artifact: Pick<VisualArtifact, "labels" | "ambiguities">): string {
  const visible = artifact.labels.slice(0, 3).join(", ") || "diagram marks";
  if (artifact.ambiguities.some((ambiguity) => ARROW_LANGUAGE.test(ambiguity))) {
    return `Detected: ${visible}; 1 unlabeled arrow`;
  }
  return `Detected: ${visible}; ${artifact.ambiguities.length} visual ambiguit${artifact.ambiguities.length === 1 ? "y" : "ies"}`;
}

function hasRecentDirective(state: SessionState, now: number): boolean {
  return (recentVisualDirectives.get(state.session.id) ?? 0) > now - 20_000;
}

function pushArrowDirective(sessionId: string): void {
  const state = getSessionState(sessionId);
  const now = Date.now();
  if (!state || hasRecentDirective(state, now)) return;
  const directive: Directive = {
    id: nanoid(),
    kind: "ask",
    utteranceInstruction: "I can see your drawing — quick question: does that arrow next to the Earth show its tilt, or the direction it's moving?",
    reason: "Unlabeled arrow in the captured diagram is ambiguous to a novice",
    targetNodeIds: ["axial-tilt"],
  };
  pushDirective(sessionId, directive);
  recentVisualDirectives.set(sessionId, now);
}

async function triggerPedagogy(sessionId: string): Promise<void> {
  try {
    const pedagogy = await import("./pedagogy");
    const decide = (pedagogy as { decide?: (id: string) => void | Promise<void> }).decide;
    if (typeof decide === "function") await decide(sessionId);
  } catch (error) {
    console.error(`Optional pedagogy decision failed for visual finding in session ${sessionId}`, error);
  }
}

export async function describe(sessionId: string, imageDataUrl: string, tMs: number): Promise<void> {
  const initialState = getSessionState(sessionId);
  if (!initialState) throw new Error(`Unknown session: ${sessionId}`);
  const pack = loadPack(initialState.session.packId);

  const output = await visionCall<VisualDescription>({
    image: imageDataUrl,
    prompt: recognitionPrompt(pack),
    system: "You are Curio's visual describer. Report only diagram evidence and return the requested structured object.",
    schema: visualSchema,
    maxTokens: 1_200,
  });
  const description = sanitizeDescription(output);
  const artifact: VisualArtifact = {
    id: nanoid(),
    sessionId,
    tMs,
    ...description,
    imageDataUrl,
  };

  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  state.visuals.push(artifact);
  // emitAgentEvent snapshots the entire session, including the artifact appended above.
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "visual",
    message: eventMessage(artifact),
    tMs: Date.now(),
    payload: { visualArtifactId: artifact.id },
  });

  const freshState = getSessionState(sessionId);
  const hasAmbiguity = artifact.ambiguities.length > 0;
  const hasVisualFinding = freshState?.findings.some((finding) => finding.type === "visual_ambiguity") ?? false;
  let findingCreated = false;
  if (hasAmbiguity && !hasVisualFinding) {
    const nodeIds = mappedNodeIds(artifact, pack);
    addFinding(sessionId, {
      id: nanoid(),
      sessionId,
      type: "visual_ambiguity",
      severity: "moderate",
      confidence: "likely",
      title: "Captured diagram has an unclear visual relation",
      explanation: artifact.ambiguities.join(" "),
      claimIds: [],
      segmentIds: [],
      nodeIds,
      sourceRef: `visual:${artifact.id}`,
      reviewStatus: "not_required",
    });
    findingCreated = true;
  }

  if (artifact.ambiguities.some((ambiguity) => ARROW_LANGUAGE.test(ambiguity))) {
    pushArrowDirective(sessionId);
  }
  if (findingCreated) await triggerPedagogy(sessionId);
}

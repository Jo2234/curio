import { nanoid } from "nanoid";

import { jsonCall } from "../llm";
import { loadPack } from "../packs";
import {
  emitAgentEvent,
  getSessionState,
  setClaimMapperCursor,
  commitMappedClaims,
} from "../store";
import type { AtomicClaim, ConceptPack, TranscriptSegment } from "../types";
import { audit } from "./coverage";
import { verifyNewClaims } from "./verifier";

interface ExtractedClaim {
  statement: string;
  originalText: string;
  segmentIds: string[];
  nodeIds: string[];
}

interface ClaimMapperOutput {
  claims: ExtractedClaim[];
}

interface PipelineControl {
  dirty: boolean;
  promise: Promise<void>;
}

const controls = new Map<string, PipelineControl>();

const claimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "originalText", "segmentIds", "nodeIds"],
        properties: {
          statement: { type: "string" },
          originalText: { type: "string" },
          segmentIds: { type: "array", items: { type: "string" } },
          nodeIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function mapperSystem(pack: ConceptPack): string {
  const nodeHints = pack.nodes.map((node) => ({ id: node.id, name: node.name, aliases: node.aliases }));
  return [
    "You are Curio's Claim Mapper.",
    "Extract atomic, falsifiable statements made by the user. Each claim must express one testable idea.",
    "Preserve the exact source wording in originalText. Skip questions, hypotheticals, instructions, and filler.",
    "Map nodeIds only when a node name or alias is a clear semantic match. Be conservative: use an empty array rather than guess.",
    "Use only segment ids and node ids supplied below. Do not verify or correct a claim.",
    `Node name and alias hints: ${JSON.stringify(nodeHints)}`,
  ].join("\n");
}

function mapNodes(text: string, pack: ConceptPack): string[] {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const lower = normalize(text);
  return pack.nodes
    .filter((node) => [node.name, ...node.aliases].some((hint) => lower.includes(normalize(hint))))
    .map((node) => node.id);
}

function fallbackClaims(segments: TranscriptSegment[], pack: ConceptPack): ExtractedClaim[] {
  return segments.flatMap((segment) => segment.text
    .split(/(?<=[.!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3 && !sentence.endsWith("?") && !/^(um+|uh+|okay|so)[.!]?$/i.test(sentence))
    .map((sentence) => ({
      statement: sentence,
      originalText: sentence,
      segmentIds: [segment.id],
      nodeIds: mapNodes(sentence, pack),
    })));
}

function sanitizeClaims(output: ClaimMapperOutput, segments: TranscriptSegment[], pack: ConceptPack): ExtractedClaim[] {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const validNodeIds = new Set(pack.nodes.map((node) => node.id));
  if (!Array.isArray(output.claims)) return [];

  return output.claims.flatMap((claim) => {
    if (!claim || typeof claim.statement !== "string" || typeof claim.originalText !== "string") return [];
    const segmentIds = Array.isArray(claim.segmentIds)
      ? [...new Set(claim.segmentIds.filter((id) => typeof id === "string" && segmentById.has(id)))]
      : [];
    if (segmentIds.length === 0 || claim.statement.trim().length === 0) return [];
    const sourceText = segmentIds.map((id) => segmentById.get(id)?.text ?? "").join("\n");
    const originalText = sourceText.includes(claim.originalText.trim()) ? claim.originalText.trim() : sourceText;
    const nodeIds = Array.isArray(claim.nodeIds)
      ? [...new Set(claim.nodeIds.filter((id) => typeof id === "string" && validNodeIds.has(id)))]
      : [];
    return [{
      statement: claim.statement.trim(),
      originalText,
      segmentIds,
      nodeIds,
    }];
  });
}

function mappedClaims(
  sessionId: string,
  extracted: ExtractedClaim[],
  segments: TranscriptSegment[],
): AtomicClaim[] {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  return extracted.map((item) => {
    const state = getSessionState(sessionId);
    if (!state) throw new Error(`Unknown session: ${sessionId}`);
    const createdAtMs = Math.max(...item.segmentIds.map((id) => segmentById.get(id)?.tMs ?? Date.now()));
    const claim: AtomicClaim = {
      id: nanoid(),
      sessionId,
      statement: item.statement,
      originalText: item.originalText,
      segmentIds: item.segmentIds,
      nodeIds: item.nodeIds,
      status: "observed",
      createdAtMs,
    };
    return claim;
  });
}

async function processBatch(sessionId: string): Promise<void> {
  const state = getSessionState(sessionId);
  if (!state) throw new Error(`Unknown session: ${sessionId}`);
  const endCursor = state.segments.length;
  const segments = state.segments.slice(state.claimMapperCursor, endCursor).filter((segment) => segment.speaker === "user");
  if (segments.length === 0) {
    setClaimMapperCursor(sessionId, endCursor);
    await verifyNewClaims(sessionId);
    await audit(sessionId);
    return;
  }

  const pack = loadPack(state.session.packId);
  let extracted: ExtractedClaim[];
  try {
    const output = await jsonCall<ClaimMapperOutput>({
      system: mapperSystem(pack),
      user: JSON.stringify({ segments: segments.map(({ id, text, tMs }) => ({ id, text, tMs })) }),
      schema: claimSchema,
      maxTokens: 1_500,
    });
    extracted = sanitizeClaims(output, segments, pack);
  } catch (error) {
    console.error("Claim Mapper LLM call failed; using conservative segment fallback", error);
    extracted = fallbackClaims(segments, pack);
  }

  commitMappedClaims(sessionId, mappedClaims(sessionId, extracted, segments), endCursor);
  emitAgentEvent(sessionId, {
    id: nanoid(),
    sessionId,
    agent: "claim_mapper",
    message: `Extracted ${extracted.length} claims from ${segments.length} segments`,
    tMs: Date.now(),
    payload: { segmentIds: segments.map((segment) => segment.id) },
  });

  await verifyNewClaims(sessionId);
  await audit(sessionId);
}

/** Drain claim extraction and verification; concurrent callers await the same work. */
export function flushPipeline(sessionId: string): Promise<void> {
  const existing = controls.get(sessionId);
  if (existing) {
    existing.dirty = true;
    return existing.promise;
  }
  const control: PipelineControl = { dirty: false, promise: Promise.resolve() };
  control.promise = Promise.resolve().then(async () => {
    do {
      control.dirty = false;
      await processBatch(sessionId);
    } while (control.dirty);
  }).finally(() => {
    controls.delete(sessionId);
  });
  controls.set(sessionId, control);
  return control.promise;
}

/** Questions depend on verified evidence, never on the optional learner reconstruction. */
export async function runPipelineTick(sessionId: string): Promise<void> {
  await flushPipeline(sessionId);
  await (await import("./pedagogy")).decide(sessionId);
}

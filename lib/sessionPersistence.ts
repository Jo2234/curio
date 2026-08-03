import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionState } from "./store";

/** Replacement succeeded, but power-loss durability could not be confirmed. */
export class SnapshotDurabilityError extends Error {}

export const sessionIdPattern = /^[a-zA-Z0-9_-]+$/;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const oneOf = (value: unknown, values: string[]) => typeof value === "string" && values.includes(value);

/** Validate persisted inputs before exposing them to the agents or UI. Unknown metadata is retained. */
export function parseSnapshot(text: string, id: string): SessionState {
  const value: unknown = JSON.parse(text);
  const invalid = (field: string): never => { throw new Error(`Invalid session snapshot field: ${field}`); };
  if (!record(value)) return invalid("root");
  if (value.snapshotVersion !== undefined && value.snapshotVersion !== 1) return invalid("snapshotVersion");
  const session = value.session;
  if (!record(session) || session.id !== id || typeof session.packId !== "string" || !sessionIdPattern.test(session.packId)
    || !oneOf(session.mode, ["teacher", "student"]) || !oneOf(session.phase, ["setup", "listening", "questioning", "repair", "transfer", "teachback", "report", "complete"])
    || !count(session.createdAt) || !count(session.questionCount) || !record(session.hintLevelByNode)
    || !Object.values(session.hintLevelByNode).every(level => level === 0 || level === 1 || level === 2)) return invalid("session");

  const items = (field: string, check: (item: RecordValue) => boolean) => {
    const values = value[field];
    if (!Array.isArray(values) || !values.every(item => record(item) && check(item))) invalid(field);
  };
  const owned = (item: RecordValue) => typeof item.id === "string" && item.id.length > 0 && item.sessionId === id;
  const textFields = (item: RecordValue, fields: string[]) => fields.every(field => typeof item[field] === "string");
  const optionalText = (item: RecordValue, fields: string[]) => fields.every(field => item[field] === undefined || typeof item[field] === "string");
  const lists = (item: RecordValue, fields: string[]) => fields.every(field => strings(item[field]));
  items("segments", item => owned(item) && typeof item.text === "string" && oneOf(item.speaker, ["user", "novice"]) && timestamp(item.tMs));
  items("claims", item => owned(item) && textFields(item, ["statement", "originalText"]) && lists(item, ["segmentIds", "nodeIds"])
    && oneOf(item.status, ["observed", "verified", "contradicted", "uncertain", "superseded"]) && timestamp(item.createdAtMs) && optionalText(item, ["misconceptionId", "supersedesClaimId"]));
  items("findings", item => owned(item) && textFields(item, ["title", "explanation"])
    && lists(item, ["claimIds", "segmentIds", "nodeIds"])
    && oneOf(item.type, ["factual_contradiction", "material_omission", "undefined_term", "causal_leap", "broken_analogy", "visual_ambiguity", "transfer_failure"])
    && oneOf(item.severity, ["critical", "major", "moderate", "minor"])
    && oneOf(item.confidence, ["verified", "likely", "uncertain"])
    && oneOf(item.reviewStatus, ["not_required", "queued", "approved", "corrected"])
    && optionalText(item, ["sourceRef", "reviewerAttribution", "reviewNote"]) && (item.reviewedAt === undefined || timestamp(item.reviewedAt)));
  items("beliefs", item => owned(item) && typeof item.statement === "string" && lists(item, ["supportingClaimIds", "nodeIds"])
    && oneOf(item.status, ["believed", "tentative", "revised"]) && (item.ambiguityNote === undefined || typeof item.ambiguityNote === "string"));
  items("assumptionDebt", item => textFields(item, ["term", "note"]) && timestamp(item.firstUsedMs) && typeof item.laterExplained === "boolean");
  items("agentEvents", item => owned(item) && typeof item.message === "string" && timestamp(item.tMs)
    && oneOf(item.agent, ["claim_mapper", "verifier", "coverage", "pedagogy", "visual", "learner_model", "teachback", "report"]));
  items("directives", item => typeof item.id === "string" && textFields(item, ["utteranceInstruction", "reason"])
    && strings(item.targetNodeIds) && oneOf(item.kind, ["ask", "hint", "transfer", "teachback", "close"])
    && (item.hintLevel === undefined || item.hintLevel === 0 || item.hintLevel === 1 || item.hintLevel === 2));
  items("visuals", item => owned(item) && timestamp(item.tMs) && lists(item, ["labels", "ambiguities"])
    && optionalText(item, ["imageDataUrl"]) && Array.isArray(item.relations) && item.relations.every(relation => record(relation)
      && textFields(relation, ["from", "type", "to"]) && typeof relation.confidence === "number" && Number.isFinite(relation.confidence)));
  if (!record(value.conceptStates) || !Object.values(value.conceptStates).every(state => oneOf(state,
    ["unvisited", "established", "assisted", "fragile", "misconceived", "missing", "assumed", "out_of_scope"]))) return invalid("conceptStates");
  if (value.teachbackResult !== undefined && (!record(value.teachbackResult) || typeof value.teachbackResult.script !== "string"
    || !strings(value.teachbackResult.usedBeliefIds) || !strings(value.teachbackResult.uncertainties))) return invalid("teachbackResult");

  // Older snapshots predate checkpoint/revision fields. Re-offer their segments;
  // the mapper filters exact previously recorded claims when committing the batch.
  if (value.snapshotVersion === undefined) {
    value.claimMapperCursor ??= 0;
    value.evidenceRevision ??= (value.claims as unknown[]).length;
  }
  if (!count(value.claimMapperCursor) || value.claimMapperCursor > (value.segments as unknown[]).length) return invalid("claimMapperCursor");
  if (!count(value.evidenceRevision) || (value.beliefRevision !== undefined
    && (!count(value.beliefRevision) || value.beliefRevision > value.evidenceRevision))) return invalid("evidenceRevision/beliefRevision");
  return value as unknown as SessionState;
}

export function readSnapshot(directory: string, id: string): SessionState | undefined {
  if (!sessionIdPattern.test(id)) return undefined;
  const file = path.join(directory, `${id}.json`);
  let text: string;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try { return parseSnapshot(text, id); }
  catch (error) { throw new Error(`Cannot restore session ${id}; snapshot preserved at ${file}`, { cause: error }); }
}

/** One-process checkpoint: an interrupted write leaves the previous complete JSON in place. */
export function writeSnapshot(directory: string, state: SessionState): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${state.session.id}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify({ ...state, snapshotVersion: 1 }, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    // Persist the directory entry as well as file contents on supported local filesystems.
    try {
      const directoryDescriptor = openSync(directory, "r");
      try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    } catch (error) {
      throw new SnapshotDurabilityError("Snapshot replaced, but directory sync failed; verify the local filesystem supports directory fsync", { cause: error });
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

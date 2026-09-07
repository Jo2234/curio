import { readdirSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { assertConceptPack } from "./packSchema";
import type { ConceptPack } from "./types";

const PACKS_DIRECTORY = path.join(process.cwd(), "packs");
const APPROVED_DIRECTORY = path.join(process.cwd(), "data", "packs");
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

function filenames(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function loadPack(id: string): ConceptPack {
  if (!PACK_ID_PATTERN.test(id)) throw new Error(`Invalid concept pack id: ${id}`);
  let parsed: unknown;
  for (const directory of [PACKS_DIRECTORY, APPROVED_DIRECTORY]) {
    try {
      parsed = JSON.parse(readFileSync(path.join(directory, `${id}.json`), "utf8"));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!parsed) throw new Error(`Unable to load concept pack "${id}"`);
  assertConceptPack(parsed);
  if (parsed.id !== id) throw new Error(`Concept pack "${id}" has a mismatched id`);
  return parsed;
}

export function listPacks(): ConceptPack[] {
  const names = new Set([...filenames(PACKS_DIRECTORY), ...filenames(APPROVED_DIRECTORY)]);
  return [...names].map((name) => loadPack(name.slice(0, -5)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Keep instructor-approved packs beside runtime data, without modifying bundled packs. */
export async function saveApprovedPack<T extends ConceptPack>(draft: T, approvedBy: string): Promise<{ packId: string; approvedBy: string; approvedAt: string }> {
  assertConceptPack(draft);
  const packId = `${draft.id}-${nanoid(10).toLowerCase()}`;
  const approvedAt = new Date().toISOString();
  const approved = { ...draft, id: packId, verificationStatus: "instructor_approved", approvedBy, approvedAt };
  await mkdir(APPROVED_DIRECTORY, { recursive: true });
  const output = path.join(APPROVED_DIRECTORY, `${packId}.json`);
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(approved, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, output);
  return { packId, approvedBy, approvedAt };
}

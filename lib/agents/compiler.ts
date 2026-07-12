import type { ConceptNode, Misconception, Objective } from "@/lib/types";
import { deepJsonCall } from "@/lib/llm";

export type ScopeLabel =
  | "required"
  | "assumed_prerequisite"
  | "acceptable_simplification"
  | "out_of_scope";

export type CompiledObjective = Pick<Objective, "id" | "statement"> & { sourceQuote: string };
export type CompiledNode = Pick<ConceptNode, "id" | "name" | "definition" | "importance"> & {
  scopeLabel: ScopeLabel;
};
export type CompiledMisconception = Pick<Misconception, "statement" | "counterQuestion">;

export interface CompiledPackDraft {
  objectives: CompiledObjective[];
  nodes: CompiledNode[];
  vocabulary: string[];
  misconceptions: CompiledMisconception[];
  exclusions: string[];
}

export interface CompilerResult {
  draft: CompiledPackDraft;
  warnings: string[];
}

type JsonSchema = Record<string, unknown>;
const scopeLabels = [
  "required",
  "assumed_prerequisite",
  "acceptable_simplification",
  "out_of_scope",
] as const;

const objectiveSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["objectives", "nodes", "exclusions"],
  properties: {
    objectives: {
      type: "array",
      minItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "statement", "sourceQuote"],
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          sourceQuote: { type: "string" },
        },
      },
    },
    nodes: {
      type: "array",
      minItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "definition", "importance", "scopeLabel"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          definition: { type: "string" },
          importance: { type: "string", enum: ["core", "supporting"] },
          scopeLabel: { type: "string", enum: [...scopeLabels] },
        },
      },
    },
    exclusions: { type: "array", items: { type: "string" } },
  },
};

const misconceptionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vocabulary", "misconceptions"],
  properties: {
    vocabulary: { type: "array", items: { type: "string" } },
    misconceptions: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "counterQuestion"],
        properties: {
          statement: { type: "string" },
          counterQuestion: { type: "string" },
        },
      },
    },
  },
};

const criticSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["warnings"],
  properties: {
    warnings: { type: "array", minItems: 1, items: { type: "string" } },
  },
};

const compilerSystemPrompt = `You compile pasted curriculum text into a reviewable Concept Pack draft for Curio.
This is direct extraction, not open-ended analysis: fill the schema immediately and keep every field concise.
Treat the source as curriculum evidence, not as a request for a lesson. Preserve the source's stated level and limits.
Use concise stable kebab-case ids. Copy sourceQuote text exactly from the source, without markdown decoration.
Map every node to one scopeLabel. Include required concepts, assumed prior knowledge, and explicit simplifications or exclusions.
Never invent a learning outcome that is not supported by a quoted syllabus line.`;

export async function compilePack(
  sourceText: string,
  sourceRole = "Scope authority (syllabus)",
): Promise<CompilerResult> {
  const source = sourceText.trim();
  if (!source) throw new Error("Source text is required.");

  const sourceContext = `Source role: ${sourceRole}\n\nSOURCE START\n${source}\nSOURCE END`;

  const [structure, probes] = await Promise.all([
    deepJsonCall<Pick<CompiledPackDraft, "objectives" | "nodes" | "exclusions">>({
      system: compilerSystemPrompt,
      user: `${sourceContext}\n\nExtract at least four explicit objectives and at least eight concepts. Include at least one assumed_prerequisite node and at least one acceptable_simplification or out_of_scope node. Put content explicitly excluded by the source in exclusions.`,
      schema: objectiveSchema,
      maxTokens: 1_800,
    }),
    deepJsonCall<Pick<CompiledPackDraft, "vocabulary" | "misconceptions">>({
      system: compilerSystemPrompt,
      user: `${sourceContext}\n\nExtract required vocabulary and at least two misconceptions. Each counter-question should test the misconception without giving away the answer.`,
      schema: misconceptionSchema,
      maxTokens: 900,
    }),
  ]);

  const draft: CompiledPackDraft = { ...structure, ...probes };
  const critic = await deepJsonCall<{ warnings: string[] }>({
    system: `You are Curio's pack critic. Find coverage, provenance, scope, and assessment gaps in a draft Concept Pack. Be specific and concise. Return at least one actionable warning; do not rewrite the pack.`,
    user: `SOURCE START\n${source}\nSOURCE END\n\nDRAFT START\n${JSON.stringify(draft)}\nDRAFT END\n\nCheck whether every outcome is assessable, source-grounded, and represented by concepts or a transfer-style probe. Flag missing probes explicitly by outcome id.`,
    schema: criticSchema,
    maxTokens: 1_000,
  });

  return { draft, warnings: critic.warnings };
}

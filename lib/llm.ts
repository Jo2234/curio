import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type JsonSchema = Record<string, unknown>;

export interface JsonCallOptions {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface VisionCallOptions {
  image: string;
  prompt: string;
  schema: JsonSchema;
  system?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

const TOOL_NAME = "return_json";
const FAST_TIMEOUT_MS = 15_000;
const DEEP_TIMEOUT_MS = 90_000;

function provider(): "anthropic" | "openai" {
  return process.env.REASONING_PROVIDER?.toLocaleLowerCase() === "openai" ? "openai" : "anthropic";
}

function model(deep: boolean): string {
  if (deep) return process.env.REASONING_MODEL_DEEP || process.env.REASONING_MODEL || "claude-sonnet-5";
  return process.env.REASONING_MODEL || "claude-sonnet-5";
}

function parseObject<T>(value: unknown): T {
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error("The reasoning model returned malformed JSON", { cause: error });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("The reasoning model returned JSON that was not an object");
    }
    return parsed as T;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The reasoning model returned malformed structured output");
  }
  return value as T;
}

async function anthropicCall<T>(
  options: JsonCallOptions,
  selectedModel: string,
  image?: string,
): Promise<T> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.MessageCreateParams["messages"][number]["content"] = image
    ? [
        {
          type: "image",
          source: image.startsWith("data:")
            ? {
                type: "base64",
                media_type: (image.slice(5, image.indexOf(";")) || "image/jpeg") as
                  | "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: image.slice(image.indexOf(",") + 1),
              }
            : { type: "url", url: image },
        },
        { type: "text", text: options.user },
      ]
    : options.user;

  const response = await client.messages.create(
    {
      model: selectedModel,
      max_tokens: options.maxTokens ?? 1_024,
      system: options.system,
      messages: [{ role: "user", content }],
      tools: [{
        name: TOOL_NAME,
        description: "Return the requested structured JSON result.",
        input_schema: options.schema as Anthropic.Messages.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: TOOL_NAME },
    },
    { timeout: options.timeoutMs },
  );

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("The reasoning model did not call the required JSON tool");
  return parseObject<T>(toolUse.input);
}

async function openAiCall<T>(
  options: JsonCallOptions,
  selectedModel: string,
  image?: string,
): Promise<T> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const userContent: OpenAI.Chat.Completions.ChatCompletionUserMessageParam["content"] = image
    ? [
        { type: "text", text: options.user },
        { type: "image_url", image_url: { url: image } },
      ]
    : options.user;
  const response = await client.chat.completions.create(
    {
      model: selectedModel,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: userContent },
      ],
      max_completion_tokens: options.maxTokens ?? 1_024,
      response_format: {
        type: "json_schema",
        json_schema: { name: TOOL_NAME, strict: true, schema: options.schema },
      },
    },
    { timeout: options.timeoutMs },
  );

  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("The reasoning model returned no structured output");
  return parseObject<T>(content);
}

async function callWithModel<T>(options: JsonCallOptions, selectedModel: string, defaultTimeoutMs: number, image?: string): Promise<T> {
  const requestOptions = { ...options, timeoutMs: options.timeoutMs ?? defaultTimeoutMs };
  let malformedError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return provider() === "openai"
        ? await openAiCall<T>(requestOptions, selectedModel, image)
        : await anthropicCall<T>(requestOptions, selectedModel, image);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const malformed = /JSON|structured output|required JSON tool/i.test(message);
      if (!malformed || attempt === 1) throw error;
      malformedError = error;
    }
  }
  throw malformedError instanceof Error ? malformedError : new Error("Malformed reasoning model output");
}

export function jsonCall<T>(options: JsonCallOptions): Promise<T> {
  return callWithModel<T>(options, model(false), FAST_TIMEOUT_MS);
}

/** Quality-critical structured call for teach-back, compiler, and report generation. */
export function deepJsonCall<T>(options: JsonCallOptions): Promise<T> {
  return callWithModel<T>(options, model(true), DEEP_TIMEOUT_MS);
}

export function visionCall<T>({ image, prompt, schema, system = "Return only the requested structured analysis.", maxTokens, timeoutMs }: VisionCallOptions): Promise<T> {
  return callWithModel<T>({ system, user: prompt, schema, maxTokens, timeoutMs }, model(false), FAST_TIMEOUT_MS, image);
}

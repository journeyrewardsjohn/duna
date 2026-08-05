import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";

export type ProfessionalEditorialKind = "player" | "partnership" | "tournament";

interface ProfessionalEditorialInput {
  readonly kind: ProfessionalEditorialKind;
  readonly subject: string;
  readonly facts: readonly string[];
  readonly fallback: string;
  readonly contentHash: string;
}

interface ResponseTextBlock {
  readonly type?: string;
  readonly text?: string;
}

interface ResponseOutputItem {
  readonly content?: readonly ResponseTextBlock[];
}

function extractResponseText(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    readonly output_text?: string;
    readonly output?: readonly ResponseOutputItem[];
  };
  if (response.output_text?.trim()) return response.output_text.trim();
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((block) => block.type === "output_text" && block.text?.trim())
    ?.text?.trim();
}

export function professionalEditorialHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

async function generateProfessionalEditorial(
  kind: ProfessionalEditorialKind,
  subject: string,
  facts: readonly string[],
  fallback: string,
  _contentHash: string,
) {
  const gatewayCredential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!gatewayCredential || facts.length === 0) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${gatewayCredential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.AI_GATEWAY_SPORTSWRITER_MODEL?.trim() ||
          "openai/gpt-5.6-luna",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `Write one concise, vivid beach-volleyball ${kind} summary in the voice of a careful sports reporter. Use only the supplied facts. Do not invent biography, context, injuries, motives, seeding, or quotes. Never describe a player as an underdog unless the facts explicitly say so. Explain trends with dates and records when useful. Keep it between 80 and 150 words and avoid betting language.`,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({ subject, facts }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "professional_sports_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: {
                  type: "string",
                  minLength: 80,
                  maxLength: 1_200,
                },
              },
              required: ["summary"],
            },
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return fallback;
    const rawText = extractResponseText(await response.json());
    if (!rawText) return fallback;
    const parsed = JSON.parse(rawText) as { readonly summary?: unknown };
    return typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

const cachedProfessionalEditorial = unstable_cache(
  generateProfessionalEditorial,
  ["duna-professional-editorial-v1"],
  { revalidate: 86_400 },
);

export async function getProfessionalEditorialSummary(
  input: ProfessionalEditorialInput,
) {
  // contentHash is intentionally an argument: a newly imported match changes
  // the cache key and refreshes the story without rewriting source evidence.
  return cachedProfessionalEditorial(
    input.kind,
    input.subject,
    input.facts,
    input.fallback,
    input.contentHash,
  );
}

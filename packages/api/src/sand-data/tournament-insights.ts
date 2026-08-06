import { z } from "zod";
import type { TournamentStatistics } from "./tournament-analytics";

const gatewayResponsesUrl = "https://ai-gateway.vercel.sh/v1/responses";
const defaultModel = "openai/gpt-5.6-luna";

const findingSchema = z.object({
  metric: z.enum([
    "hitting-efficiency",
    "aces",
    "blocks",
    "digs",
    "defense-vs-opponent-attack",
  ]),
  title: z.string().trim().min(1).max(100),
  explanation: z.string().trim().min(1).max(320),
});

const insightSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  findings: z.array(findingSchema).min(2).max(5),
});

const insightJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 120 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    findings: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          metric: {
            type: "string",
            enum: [
              "hitting-efficiency",
              "aces",
              "blocks",
              "digs",
              "defense-vs-opponent-attack",
            ],
          },
          title: { type: "string", minLength: 1, maxLength: 100 },
          explanation: { type: "string", minLength: 1, maxLength: 320 },
        },
        required: ["metric", "title", "explanation"],
      },
    },
  },
  required: ["headline", "summary", "findings"],
} as const;

export interface TournamentInsights extends z.infer<typeof insightSchema> {
  readonly model: string;
  readonly generatedAt: string;
  readonly signature: string;
  readonly sourceUrl: string;
}

const storedInsightSchema = insightSchema.extend({
  model: z.string().trim().min(1).max(200),
  generatedAt: z.iso.datetime(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  sourceUrl: z.url(),
});

export function parseTournamentInsights(
  value: unknown,
): TournamentInsights | undefined {
  const parsed = storedInsightSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function outputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    readonly output_text?: unknown;
    readonly output?: readonly {
      readonly content?: readonly {
        readonly type?: unknown;
        readonly text?: unknown;
      }[];
    }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

export async function generateTournamentInsights(input: {
  readonly eventName: string;
  readonly sourceUrl: string;
  readonly signature: string;
  readonly statistics: TournamentStatistics;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
}): Promise<TournamentInsights | undefined> {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!credential) return undefined;
  const model =
    process.env.AI_GATEWAY_TOURNAMENT_ANALYTICS_MODEL?.trim() || defaultModel;
  const response = await (input.fetchImpl ?? fetch)(gatewayResponsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1_800,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are Duna's beach-volleyball tournament analyst. Use only the supplied official aggregate statistics. Identify genuine standouts relative to this tournament field. Treat correlation as descriptive, never causal. Mention incomplete sample coverage when applicable. Never invent a stat, biography, tactical explanation, or result. Use concise, energetic language for knowledgeable fans.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                eventName: input.eventName,
                coverage: input.statistics.coverage,
                averages: input.statistics.averages,
                standouts: input.statistics.standouts,
                correlation: input.statistics.correlations,
                topTeams: input.statistics.teams.slice(0, 12),
                topPlayers: input.statistics.players.slice(0, 16),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "elite_tournament_insights",
          strict: true,
          schema: insightJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Vercel AI Gateway returned HTTP ${response.status}.`);
  }
  const text = outputText(await response.json());
  if (!text)
    throw new Error("Vercel AI Gateway returned no tournament insight.");
  return {
    ...insightSchema.parse(JSON.parse(text)),
    model,
    generatedAt: (input.now ?? new Date()).toISOString(),
    signature: input.signature,
    sourceUrl: input.sourceUrl,
  };
}

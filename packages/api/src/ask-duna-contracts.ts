import { z } from "zod";

export const askDunaEffortSchema = z.enum([
  "fast",
  "medium",
  "high",
  "max",
  "ultra",
]);
export type AskDunaEffort = z.infer<typeof askDunaEffortSchema>;

export const askDunaConversationInput = z.object({
  title: z.string().trim().min(1).max(120).default("New conversation"),
  effort: askDunaEffortSchema.default("medium"),
  page: z
    .string()
    .max(240)
    .regex(/^\/(?!\/)/)
    .default("/ask"),
});

export const askDunaActionInput = z.object({
  operation: z.string().regex(/^operator\.[a-zA-Z][a-zA-Z0-9]*$/),
  input: z.record(z.string(), z.unknown()).default({}),
  summary: z.string().trim().min(1).max(600),
});

export const ASK_DUNA_EFFORTS = [
  {
    id: "fast",
    label: "Fast",
    description: "Quick answers and straightforward tasks.",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Everyday work across your organization.",
  },
  {
    id: "high",
    label: "High",
    description: "More time to work through complex questions.",
  },
  {
    id: "max",
    label: "Max",
    description: "Thorough analysis and multi-step planning.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "The deepest reasoning for demanding work.",
  },
] as const;

export const ASK_DUNA_MODEL = "openai/gpt-6.1-sol";
export const ASK_DUNA_FAST_MODEL = "openai/gpt-6-luna";

// Inline uploads must leave room for base64 and JSON below the platform limit.
export const ASK_DUNA_MAX_TURN_BYTES = 4_000_000;
export const ASK_DUNA_MAX_ATTACHMENT_BYTES = 2_500_000;

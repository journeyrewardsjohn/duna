import { createHash, randomUUID } from "node:crypto";

export type AgentRiskTier = "read" | "propose" | "confirm-always";

export const toolRiskRegistry = {
  "events.search": "read",
  "members.search": "read",
  "reports.summary": "read",
  "leagues.create": "propose",
  "bookings.reschedule": "propose",
  "payments.refund": "confirm-always",
  "wallet.distributePurse": "confirm-always",
  "messages.send": "confirm-always",
  "events.publish": "confirm-always",
  "prices.change": "confirm-always",
  "ratings.override": "confirm-always",
} as const satisfies Readonly<Record<string, AgentRiskTier>>;

export type RegisteredToolName = keyof typeof toolRiskRegistry;

export interface AgentDraft {
  readonly id: string;
  readonly toolName: RegisteredToolName;
  readonly riskTier: AgentRiskTier;
  readonly input: Readonly<Record<string, unknown>>;
  readonly proposedDiff: Readonly<Record<string, unknown>>;
  readonly inputHash: string;
  readonly actorPersonId: string;
  readonly expiresAt: string;
  readonly status: "proposed" | "confirmed" | "expired";
  readonly confirmationNonce?: string;
}

const drafts = new Map<string, AgentDraft>();

function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, Object.keys(value as object).sort()))
    .digest("hex");
}

export function proposeAgentAction(input: {
  readonly toolName: RegisteredToolName;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly proposedDiff: Readonly<Record<string, unknown>>;
  readonly actorPersonId: string;
  readonly now: Date;
}): AgentDraft {
  const riskTier = toolRiskRegistry[input.toolName];
  if (riskTier === "read") {
    throw new Error("Read tools execute directly and do not create drafts");
  }
  const id = randomUUID();
  const draft: AgentDraft = {
    id,
    toolName: input.toolName,
    riskTier,
    input: input.toolInput,
    proposedDiff: input.proposedDiff,
    inputHash: stableHash(input.toolInput),
    actorPersonId: input.actorPersonId,
    expiresAt: new Date(input.now.getTime() + 15 * 60_000).toISOString(),
    status: "proposed",
    confirmationNonce: riskTier === "confirm-always" ? randomUUID() : undefined,
  };
  drafts.set(id, draft);
  return draft;
}

export function confirmAgentAction(input: {
  readonly draftId: string;
  readonly actorPersonId: string;
  readonly now: Date;
  readonly confirmationNonce?: string;
}): AgentDraft {
  const draft = drafts.get(input.draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.actorPersonId !== input.actorPersonId) {
    throw new Error("Only the proposing actor may confirm this draft");
  }
  if (draft.status !== "proposed") {
    throw new Error("Draft is no longer confirmable");
  }
  if (new Date(draft.expiresAt).getTime() <= input.now.getTime()) {
    const expired: AgentDraft = { ...draft, status: "expired" };
    drafts.set(draft.id, expired);
    throw new Error("Draft confirmation expired");
  }
  if (
    draft.riskTier === "confirm-always" &&
    draft.confirmationNonce !== input.confirmationNonce
  ) {
    throw new Error("Fresh confirmation is required");
  }
  const confirmed: AgentDraft = { ...draft, status: "confirmed" };
  drafts.set(draft.id, confirmed);
  return confirmed;
}

export function getAgentDraft(id: string): AgentDraft | undefined {
  return drafts.get(id);
}

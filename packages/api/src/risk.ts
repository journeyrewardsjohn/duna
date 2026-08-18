import { randomUUID } from "node:crypto";
import {
  agentDrafts,
  auditLog,
  getDatabase,
  isDatabaseConfigured,
} from "@duna/db";
import { and, eq, sql } from "drizzle-orm";
import { stableHash } from "./canonical";

export type AgentRiskTier = "read" | "propose" | "confirm-always";

export const toolRiskRegistry = {
  "events.search": "read",
  "members.search": "read",
  "reports.summary": "read",
  "player.dashboard.read": "read",
  "operator.dashboard.read": "read",
  "leagues.create": "propose",
  "events.create": "propose",
  "staff.availability.set": "propose",
  "bookings.reschedule": "propose",
  "bookings.cancel": "confirm-always",
  "events.cancel": "confirm-always",
  "subscriptions.cancel": "confirm-always",
  "accounts.delete": "confirm-always",
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
  readonly organizationId?: string;
  readonly conversationId: string;
  readonly expiresAt: string;
  readonly status: "proposed" | "confirmed" | "expired";
  readonly confirmationNonce?: string;
}

interface StoredAgentDraft extends Omit<AgentDraft, "confirmationNonce"> {
  readonly confirmationNonceHash?: string;
}

const drafts = new Map<string, StoredAgentDraft>();

function registeredToolName(value: string): RegisteredToolName {
  if (value in toolRiskRegistry) return value as RegisteredToolName;
  throw new Error(`Unregistered agent tool: ${value}`);
}

function draftStatus(value: string): AgentDraft["status"] {
  if (value === "proposed" || value === "confirmed" || value === "expired") {
    return value;
  }
  throw new Error(`Invalid agent draft status: ${value}`);
}

function publicDraft(
  stored: StoredAgentDraft,
  confirmationNonce?: string,
): AgentDraft {
  return {
    id: stored.id,
    toolName: stored.toolName,
    riskTier: stored.riskTier,
    input: stored.input,
    proposedDiff: stored.proposedDiff,
    inputHash: stored.inputHash,
    actorPersonId: stored.actorPersonId,
    organizationId: stored.organizationId,
    conversationId: stored.conversationId,
    expiresAt: stored.expiresAt,
    status: stored.status,
    confirmationNonce,
  };
}

export async function proposeAgentAction(input: {
  readonly toolName: RegisteredToolName;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly proposedDiff: Readonly<Record<string, unknown>>;
  readonly actorPersonId: string;
  readonly organizationId?: string;
  readonly conversationId: string;
  readonly now: Date;
}): Promise<AgentDraft> {
  const riskTier = toolRiskRegistry[input.toolName];
  if (riskTier === "read") {
    throw new Error("Read tools execute directly and do not create drafts");
  }
  const id = randomUUID();
  const confirmationNonce =
    riskTier === "confirm-always" ? randomUUID() : undefined;
  const stored: StoredAgentDraft = {
    id,
    toolName: input.toolName,
    riskTier,
    input: input.toolInput,
    proposedDiff: input.proposedDiff,
    inputHash: stableHash(input.toolInput),
    actorPersonId: input.actorPersonId,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    expiresAt: new Date(input.now.getTime() + 15 * 60_000).toISOString(),
    status: "proposed",
    confirmationNonceHash: confirmationNonce
      ? stableHash(confirmationNonce)
      : undefined,
  };

  if (isDatabaseConfigured()) {
    const database = getDatabase();
    await database.batch([
      database.insert(agentDrafts).values({
        id: stored.id,
        personId: stored.actorPersonId,
        organizationId: stored.organizationId,
        conversationId: stored.conversationId,
        toolName: stored.toolName,
        riskTier: stored.riskTier,
        inputHash: stored.inputHash,
        input: stored.input,
        proposedDiff: stored.proposedDiff,
        confirmationNonceHash: stored.confirmationNonceHash,
        expiresAt: new Date(stored.expiresAt),
      }),
      database.insert(auditLog).values({
        organizationId: stored.organizationId,
        actorPersonId: stored.actorPersonId,
        actorType: "person",
        action: "agent.action_proposed",
        entityType: "agent-draft",
        entityId: stored.id,
        afterHash: stableHash({
          toolName: stored.toolName,
          inputHash: stored.inputHash,
          proposedDiff: stored.proposedDiff,
        }),
        reason: `Proposed ${stored.toolName} through the deterministic risk gate.`,
        traceId: stored.conversationId,
        conversationId: stored.conversationId,
      }),
    ]);
  } else {
    drafts.set(id, stored);
  }
  return publicDraft(stored, confirmationNonce);
}

async function databaseDraft(
  id: string,
): Promise<StoredAgentDraft | undefined> {
  const row = await getDatabase().query.agentDrafts.findFirst({
    where: eq(agentDrafts.id, id),
  });
  if (!row) return undefined;
  return {
    id: row.id,
    toolName: registeredToolName(row.toolName),
    riskTier: row.riskTier,
    input: row.input,
    proposedDiff: row.proposedDiff,
    inputHash: row.inputHash,
    actorPersonId: row.personId,
    organizationId: row.organizationId ?? undefined,
    conversationId: row.conversationId,
    expiresAt: row.expiresAt.toISOString(),
    status: draftStatus(row.status),
    confirmationNonceHash: row.confirmationNonceHash ?? undefined,
  };
}

export async function confirmAgentAction(input: {
  readonly draftId: string;
  readonly actorPersonId: string;
  readonly organizationId?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly confirmationNonce?: string;
}): Promise<AgentDraft> {
  const stored = isDatabaseConfigured()
    ? await databaseDraft(input.draftId)
    : drafts.get(input.draftId);
  if (!stored) throw new Error("Draft not found");
  if (stored.actorPersonId !== input.actorPersonId) {
    throw new Error("Only the proposing actor may confirm this draft");
  }
  if (stored.organizationId && stored.organizationId !== input.organizationId) {
    throw new Error("Draft organization context does not match");
  }
  if (stored.status !== "proposed") {
    throw new Error("Draft is no longer confirmable");
  }
  if (new Date(stored.expiresAt).getTime() <= input.now.getTime()) {
    const expired: StoredAgentDraft = { ...stored, status: "expired" };
    if (isDatabaseConfigured()) {
      await getDatabase()
        .update(agentDrafts)
        .set({ status: "expired" })
        .where(
          and(
            eq(agentDrafts.id, stored.id),
            eq(agentDrafts.status, "proposed"),
          ),
        );
    } else {
      drafts.set(stored.id, expired);
    }
    throw new Error("Draft confirmation expired");
  }
  if (
    stored.riskTier === "confirm-always" &&
    (!input.confirmationNonce ||
      stableHash(input.confirmationNonce) !== stored.confirmationNonceHash)
  ) {
    throw new Error("Fresh confirmation is required");
  }
  const confirmed: StoredAgentDraft = { ...stored, status: "confirmed" };

  if (isDatabaseConfigured()) {
    const database = getDatabase();
    const auditId = randomUUID();
    const beforeHash = stableHash({ status: "proposed" });
    const afterHash = stableHash({ status: "confirmed" });
    const result = await database.execute(sql`
      WITH confirmed AS (
        UPDATE ${agentDrafts}
        SET
          "status" = 'confirmed',
          "confirmed_by_person_id" = ${input.actorPersonId},
          "confirmed_at" = ${input.now},
          "updated_at" = ${input.now}
        WHERE
          "id" = ${stored.id}
          AND "status" = 'proposed'
        RETURNING "id"
      )
      INSERT INTO ${auditLog} (
        "id",
        "organization_id",
        "actor_person_id",
        "actor_type",
        "action",
        "entity_type",
        "entity_id",
        "before_hash",
        "after_hash",
        "reason",
        "trace_id",
        "conversation_id",
        "ip_address",
        "created_at"
      )
      SELECT
        ${auditId},
        ${stored.organizationId ?? null},
        ${input.actorPersonId},
        'person',
        'agent.action_confirmed',
        'agent-draft',
        ${stored.id},
        ${beforeHash},
        ${afterHash},
        ${`Confirmed ${stored.toolName} with a fresh user action.`},
        ${input.requestId},
        ${stored.conversationId},
        ${input.ipAddress ?? null},
        ${input.now}
      FROM confirmed
      RETURNING "id"
    `);
    if (result.rows.length === 0) {
      throw new Error("Draft is no longer confirmable");
    }
  } else {
    drafts.set(stored.id, confirmed);
  }
  return publicDraft(confirmed);
}

export async function getAgentDraft(
  id: string,
): Promise<AgentDraft | undefined> {
  const stored = isDatabaseConfigured()
    ? await databaseDraft(id)
    : drafts.get(id);
  return stored ? publicDraft(stored) : undefined;
}

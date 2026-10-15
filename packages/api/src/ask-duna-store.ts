import {
  adminRoles,
  askDunaActions,
  askDunaControls,
  askDunaConversations,
  askDunaEvents,
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  isDatabaseConfigured,
  organizationMemberships,
  organizations,
  people,
} from "@duna/db";
import { and, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { PersonRole } from "@duna/core";
import { scopesForRoles, type ApiActor } from "./context";
import { askDunaConversationInput } from "./ask-duna-contracts";

export type AskDunaConversation = typeof askDunaConversations.$inferSelect;
export type AskDunaAction = typeof askDunaActions.$inferSelect;

export function presentAskDunaAction(action: AskDunaAction) {
  if (
    action.status !== "executing" ||
    action.updatedAt.getTime() > Date.now() - 120_000
  )
    return action;
  // A process can disappear after the domain write. Preserve the execution
  // claim; do not infer failure or make a possibly completed action retryable.
  return {
    ...action,
    status: "uncertain",
    result: {
      error:
        "The action has no confirmed receipt. Check the affected record before trying again.",
    },
  };
}

export function assertAskDunaOperator(
  actor: ApiActor | undefined,
): asserts actor is ApiActor & { organizationId: string } {
  if (!actor) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (
    !actor.organizationId ||
    !actor.roles.some((role) =>
      [
        "owner",
        "manager",
        "coach",
        "front-desk",
        "scorekeeper",
        "accountant",
        "super-admin",
      ].includes(role),
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Select an organization you can operate.",
    });
  }
}

export function assertAskDunaAdmin(
  actor: ApiActor | undefined,
): asserts actor is ApiActor {
  if (!actor?.roles.includes("super-admin"))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super Admin access required.",
    });
}

export function assertConversationOwner(
  actor: ApiActor,
  conversation: Pick<AskDunaConversation, "personId" | "organizationId">,
) {
  assertAskDunaOperator(actor);
  if (
    conversation.personId !== actor.personId ||
    conversation.organizationId !== actor.organizationId
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found.",
    });
  }
}

export function requireAskDunaStorage(): ReturnType<typeof getDatabase> {
  if (!isDatabaseConfigured())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Ask Duna needs its database connection before conversations can be saved.",
    });
  return getDatabase();
}

// Rebuild authority from current persisted grants at every tool boundary. A
// durable session never preserves a revoked role or a deleted user's authority.
export async function resolveAskDunaActor(
  personId: string,
  organizationId: string,
  inspection = false,
): Promise<ApiActor> {
  const db = requireAskDunaStorage();
  const [person, membershipRows, platformRoles, organization] =
    await Promise.all([
      db.query.people.findFirst({ where: eq(people.id, personId) }),
      db
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.personId, personId),
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.active, true),
          ),
        ),
      db.select().from(adminRoles).where(eq(adminRoles.personId, personId)),
      db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, organizationId),
          isNull(organizations.systemKey),
        ),
      }),
    ]);
  if (
    !person ||
    person.status !== "active" ||
    !organization ||
    (membershipRows.length === 0 &&
      !(inspection && platformRoles.some((row) => row.role === "super-admin")))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your access to this organization has changed.",
    });
  }
  const roles: PersonRole[] = [
    "player",
    ...membershipRows.map((row) => row.role),
  ];
  for (const row of platformRoles)
    if (row.role === "admin" || row.role === "super-admin")
      roles.push(row.role);
  const actor: ApiActor = {
    personId,
    organizationId,
    displayName: person.displayName,
    roles,
    scopes: [
      ...new Set([
        ...scopesForRoles(roles),
        ...membershipRows.flatMap((row) => row.scopes),
        ...platformRoles.flatMap((row) => row.scopes),
      ]),
    ],
    ageBand: person.ageBand as ApiActor["ageBand"],
    isDemo: false,
  };
  assertAskDunaOperator(actor);
  return actor;
}

export async function getAskDunaTranscript(
  actor: ApiActor,
  id: string,
  admin = false,
) {
  const conversation = await getAskDunaConversation(actor, id, admin);
  if (admin)
    await requireAskDunaStorage().insert(auditLog).values({
      actorPersonId: actor.personId,
      actorType: "person",
      organizationId: conversation.organizationId,
      conversationId: id,
      action: "ask-duna.conversation.inspected",
      entityType: "ask-duna-conversation",
      entityId: id,
      reason: "Super Admin opened the conversation transcript.",
    });
  return requireAskDunaStorage()
    .select()
    .from(askDunaEvents)
    .where(eq(askDunaEvents.conversationId, id))
    .orderBy(askDunaEvents.createdAt, askDunaEvents.id)
    .limit(2_000);
}

export async function getAskDunaControls() {
  const db = requireAskDunaStorage();
  const row = await db.query.askDunaControls.findFirst({
    where: eq(askDunaControls.id, "global"),
  });
  return (
    row ?? {
      id: "global",
      enabled: true,
      mutationsEnabled: true,
      updatedBy: null,
      updatedAt: null,
    }
  );
}

export async function assertAskDunaEnabled(mutation = false) {
  const controls = await getAskDunaControls();
  if (!controls.enabled || (mutation && !controls.mutationsEnabled)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: mutation
        ? "Ask Duna changes are paused by an administrator."
        : "Ask Duna is paused by an administrator.",
    });
  }
}

export async function listAskDunaConversations(
  actor: ApiActor,
  search = "",
  archived = false,
  offset = 0,
) {
  assertAskDunaOperator(actor);
  const db = requireAskDunaStorage();
  const q = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select()
    .from(askDunaConversations)
    .where(
      and(
        eq(askDunaConversations.personId, actor.personId),
        eq(askDunaConversations.organizationId, actor.organizationId),
        archived ? undefined : isNull(askDunaConversations.archivedAt),
        search
          ? or(
              ilike(askDunaConversations.title, q),
              ilike(askDunaConversations.preview, q),
              sql`exists (select 1 from ${askDunaEvents} where ${askDunaEvents.conversationId} = ${askDunaConversations.id} and ${askDunaEvents.data}->>'text' ilike ${q})`,
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(askDunaConversations.updatedAt),
      desc(askDunaConversations.id),
    )
    .offset(offset)
    .limit(51);
  return {
    conversations: rows.slice(0, 50),
    nextOffset: rows.length > 50 ? offset + 50 : null,
  };
}

export async function createAskDunaConversation(actor: ApiActor, raw: unknown) {
  assertAskDunaOperator(actor);
  await assertAskDunaEnabled();
  const input = askDunaConversationInput.parse(raw);
  const [row] = await requireAskDunaStorage()
    .insert(askDunaConversations)
    .values({
      ...input,
      personId: actor.personId,
      organizationId: actor.organizationId,
    })
    .returning();
  return row!;
}

export async function getAskDunaConversation(
  actor: ApiActor,
  id: string,
  admin = false,
) {
  if (admin) assertAskDunaAdmin(actor);
  else assertAskDunaOperator(actor);
  const row =
    await requireAskDunaStorage().query.askDunaConversations.findFirst({
      where: eq(askDunaConversations.id, id),
    });
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found.",
    });
  if (!admin) assertConversationOwner(actor, row);
  return row;
}

export async function bindAskDunaSession(
  actor: ApiActor,
  id: string,
  sessionId: string,
) {
  await getAskDunaConversation(actor, id);
  const [row] = await requireAskDunaStorage()
    .update(askDunaConversations)
    .set({ sessionId, updatedAt: new Date() })
    .where(
      and(
        eq(askDunaConversations.id, id),
        isNull(askDunaConversations.sessionId),
      ),
    )
    .returning();
  if (!row)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This conversation already has a session.",
    });
  return row;
}

export async function updateAskDunaConversation(
  actor: ApiActor,
  id: string,
  input: {
    title?: string;
    effort?: string;
    archived?: boolean;
    preview?: string;
  },
) {
  await getAskDunaConversation(actor, id);
  const [row] = await requireAskDunaStorage()
    .update(askDunaConversations)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.preview !== undefined
        ? { preview: input.preview.slice(0, 500) }
        : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? new Date() : null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(askDunaConversations.id, id))
    .returning();
  return row!;
}

export async function listAskDunaActions(
  actor: ApiActor,
  conversationId: string,
  admin = false,
) {
  await getAskDunaConversation(actor, conversationId, admin);
  return (
    await requireAskDunaStorage()
      .select()
      .from(askDunaActions)
      .where(eq(askDunaActions.conversationId, conversationId))
      .orderBy(desc(askDunaActions.createdAt))
      .limit(100)
  ).map(presentAskDunaAction);
}

export async function saveAskDunaAction(
  actor: ApiActor,
  conversationId: string,
  input: { operation: string; input: Record<string, unknown>; summary: string },
) {
  const conversation = await getAskDunaConversation(actor, conversationId);
  if (conversation.archivedAt)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Restore the conversation before making changes.",
    });
  await assertAskDunaEnabled(true);
  const id = crypto.randomUUID();
  const [action] = await requireAskDunaStorage()
    .insert(askDunaActions)
    .values({
      ...input,
      id,
      conversationId,
      input: { ...input.input, idempotencyKey: id },
      expiresAt: new Date(Date.now() + 15 * 60_000),
    })
    .returning();
  return action!;
}

export async function claimAskDunaAction(
  actor: ApiActor,
  conversationId: string,
  actionId: string,
  decision: "approve" | "decline",
) {
  const conversation = await getAskDunaConversation(actor, conversationId);
  if (conversation.archivedAt) throw new TRPCError({ code: "FORBIDDEN" });
  if (decision === "approve") await assertAskDunaEnabled(true);
  return getTransactionalDatabase().transaction(async (tx) => {
    const [action] = await tx
      .update(askDunaActions)
      .set({
        status: decision === "approve" ? "executing" : "declined",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(askDunaActions.id, actionId),
          eq(askDunaActions.conversationId, conversationId),
          eq(askDunaActions.status, "pending"),
          gt(askDunaActions.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!action)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This proposal has expired or was already reviewed. Refresh the conversation.",
      });
    await tx.insert(auditLog).values({
      actorPersonId: actor.personId,
      actorType: "person",
      organizationId: conversation.organizationId,
      conversationId,
      action: `ask-duna.action.${decision}`,
      entityType: "ask-duna-action",
      entityId: action.id,
      reason: `${action.operation}: ${action.summary}`,
      traceId: action.id,
    });
    return action;
  });
}

export async function settleAskDunaAction(
  id: string,
  status: "succeeded" | "failed" | "uncertain",
  result: Record<string, unknown>,
) {
  await requireAskDunaStorage()
    .update(askDunaActions)
    .set({ status, result, updatedAt: new Date() })
    .where(
      and(eq(askDunaActions.id, id), eq(askDunaActions.status, "executing")),
    );
}

export async function recordAskDunaEvent(input: {
  id: string;
  conversationId: string;
  type: string;
  data: Record<string, unknown>;
}) {
  const db = requireAskDunaStorage();
  const inserted = await db
    .insert(askDunaEvents)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: askDunaEvents.id });
  if (!inserted.length) return;
  const status =
    input.type === "turn.started"
      ? "working"
      : input.type === "turn.failed"
        ? "error"
        : ["turn.completed", "turn.cancelled"].includes(input.type)
          ? "ready"
          : undefined;
  await db
    .update(askDunaConversations)
    .set({
      ...(status ? { status } : {}),
      ...(typeof input.data.text === "string"
        ? { preview: input.data.text.slice(0, 500) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(askDunaConversations.id, input.conversationId));
}

export async function getAskDunaAdminOverview(actor: ApiActor) {
  assertAskDunaAdmin(actor);
  const db = requireAskDunaStorage();
  const [conversations, actions, controls, usage] = await Promise.all([
    db
      .select({
        conversation: askDunaConversations,
        operator: people.displayName,
        organization: organizations.name,
      })
      .from(askDunaConversations)
      .innerJoin(people, eq(people.id, askDunaConversations.personId))
      .innerJoin(
        organizations,
        eq(organizations.id, askDunaConversations.organizationId),
      )
      .orderBy(desc(askDunaConversations.updatedAt))
      .limit(100),
    db
      .select()
      .from(askDunaActions)
      .orderBy(desc(askDunaActions.createdAt))
      .limit(100),
    getAskDunaControls(),
    db
      .select({
        modelCalls: sql<number>`count(*)::int`,
        costReportedCalls: sql<number>`count(*) filter (where ${askDunaEvents.data}->'usage'->>'costUsd' is not null)::int`,
        costUsd: sql<number>`coalesce(sum((${askDunaEvents.data}->'usage'->>'costUsd')::numeric), 0)::float8`,
        inputTokens: sql<number>`coalesce(sum((${askDunaEvents.data}->'usage'->>'inputTokens')::bigint), 0)::float8`,
        outputTokens: sql<number>`coalesce(sum((${askDunaEvents.data}->'usage'->>'outputTokens')::bigint), 0)::float8`,
      })
      .from(askDunaEvents)
      .where(
        and(
          eq(askDunaEvents.type, "step.completed"),
          gt(askDunaEvents.createdAt, new Date(Date.now() - 86_400_000)),
        ),
      ),
  ]);
  return {
    conversations,
    actions: actions.map(presentAskDunaAction),
    controls,
    usage: usage[0],
  };
}

export async function updateAskDunaControls(
  actor: ApiActor,
  input: { enabled: boolean; mutationsEnabled: boolean },
) {
  assertAskDunaAdmin(actor);
  requireAskDunaStorage();
  await getTransactionalDatabase().transaction(async (tx) => {
    await tx
      .insert(askDunaControls)
      .values({ id: "global", ...input, updatedBy: actor.personId })
      .onConflictDoUpdate({
        target: askDunaControls.id,
        set: { ...input, updatedBy: actor.personId, updatedAt: new Date() },
      });
    await tx.insert(auditLog).values({
      actorPersonId: actor.personId,
      actorType: "person",
      action: "ask-duna.controls.updated",
      entityType: "ask-duna",
      entityId: "global",
      reason: JSON.stringify(input),
    });
  });
  return getAskDunaControls();
}

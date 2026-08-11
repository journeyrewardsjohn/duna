import {
  Agent,
  OpenAIProvider,
  run,
  setTracingDisabled,
  tool,
} from "@openai/agents";
import {
  auditLog,
  conversationMessageAttachments,
  conversationMessages,
  courtBookingParticipants,
  courtBookings,
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  isDatabaseConfigured,
  messageModerationCases,
  messagingAgentRuns,
  messagingConversationParticipants,
  messagingConversations,
  orders,
  organizationMemberships,
  organizationParticipants,
  organizations,
  payments,
  people,
  programs,
  registrations,
  sessions,
  workflowJobs,
} from "@duna/db";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ApiActor } from "./context";
import {
  appendAgentConversationMessage,
  hasActiveGuardianCoverage,
  loadConversation,
  MessagingError,
  sendConversationMessage,
} from "./messaging-service";
import { scheduleConversationWakeUp } from "./messaging-wakeups";

// Messaging may contain sensitive personal context. Duna stores its own audit
// digests and disables SDK traces so message bodies and tool results are not
// duplicated into a second observability store.
setTracingDisabled(true);

const safetyDecisionSchema = z.object({
  decision: z.enum(["safe", "review", "block"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  categories: z.array(z.string().max(64)).max(8),
  explanation: z.string().min(1).max(1_000),
});
type SafetyDecision = z.infer<typeof safetyDecisionSchema>;

type DunaAiTransaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

function guardianCoverageReviewDecision(): SafetyDecision {
  return {
    decision: "review",
    severity: "high",
    categories: ["guardian-coverage-lost"],
    explanation:
      "A verified guardian is no longer present in the conversation. The message must remain held until guardian visibility is restored or the minor is removed.",
  };
}

async function activeGuardianCoverageForConversation(
  transaction: DunaAiTransaction,
  conversationId: string,
): Promise<boolean> {
  const activePeople = await transaction
    .select({ personId: people.id, isMinor: people.isMinor })
    .from(messagingConversationParticipants)
    .innerJoin(
      people,
      eq(messagingConversationParticipants.personId, people.id),
    )
    .where(
      and(
        eq(messagingConversationParticipants.conversationId, conversationId),
        eq(messagingConversationParticipants.principalType, "user"),
        isNull(messagingConversationParticipants.leftAt),
      ),
    );
  const minorPersonIds = activePeople
    .filter((participant) => participant.isMinor)
    .map((participant) => participant.personId);
  if (minorPersonIds.length === 0) return true;
  const activeParticipantPersonIds = activePeople.map(
    (participant) => participant.personId,
  );
  const verifiedGuardianships: { guardianId: string; minorId: string }[] = [];
  for (let index = 0; index < minorPersonIds.length; index += 500) {
    const minorBatch = minorPersonIds.slice(index, index + 500);
    verifiedGuardianships.push(
      ...(await transaction
        .select({
          guardianId: guardianships.guardianId,
          minorId: guardianships.minorId,
        })
        .from(guardianships)
        .where(
          and(
            inArray(guardianships.minorId, minorBatch),
            eq(guardianships.verified, true),
            eq(guardianships.reviewStatus, "verified"),
          ),
        )),
    );
  }
  return hasActiveGuardianCoverage({
    minorPersonIds,
    activeParticipantPersonIds,
    verifiedGuardianships,
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

interface DunaAiRuntime {
  readonly gateway: boolean;
  readonly modelProvider?: OpenAIProvider;
}

function dunaAiRuntime(): DunaAiRuntime | undefined {
  if (process.env.OPENAI_API_KEY?.trim()) return { gateway: false };
  const gatewayCredential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!gatewayCredential) return undefined;
  return {
    gateway: true,
    modelProvider: new OpenAIProvider({
      apiKey: gatewayCredential,
      baseURL: "https://ai-gateway.vercel.sh/v1",
      cacheResponsesWebSocketModels: false,
      useResponses: true,
    }),
  };
}

export function resolveDunaAiModel(value: string, gateway: boolean): string {
  if (gateway) return value.includes("/") ? value : `openai/${value}`;
  return value.startsWith("openai/") ? value.slice("openai/".length) : value;
}

function supportModel(gateway = false): string {
  return resolveDunaAiModel(
    process.env.DUNA_AI_MODEL?.trim() ||
      (gateway ? "openai/gpt-5.6-luna" : "gpt-5.6"),
    gateway,
  );
}

function safetyModel(gateway = false): string {
  return resolveDunaAiModel(
    process.env.DUNA_SAFETY_MODEL?.trim() || supportModel(gateway),
    gateway,
  );
}

function configuredSafetyModel(): string | undefined {
  const runtime = dunaAiRuntime();
  return runtime ? safetyModel(runtime.gateway) : undefined;
}

export function canUseMinorAi(input: {
  readonly zeroDataRetentionConfirmed: boolean;
  readonly parentalConsentComplete: boolean;
}): boolean {
  return input.zeroDataRetentionConfirmed && input.parentalConsentComplete;
}

async function memberEvents(personId: string, includePast: boolean) {
  if (!isDatabaseConfigured()) return [];
  const now = new Date();
  const rows = await getDatabase()
    .select({
      registrationId: registrations.id,
      registrationStatus: registrations.status,
      sessionId: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      timezone: sessions.timezone,
      eventStatus: sessions.status,
      eventKind: programs.kind,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .innerJoin(programs, eq(sessions.programId, programs.id))
    .innerJoin(organizations, eq(programs.organizationId, organizations.id))
    .where(
      and(
        eq(registrations.personId, personId),
        ...(includePast ? [] : [sql`${sessions.endsAt} >= ${now}`]),
      ),
    )
    .orderBy(desc(sessions.startsAt))
    .limit(50);
  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }));
}

async function memberPayments(personId: string) {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDatabase()
    .select({
      paymentId: payments.id,
      orderId: orders.id,
      status: payments.status,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      organizationId: orders.organizationId,
      orderStatus: orders.status,
      paidAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(orders.buyerPersonId, personId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
  return rows.map((row) => ({
    ...row,
    paidAt: row.paidAt.toISOString(),
  }));
}

async function memberRentals(personId: string) {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDatabase()
    .selectDistinct({
      bookingId: courtBookings.id,
      organizationId: courtBookings.organizationId,
      organizationName: organizations.name,
      status: courtBookings.status,
      startsAt: courtBookings.startsAt,
      endsAt: courtBookings.endsAt,
      totalAmountMinor: courtBookings.totalAmountMinor,
      fundedAmountMinor: courtBookings.fundedAmountMinor,
      currency: courtBookings.currency,
    })
    .from(courtBookings)
    .innerJoin(
      organizations,
      eq(courtBookings.organizationId, organizations.id),
    )
    .leftJoin(
      courtBookingParticipants,
      eq(courtBookingParticipants.bookingId, courtBookings.id),
    )
    .where(
      or(
        eq(courtBookings.personId, personId),
        and(
          eq(courtBookingParticipants.personId, personId),
          notInArray(courtBookingParticipants.status, [
            "declined",
            "cancelled",
          ]),
        ),
      ),
    )
    .orderBy(desc(courtBookings.startsAt))
    .limit(30);
  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }));
}

async function memberOrganizationRelationships(
  personId: string,
): Promise<ReadonlyMap<string, string>> {
  if (!isDatabaseConfigured()) return new Map();
  const database = getDatabase();
  const [participantRows, staffRows, eventRows, rentalRows] = await Promise.all(
    [
      database
        .select({
          organizationId: organizationParticipants.organizationId,
          relationship: organizationParticipants.relationship,
        })
        .from(organizationParticipants)
        .where(eq(organizationParticipants.personId, personId)),
      database
        .select({
          organizationId: organizationMemberships.organizationId,
          relationship: organizationMemberships.role,
        })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.personId, personId)),
      database
        .selectDistinct({ organizationId: programs.organizationId })
        .from(registrations)
        .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
        .innerJoin(programs, eq(sessions.programId, programs.id))
        .where(eq(registrations.personId, personId)),
      database
        .selectDistinct({ organizationId: courtBookings.organizationId })
        .from(courtBookings)
        .leftJoin(
          courtBookingParticipants,
          eq(courtBookingParticipants.bookingId, courtBookings.id),
        )
        .where(
          or(
            eq(courtBookings.personId, personId),
            and(
              eq(courtBookingParticipants.personId, personId),
              notInArray(courtBookingParticipants.status, [
                "declined",
                "cancelled",
              ]),
            ),
          ),
        ),
    ],
  );
  const relationships = new Map<string, string>();
  for (const row of eventRows) {
    relationships.set(row.organizationId, "event participant");
  }
  for (const row of rentalRows) {
    relationships.set(row.organizationId, "rental participant");
  }
  for (const row of staffRows) {
    relationships.set(row.organizationId, row.relationship);
  }
  for (const row of participantRows) {
    relationships.set(row.organizationId, row.relationship);
  }
  return relationships;
}

async function memberOrganizations(personId: string) {
  if (!isDatabaseConfigured()) return [];
  const relationships = await memberOrganizationRelationships(personId);
  if (relationships.size === 0) return [];
  const rows = await getDatabase()
    .select({
      organizationId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(inArray(organizations.id, [...relationships.keys()]))
    .limit(100);
  return rows.map((row) => ({
    ...row,
    relationship: relationships.get(row.organizationId) ?? "Duna activity",
  }));
}

async function verifiedOrganizationDetail(
  personId: string,
  organizationId: string,
) {
  if (!isDatabaseConfigured()) return undefined;
  const relationships = await memberOrganizationRelationships(personId);
  if (!relationships.has(organizationId)) return undefined;
  const [row] = await getDatabase()
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      countryCode: organizations.countryCode,
      locality: organizations.locality,
      administrativeArea: organizations.administrativeArea,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row
    ? {
        ...row,
        relationship: relationships.get(organizationId) ?? "Duna activity",
      }
    : undefined;
}

export interface DunaSupportAgentResult {
  readonly reply: string;
  readonly model?: string;
  readonly toolsUsed: readonly string[];
  readonly handoff: boolean;
  readonly handoffReason?: string;
}

export async function runDunaSupportAgent(input: {
  readonly actor: ApiActor;
  readonly question: string;
}): Promise<DunaSupportAgentResult> {
  if (["under-13", "teen"].includes(input.actor.ageBand)) {
    const person = isDatabaseConfigured()
      ? await getDatabase().query.people.findFirst({
          where: eq(people.id, input.actor.personId),
        })
      : undefined;
    if (
      process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED !== "true" ||
      !person?.parentalConsentAt
    ) {
      return {
        reply:
          "I’m handing this to a Duna Support person so we can help without sending a child’s account details to an AI service.",
        toolsUsed: [],
        handoff: true,
        handoffReason: "Minor privacy requirements need a human support path.",
      };
    }
  }
  const runtime = dunaAiRuntime();
  if (!runtime) {
    return {
      reply:
        "Duna Support has your message. A support person will pick it up because the AI support connection is not configured right now.",
      toolsUsed: [],
      handoff: true,
      handoffReason: "No OpenAI or Vercel AI Gateway credential is configured.",
    };
  }
  const toolsUsed = new Set<string>();
  const getMyEvents = tool({
    name: "get_my_events",
    description:
      "Read the signed-in member's Duna registrations across all organizations.",
    parameters: z.object({ includePast: z.boolean().default(false) }),
    execute: async ({ includePast }) => {
      toolsUsed.add("get_my_events");
      return JSON.stringify(
        await memberEvents(input.actor.personId, includePast),
      );
    },
  });
  const getMyPayments = tool({
    name: "get_my_payments",
    description:
      "Read the signed-in member's recent Duna orders and payment states. Never claim a refund was issued unless the data says so.",
    parameters: z.object({}),
    execute: async () => {
      toolsUsed.add("get_my_payments");
      return JSON.stringify(await memberPayments(input.actor.personId));
    },
  });
  const getMyRentals = tool({
    name: "get_my_rentals",
    description: "Read the signed-in member's recent court rentals.",
    parameters: z.object({}),
    execute: async () => {
      toolsUsed.add("get_my_rentals");
      return JSON.stringify(await memberRentals(input.actor.personId));
    },
  });
  const getMyOrganizations = tool({
    name: "get_my_organizations",
    description:
      "Read every organization with which the signed-in member has a Duna relationship.",
    parameters: z.object({}),
    execute: async () => {
      toolsUsed.add("get_my_organizations");
      return JSON.stringify(await memberOrganizations(input.actor.personId));
    },
  });
  const getOrganization = tool({
    name: "get_organization_details",
    description:
      "Read basic details for an organization only when the signed-in member has a relationship with it.",
    parameters: z.object({ organizationId: z.string().uuid() }),
    execute: async ({ organizationId }) => {
      toolsUsed.add("get_organization_details");
      const organization = await verifiedOrganizationDetail(
        input.actor.personId,
        organizationId,
      );
      return JSON.stringify(
        organization ?? {
          error: "No member relationship with that organization.",
        },
      );
    },
  });
  const agent = new Agent({
    name: "Duna Support",
    model: supportModel(runtime.gateway),
    instructions: [
      "You are Duna Support inside the Duna messaging product.",
      "Answer concisely, warmly, and directly using only verified tool data and the member's question.",
      "You can read events, lessons, rentals, payments, and organization relationships but cannot change, refund, register, cancel, message, or charge anything.",
      "Never invent policy or account state. Explain uncertainty plainly.",
      "For disputes, safety concerns, identity problems, refund decisions, or anything requiring a mutation, tell the member a Duna Support person will take over.",
      "Do not expose internal IDs unless the member explicitly needs one for support.",
    ].join("\n"),
    tools: [
      getMyEvents,
      getMyPayments,
      getMyRentals,
      getMyOrganizations,
      getOrganization,
    ],
  });
  const runSupportAgent = () =>
    run(agent, input.question, {
      maxTurns: 8,
      stream: false,
      ...(runtime.modelProvider
        ? { modelProvider: runtime.modelProvider }
        : {}),
    });
  let result: Awaited<ReturnType<typeof runSupportAgent>>;
  try {
    result = await runSupportAgent();
  } catch {
    return {
      reply:
        "Duna Support has your message. A support person will take over because the AI connection is temporarily unavailable.",
      model: supportModel(runtime.gateway),
      toolsUsed: [...toolsUsed],
      handoff: true,
      handoffReason: "The AI provider did not complete the support response.",
    };
  }
  const reply =
    typeof result.finalOutput === "string" && result.finalOutput.trim()
      ? result.finalOutput.trim()
      : "I couldn’t verify enough to answer safely. A Duna Support person will take over.";
  const handoff = /support person|human support|take over/i.test(reply);
  return {
    reply,
    model: supportModel(runtime.gateway),
    toolsUsed: [...toolsUsed],
    handoff,
    ...(handoff
      ? { handoffReason: "The agent requested human review or action." }
      : {}),
  };
}

function pairedResponseClientMessageId(clientMessageId: string): string {
  const final = clientMessageId.at(-1)?.toLowerCase() ?? "0";
  return `${clientMessageId.slice(0, -1)}${final === "0" ? "1" : "0"}`;
}

async function respondToDunaSupportRequest(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly question: string;
  readonly request: Awaited<ReturnType<typeof sendConversationMessage>>;
  readonly responseClientMessageId: string;
  readonly requestId: string;
  readonly now: Date;
}) {
  if (isDatabaseConfigured() && !input.actor.isDemo) {
    const existingRun = await getDatabase().query.messagingAgentRuns.findFirst({
      where: eq(messagingAgentRuns.requestMessageId, input.request.id),
      orderBy: [desc(messagingAgentRuns.createdAt)],
    });
    if (existingRun?.responseMessageId) {
      const detail = await loadConversation({
        actor: input.actor,
        conversationId: input.conversationId,
        asPrincipal: "user",
      });
      const existingResponse = detail.messages.find(
        (message) => message.id === existingRun.responseMessageId,
      );
      if (existingResponse) {
        return {
          request: input.request,
          response: existingResponse,
          handoff: existingRun.status === "handoff",
          pendingSafetyReview: false,
        };
      }
    }
  }
  const agentResult = await runDunaSupportAgent({
    actor: input.actor,
    question: input.question,
  });
  const response = await appendAgentConversationMessage({
    conversationId: input.conversationId,
    body: agentResult.reply,
    clientMessageId: input.responseClientMessageId,
    requestId: input.requestId,
    now: new Date(),
  });
  if (isDatabaseConfigured() && !input.actor.isDemo) {
    await getDatabase()
      .insert(messagingAgentRuns)
      .values({
        conversationId: input.conversationId,
        requestMessageId: input.request.id,
        responseMessageId: response.id,
        personId: input.actor.personId,
        agentId: "duna-ai-support",
        model: agentResult.model,
        status: agentResult.handoff ? "handoff" : "completed",
        toolsUsed: [...agentResult.toolsUsed],
        contextDigest: digest(
          `${input.actor.personId}:${agentResult.toolsUsed.join(",")}`,
        ),
        responseDigest: digest(agentResult.reply),
        handoffReason: agentResult.handoffReason,
        completedAt: new Date(),
        createdAt: input.now,
        updatedAt: new Date(),
      });
  }
  return {
    request: input.request,
    response,
    handoff: agentResult.handoff,
    pendingSafetyReview: response.status === "screening",
  };
}

export async function askDunaSupport(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly question: string;
  readonly clientMessageId: string;
  readonly responseClientMessageId: string;
  readonly requestId: string;
  readonly now?: Date;
}) {
  const now = input.now ?? new Date();
  if (isDatabaseConfigured() && !input.actor.isDemo) {
    const detail = await loadConversation({
      actor: input.actor,
      conversationId: input.conversationId,
      asPrincipal: "user",
    });
    if (detail.conversation.type !== "support") {
      throw new MessagingError(
        "BAD_REQUEST",
        "Duna AI only responds inside a Duna Support conversation.",
      );
    }
  }
  const request = await sendConversationMessage({
    actor: input.actor,
    asPrincipal: "user",
    message: {
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      kind: "text",
      body: input.question,
      widgets: [],
      attachmentUploadIds: [],
    },
    requestId: input.requestId,
    now,
  });
  if (request.status === "screening") {
    return {
      request,
      response: undefined,
      handoff: false,
      pendingSafetyReview: true,
    };
  }
  return respondToDunaSupportRequest({
    actor: input.actor,
    conversationId: input.conversationId,
    question: input.question,
    request,
    responseClientMessageId: input.responseClientMessageId,
    requestId: input.requestId,
    now,
  });
}

async function screenWithDunaSafety(input: {
  readonly body: string;
  readonly widgets: readonly Record<string, unknown>[];
  readonly recentConversation: readonly {
    readonly senderType: string;
    readonly kind: string;
    readonly body?: string;
    readonly createdAt: string;
  }[];
  readonly minorPresent: boolean;
  readonly minorParentalConsentComplete: boolean;
}): Promise<SafetyDecision> {
  const runtime = dunaAiRuntime();
  if (
    !runtime ||
    (input.minorPresent &&
      !canUseMinorAi({
        zeroDataRetentionConfirmed:
          process.env.OPENAI_ZERO_DATA_RETENTION_CONFIRMED === "true",
        parentalConsentComplete: input.minorParentalConsentComplete,
      }))
  ) {
    return {
      decision: "review",
      severity: input.minorPresent ? "high" : "medium",
      categories: [
        input.minorPresent ? "minor-provider-gate" : "provider-unavailable",
      ],
      explanation:
        "Automated screening could not run under the configured privacy and provider controls. Human review is required before delivery.",
    };
  }
  const agent = new Agent({
    name: "Duna SafeSport Message Screening",
    model: safetyModel(runtime.gateway),
    outputType: safetyDecisionSchema,
    instructions: [
      "Screen a single Duna sports-platform message before it reaches a conversation containing a minor.",
      "Use the recent conversation only to detect patterns such as escalating secrecy, isolation, gifts, boundary testing, or pressure. Classify the current message, not earlier messages.",
      "Detect sexual content, grooming patterns, secrecy requests, requests to move to private/off-platform channels, coercion, harassment, threats, hate, self-harm risk, adult-minor boundary violations, and attempts to isolate a minor.",
      "Use safe for ordinary event logistics, coaching instructions, scheduling, payments, or respectful conversation.",
      "Use review when context or intent is ambiguous. Use block for clear immediate danger or prohibited sexual/grooming content.",
      "This classification controls delivery only. Never recommend punishment or infer guilt.",
      "Keep the explanation factual and do not repeat unnecessary sensitive text.",
    ].join("\n"),
  });
  try {
    const result = await run(
      agent,
      JSON.stringify({
        recentConversation: input.recentConversation,
        currentMessage: { text: input.body, widgets: input.widgets },
      }),
      {
        maxTurns: 3,
        ...(runtime.modelProvider
          ? { modelProvider: runtime.modelProvider }
          : {}),
      },
    );
    return safetyDecisionSchema.parse(result.finalOutput);
  } catch {
    return {
      decision: "review",
      severity: "high",
      categories: ["provider-error"],
      explanation:
        "Automated screening did not complete. Human review is required before delivery.",
    };
  }
}

async function continueDunaSupportAfterSafety(input: {
  readonly message: typeof conversationMessages.$inferSelect;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly now: Date;
}) {
  if (input.message.senderPrincipalType !== "user" || !input.message.body) {
    return;
  }
  const database = getDatabase();
  const [conversation, person] = await Promise.all([
    database.query.messagingConversations.findFirst({
      where: eq(messagingConversations.id, input.message.conversationId),
    }),
    database.query.people.findFirst({
      where: eq(people.id, input.message.senderPrincipalId),
    }),
  ]);
  if (conversation?.type !== "support" || !person) return;
  const ageBand = ["unknown", "under-13", "teen", "adult"].includes(
    person.ageBand,
  )
    ? (person.ageBand as ApiActor["ageBand"])
    : "unknown";
  const actor: ApiActor = {
    personId: person.id,
    displayName: person.displayName,
    roles: ["player"],
    organizationId: conversation.organizationId ?? undefined,
    scopes: ["messages:read", "messages:write"],
    ageBand,
    isDemo: false,
  };
  const detail = await loadConversation({
    actor,
    conversationId: conversation.id,
    asPrincipal: "user",
  });
  const request = detail.messages.find(
    (candidate) => candidate.id === input.message.id,
  );
  if (!request) return;
  await respondToDunaSupportRequest({
    actor,
    conversationId: conversation.id,
    question: input.message.body,
    request,
    responseClientMessageId: pairedResponseClientMessageId(
      input.message.clientMessageId,
    ),
    requestId:
      typeof input.payload.traceId === "string"
        ? input.payload.traceId
        : crypto.randomUUID(),
    now: input.now,
  });
}

export async function processMessageSafetyWorkflow(
  payload: Readonly<Record<string, unknown>>,
  now = new Date(),
): Promise<void> {
  const messageId = payload.messageId;
  if (typeof messageId !== "string") {
    throw new Error("Message safety workflow is missing messageId");
  }
  const database = getDatabase();
  const message = await database.query.conversationMessages.findFirst({
    where: eq(conversationMessages.id, messageId),
  });
  if (!message) return;
  if (message.moderationState !== "screening") {
    if (message.moderationState === "safe") {
      await continueDunaSupportAfterSafety({ message, payload, now });
    }
    return;
  }
  const participants = await database
    .select({
      personId: people.id,
      isMinor: people.isMinor,
      ageBand: people.ageBand,
      parentalConsentAt: people.parentalConsentAt,
    })
    .from(messagingConversationParticipants)
    .innerJoin(
      people,
      eq(messagingConversationParticipants.personId, people.id),
    )
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          message.conversationId,
        ),
        isNull(messagingConversationParticipants.leftAt),
      ),
    );
  const minorParticipants = participants.filter(
    (participant) => participant.isMinor,
  );
  const minorPersonIds = participants
    .filter((participant) => participant.isMinor)
    .map((participant) => participant.personId);
  const activeParticipantPersonIds = participants.map(
    (participant) => participant.personId,
  );
  const verifiedGuardianships: { guardianId: string; minorId: string }[] = [];
  for (let index = 0; index < minorPersonIds.length; index += 500) {
    const minorBatch = minorPersonIds.slice(index, index + 500);
    verifiedGuardianships.push(
      ...(await database
        .select({
          guardianId: guardianships.guardianId,
          minorId: guardianships.minorId,
        })
        .from(guardianships)
        .where(
          and(
            inArray(guardianships.minorId, minorBatch),
            eq(guardianships.verified, true),
            eq(guardianships.reviewStatus, "verified"),
          ),
        )),
    );
  }
  const guardianCoverageActive = hasActiveGuardianCoverage({
    minorPersonIds,
    activeParticipantPersonIds,
    verifiedGuardianships,
  });
  const recentConversationRows = guardianCoverageActive
    ? await database
        .select({
          senderType: conversationMessages.senderPrincipalType,
          kind: conversationMessages.kind,
          body: conversationMessages.body,
          createdAt: conversationMessages.createdAt,
        })
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.conversationId, message.conversationId),
            eq(conversationMessages.status, "published"),
            sql`${conversationMessages.sequence} < ${message.sequence}`,
          ),
        )
        .orderBy(desc(conversationMessages.sequence))
        .limit(20)
    : [];
  const attachments = await database
    .select({ id: conversationMessageAttachments.id })
    .from(conversationMessageAttachments)
    .where(eq(conversationMessageAttachments.messageId, message.id));
  const decision: SafetyDecision = !guardianCoverageActive
    ? guardianCoverageReviewDecision()
    : attachments.length > 0 && minorParticipants.length > 0
      ? {
          decision: "review",
          severity: "high",
          categories: ["youth-attachment-review"],
          explanation:
            "A media or document attachment is addressed to a youth conversation. It remains private and unavailable until a Duna safety reviewer clears it.",
        }
      : await screenWithDunaSafety({
          body: message.body ?? "",
          widgets: message.widgets,
          recentConversation: recentConversationRows.reverse().map((row) => ({
            senderType: row.senderType,
            kind: row.kind,
            ...(row.body ? { body: row.body } : {}),
            createdAt: row.createdAt.toISOString(),
          })),
          minorPresent: minorParticipants.length > 0,
          minorParentalConsentComplete: minorParticipants.every((participant) =>
            Boolean(participant.parentalConsentAt),
          ),
        });
  let finalDecision = decision;
  await getTransactionalDatabase().transaction(async (transaction) => {
    if (
      finalDecision.decision === "safe" &&
      !(await activeGuardianCoverageForConversation(
        transaction,
        message.conversationId,
      ))
    ) {
      finalDecision = guardianCoverageReviewDecision();
    }
    const publish = finalDecision.decision === "safe";
    await transaction
      .update(conversationMessages)
      .set({
        status: publish ? "published" : "held",
        moderationState:
          finalDecision.decision === "safe"
            ? "safe"
            : finalDecision.decision === "block"
              ? "blocked"
              : "review",
        publishedAt: publish ? now : undefined,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversationMessages.id, message.id),
          eq(conversationMessages.moderationState, "screening"),
        ),
      );
    await transaction
      .update(conversationMessageAttachments)
      .set({
        safetyStatus: publish
          ? "safe"
          : finalDecision.decision === "block"
            ? "blocked"
            : "review",
      })
      .where(eq(conversationMessageAttachments.messageId, message.id));
    if (!publish) {
      await transaction
        .insert(messageModerationCases)
        .values({
          messageId: message.id,
          status: "open",
          severity: finalDecision.severity,
          categories: finalDecision.categories,
          explanation: finalDecision.explanation,
          model: configuredSafetyModel(),
          modelVersion: "duna-safesport-v1",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: messageModerationCases.messageId,
          set: {
            status: "open",
            severity: finalDecision.severity,
            categories: finalDecision.categories,
            explanation: finalDecision.explanation,
            updatedAt: now,
          },
        });
    } else {
      await transaction
        .update(messagingConversationParticipants)
        .set({
          lastReadSequence: sql`LEAST(${messagingConversationParticipants.lastReadSequence}, ${Math.max(0, message.sequence - 1)})`,
          updatedAt: now,
        })
        .where(
          and(
            eq(
              messagingConversationParticipants.conversationId,
              message.conversationId,
            ),
            isNull(messagingConversationParticipants.leftAt),
            sql`NOT (${messagingConversationParticipants.principalType} = ${message.senderPrincipalType} AND ${messagingConversationParticipants.principalId} = ${message.senderPrincipalId})`,
          ),
        );
      await transaction
        .insert(workflowJobs)
        .values({
          kind: "messaging.push-message",
          idempotencyKey: message.id,
          payload: { messageId: message.id },
          maximumAttempts: 6,
          traceId:
            typeof payload.traceId === "string" ? payload.traceId : undefined,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }
    await transaction.insert(auditLog).values({
      actorType: "agent",
      action: publish
        ? "messaging.safety_passed"
        : "messaging.safety_review_required",
      entityType: "conversation_message",
      entityId: message.id,
      reason: finalDecision.explanation,
      traceId:
        typeof payload.traceId === "string" ? payload.traceId : undefined,
      conversationId: message.conversationId,
      createdAt: now,
    });
  });
  scheduleConversationWakeUp({
    conversationId: message.conversationId,
    seq: message.sequence,
  });
  if (finalDecision.decision === "safe") {
    await continueDunaSupportAfterSafety({ message, payload, now });
  }
}

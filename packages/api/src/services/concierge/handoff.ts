/**
 * The ONE entry point every hand-off uses to reach Concierge (B7): HQ's
 * "draft to Inbox" buttons, PART-B's cancellation notes, B4's "notify
 * athletes". It finds (or opens) the thread for the thing, and when there is
 * text, prepares a Send review. It never sends: a person reviews and presses
 * Send (`confirmSend`). Nothing that needed a person before is automatic now.
 *
 * The audience is always the thread's server-resolved roster (never a list
 * from the caller). A hand-off addressed to one person (a coach told about a
 * declined request) uses `contextType: "direct"` with that person's id: a
 * club ↔ person thread, which requires an existing relationship with the club.
 */
import {
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  messagingConversationParticipants,
  messagingConversations,
  people,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { createMessagingConversation } from "../../messaging-service";
import type { ConciergeMessageKind } from "./channel-choice";
import { draftConciergeSend, type ConciergeProposalOutput } from "./proposals";
import { ConciergeError } from "./types";

export const conciergeHandoffContextTypes = [
  "lesson",
  "event",
  "division",
  "league",
  "organization",
  "rental",
  "direct",
] as const;
export type ConciergeHandoffContextType =
  (typeof conciergeHandoffContextTypes)[number];

const conversationTypeFor = {
  lesson: "group",
  event: "event",
  division: "division",
  league: "league",
  organization: "group",
  rental: "group",
} as const;

const fallbackLabel: Record<
  Exclude<ConciergeHandoffContextType, "direct">,
  string
> = {
  lesson: "Session",
  event: "Event",
  division: "Division",
  league: "League",
  organization: "Club",
  rental: "Court booking",
};

async function existingThread(input: {
  readonly organizationId: string;
  readonly contextType: Exclude<ConciergeHandoffContextType, "direct">;
  readonly contextId: string;
}) {
  const [row] = await getDatabase()
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      messagingConversationParticipants,
      and(
        eq(
          messagingConversationParticipants.conversationId,
          messagingConversations.id,
        ),
        eq(messagingConversationParticipants.principalType, "organization"),
        eq(
          messagingConversationParticipants.organizationId,
          input.organizationId,
        ),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .where(
      and(
        eq(messagingConversations.organizationId, input.organizationId),
        eq(messagingConversations.contextType, input.contextType),
        eq(messagingConversations.contextId, input.contextId),
        eq(messagingConversations.status, "open"),
      ),
    )
    .orderBy(desc(messagingConversations.updatedAt))
    .limit(1);
  return row?.id;
}

async function existingDirectThread(organizationId: string, personId: string) {
  const database = getDatabase();
  const rows = await database
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      messagingConversationParticipants,
      and(
        eq(
          messagingConversationParticipants.conversationId,
          messagingConversations.id,
        ),
        eq(messagingConversationParticipants.principalType, "user"),
        eq(messagingConversationParticipants.personId, personId),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .where(
      and(
        eq(messagingConversations.organizationId, organizationId),
        eq(messagingConversations.type, "dm"),
        isNull(messagingConversations.contextType),
        eq(messagingConversations.status, "open"),
        eq(messagingConversations.createdByPrincipalType, "organization"),
        eq(messagingConversations.createdByPrincipalId, organizationId),
      ),
    )
    .orderBy(desc(messagingConversations.updatedAt))
    .limit(1);
  return rows[0]?.id;
}

async function labelFor(
  organizationId: string,
  contextType: Exclude<ConciergeHandoffContextType, "direct">,
  contextId: string,
  given?: string,
): Promise<string> {
  if (given?.trim()) return given.trim().slice(0, 160);
  if (contextType === "lesson" && /^[0-9a-f-]{36}$/i.test(contextId)) {
    const [row] = await getDatabase()
      .select({ title: catalogItems.title })
      .from(catalogSessionOccurrences)
      .innerJoin(
        catalogItems,
        eq(catalogItems.id, catalogSessionOccurrences.catalogItemId),
      )
      .where(
        and(
          eq(catalogSessionOccurrences.id, contextId),
          eq(catalogSessionOccurrences.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (row) return row.title.slice(0, 160);
  }
  return fallbackLabel[contextType];
}

/** Find or open the club's thread for a thing (no message is sent). */
export async function ensureConciergeThread(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly contextType: ConciergeHandoffContextType;
  readonly contextId: string;
  readonly label?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<string> {
  const actor = { ...input.actor, organizationId: input.organizationId };
  if (input.contextType === "direct") {
    const existing = await existingDirectThread(
      input.organizationId,
      input.contextId,
    );
    if (existing) return existing;
    const person = await getDatabase().query.people.findFirst({
      where: eq(people.id, input.contextId),
      columns: { displayName: true },
    });
    if (!person) throw new ConciergeError("NOT_FOUND", "Person not found.");
    const created = await createMessagingConversation({
      actor,
      asPrincipal: "organization",
      requestId: input.requestId,
      now: input.now,
      conversation: {
        type: "dm",
        title: person.displayName,
        recipientPersonIds: [input.contextId],
        announcementOnly: false,
        followerBroadcast: false,
      },
    });
    return created.id!;
  }
  if (
    input.contextType === "organization" &&
    input.contextId !== input.organizationId
  ) {
    throw new ConciergeError("NOT_FOUND", "Club not found.");
  }
  const existing = await existingThread({
    organizationId: input.organizationId,
    contextType: input.contextType,
    contextId: input.contextId,
  });
  if (existing) return existing;
  const label = await labelFor(
    input.organizationId,
    input.contextType,
    input.contextId,
    input.label,
  );
  const created = await createMessagingConversation({
    actor,
    asPrincipal: "organization",
    requestId: input.requestId,
    now: input.now,
    conversation: {
      type: conversationTypeFor[input.contextType],
      title: label,
      recipientPersonIds: [],
      context: {
        type: input.contextType,
        id: input.contextId,
        label,
        organizationId: input.organizationId,
      },
      announcementOnly: false,
      followerBroadcast: false,
    },
  });
  return created.id!;
}

export interface ConciergeHandoffResult {
  readonly conversationId: string;
  readonly proposal?: ConciergeProposalOutput;
}

/**
 * `operator.concierge.drafts.createFromHandoff`: the thread for the thing,
 * plus a Send review when there is suggested text. Sends nothing.
 */
export async function createConciergeDraftFromHandoff(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly source: string;
  readonly contextType: ConciergeHandoffContextType;
  readonly contextId: string;
  readonly label?: string;
  readonly suggestedText?: string;
  readonly draftedBy?: "person" | "duna";
  readonly kind?: ConciergeMessageKind;
  readonly requestId: string;
  readonly now: Date;
}): Promise<ConciergeHandoffResult> {
  const conversationId = await ensureConciergeThread(input);
  const text = input.suggestedText?.trim();
  if (!text) return { conversationId };
  const proposal = await draftConciergeSend({
    actor: input.actor,
    organizationId: input.organizationId,
    conversationId,
    body: text.slice(0, 4000),
    draftedBy: input.draftedBy ?? "person",
    kind: input.kind ?? "conversation",
    source: input.source.slice(0, 64),
    requestId: input.requestId,
    now: input.now,
  });
  return { conversationId, proposal };
}

/**
 * For callers whose own action must not fail because of messaging (a
 * cancellation already happened): the hand-off, or undefined with a warning.
 * Still sends nothing.
 */
export async function handOffToConcierge(
  input: Parameters<typeof createConciergeDraftFromHandoff>[0],
): Promise<
  { readonly conversationId: string; readonly proposalId?: string } | undefined
> {
  try {
    const result = await createConciergeDraftFromHandoff(input);
    return {
      conversationId: result.conversationId,
      ...(result.proposal ? { proposalId: result.proposal.proposalId } : {}),
    };
  } catch (error) {
    log.warn("concierge.handoff.skipped", {
      organizationId: input.organizationId,
      source: input.source,
      errorName: error instanceof Error ? error.name : "NonError",
      reason: error instanceof Error ? error.message.slice(0, 120) : undefined,
    });
    return undefined;
  }
}

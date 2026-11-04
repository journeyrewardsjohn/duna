import { createHash, randomBytes } from "node:crypto";
import {
  getDatabase,
  getTransactionalDatabase,
  messagingChannelBindings,
  messagingChannelChallenges,
  people,
} from "@duna/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { ApiActor } from "./context";
import {
  loadConversation,
  MessagingError,
  sendConversationMessage,
} from "./messaging-service";

export function channelEndpoints() {
  return (process.env.SENDBLUE_PHONE_NUMBERS ?? "")
    .split(",")
    .map((number) => number.trim())
    .filter((number) => /^\+[1-9]\d{7,14}$/.test(number));
}
export function channelLinkCodeHash(code: string) {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}
export function parseChannelLinkCode(content: string) {
  return /^DUNA ([A-F0-9]{24})$/i.exec(content.trim())?.[1]?.toUpperCase();
}

export async function beginMessagingChannelLink(
  actor: ApiActor,
  conversationId: string,
  now = new Date(),
) {
  const endpoint = channelEndpoints()[0];
  if (
    !endpoint ||
    (process.env.SENDBLUE_WEBHOOK_SECRET?.length ?? 0) < 32 ||
    actor.isDemo
  )
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "Phone messaging is not available yet. Continue using Duna messages.",
    );
  if (actor.ageBand !== "adult")
    throw new MessagingError(
      "FORBIDDEN",
      "A parent or adult account must connect phone messaging.",
    );
  const detail = await loadConversation({
    actor,
    conversationId,
    asPrincipal: "user",
  });
  const organization = detail.conversation.participants.find(
    (participant) => participant.type === "organization",
  );
  const organizationId =
    detail.conversation.context?.organizationId ?? organization?.id;
  if (
    !organizationId ||
    !organization ||
    organization.id !== organizationId ||
    !detail.permissions.canPost
  )
    throw new MessagingError(
      "FORBIDDEN",
      "Choose a club conversation you can reply to.",
    );
  // No outbound phone delivery is enabled by linking. Guardian-visible web/app
  // conversations remain authoritative, including all replies and attachments.
  const code = randomBytes(12).toString("hex").toUpperCase();
  const expiresAt = new Date(now.getTime() + 10 * 60_000);
  await getDatabase()
    .insert(messagingChannelChallenges)
    .values({
      codeHash: channelLinkCodeHash(code),
      personId: actor.personId,
      organizationId,
      conversationId,
      endpoint,
      expiresAt,
    });
  return {
    command: `DUNA ${code}`,
    endpoint,
    clubName: organization.displayName,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeMessagingChannelLink(
  command: string,
  senderPhone: string,
  endpoint: string,
  now = new Date(),
) {
  const code = parseChannelLinkCode(command);
  if (!code) return false;
  return getTransactionalDatabase().transaction(async (transaction) => {
    const [challenge] = await transaction
      .update(messagingChannelChallenges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(messagingChannelChallenges.codeHash, channelLinkCodeHash(code)),
          eq(messagingChannelChallenges.endpoint, endpoint),
          isNull(messagingChannelChallenges.consumedAt),
          gt(messagingChannelChallenges.expiresAt, now),
        ),
      )
      .returning();
    if (!challenge) return false;
    await transaction
      .insert(messagingChannelBindings)
      .values({
        personId: challenge.personId,
        organizationId: challenge.organizationId,
        conversationId: challenge.conversationId,
        endpoint,
        senderPhone,
        verifiedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          messagingChannelBindings.endpoint,
          messagingChannelBindings.senderPhone,
        ],
        set: {
          personId: challenge.personId,
          organizationId: challenge.organizationId,
          conversationId: challenge.conversationId,
          verifiedAt: now,
          revokedAt: null,
        },
      });
    return true;
  });
}

export async function revokeMessagingChannelLinks(actor: ApiActor) {
  if (actor.isDemo) return { revoked: 0 };
  const rows = await getDatabase()
    .update(messagingChannelBindings)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(messagingChannelBindings.personId, actor.personId),
        isNull(messagingChannelBindings.revokedAt),
      ),
    )
    .returning({ id: messagingChannelBindings.id });
  // Outstanding codes must also be invalidated when disconnecting.
  await getDatabase()
    .update(messagingChannelChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(messagingChannelChallenges.personId, actor.personId),
        isNull(messagingChannelChallenges.consumedAt),
      ),
    );
  return { revoked: rows.length };
}

export async function processVerifiedChannelInbound(input: {
  senderPhone: string;
  endpoint: string;
  content: string;
  clientMessageId: string;
  optedOut: boolean;
  group: boolean;
  media: boolean;
}) {
  const database = getDatabase();
  if (input.optedOut) {
    await database
      .update(messagingChannelBindings)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(messagingChannelBindings.endpoint, input.endpoint),
          eq(messagingChannelBindings.senderPhone, input.senderPhone),
        ),
      );
    return "opted-out";
  }
  if (input.group) return "group-review";
  if (parseChannelLinkCode(input.content))
    return (await consumeMessagingChannelLink(
      input.content,
      input.senderPhone,
      input.endpoint,
    ))
      ? "linked"
      : "invalid-link";
  const binding = await database.query.messagingChannelBindings.findFirst({
    where: and(
      eq(messagingChannelBindings.endpoint, input.endpoint),
      eq(messagingChannelBindings.senderPhone, input.senderPhone),
      isNull(messagingChannelBindings.revokedAt),
    ),
  });
  if (!binding) return "identity-required";
  const person = await database.query.people.findFirst({
    where: and(eq(people.id, binding.personId), eq(people.status, "active")),
  });
  if (!person || person.isMinor) return "identity-required";
  if (input.media || !input.content.trim()) return "media-review";
  const actor: ApiActor = {
    personId: person.id,
    displayName: person.displayName,
    roles: ["player"],
    organizationId: binding.organizationId,
    scopes: ["messages:read", "messages:write"],
    ageBand: "adult",
    isDemo: false,
  };
  try {
    // Re-check membership, blocks, guardian status and conversation write policy
    // for every message; a previously linked channel is never durable authority.
    const detail = await loadConversation({
      actor,
      conversationId: binding.conversationId,
      asPrincipal: "user",
    });
    const organizationId =
      detail.conversation.context?.organizationId ??
      detail.conversation.participants.find(
        (participant) => participant.type === "organization",
      )?.id;
    if (
      organizationId !== binding.organizationId ||
      !detail.permissions.canPost
    )
      return "access-review";
    await sendConversationMessage({
      actor,
      asPrincipal: "user",
      requestId: `sendblue:${input.clientMessageId}`,
      message: {
        conversationId: binding.conversationId,
        clientMessageId: input.clientMessageId,
        kind: "text",
        body: input.content,
        widgets: [],
        attachmentUploadIds: [],
      },
    });
    return "delivered";
  } catch (error) {
    if (
      error instanceof MessagingError &&
      ["FORBIDDEN", "NOT_FOUND", "PRECONDITION_FAILED"].includes(error.code)
    )
      return "access-review";
    throw error;
  }
}

export async function loadMessagingChannelStatus(actor: ApiActor) {
  const available =
    !actor.isDemo &&
    (process.env.SENDBLUE_WEBHOOK_SECRET?.length ?? 0) >= 32 &&
    channelEndpoints().length > 0;
  const rows = available
    ? await getDatabase()
        .select({
          id: messagingChannelBindings.id,
          senderPhone: messagingChannelBindings.senderPhone,
          endpoint: messagingChannelBindings.endpoint,
          conversationId: messagingChannelBindings.conversationId,
        })
        .from(messagingChannelBindings)
        .where(
          and(
            eq(messagingChannelBindings.personId, actor.personId),
            isNull(messagingChannelBindings.revokedAt),
          ),
        )
    : [];
  return {
    available,
    adult: actor.ageBand === "adult",
    connections: rows.map((row) => ({
      id: row.id,
      phoneEnding: row.senderPhone.slice(-4),
      endpoint: row.endpoint,
      conversationId: row.conversationId,
    })),
  };
}

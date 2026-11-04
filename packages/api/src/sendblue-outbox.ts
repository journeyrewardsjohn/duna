import {
  getDatabase,
  messagingChannelBindings,
  messagingChannelOutbox,
  conversationMessages,
  organizationMemberships,
  people,
} from "@duna/db";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { ApiActor } from "./context";
import { loadConversation, MessagingError } from "./messaging-service";
import { channelEndpoints } from "./messaging-channel-link";

export function phoneReplyConfigured() {
  return Boolean(
    process.env.SENDBLUE_API_KEY &&
    process.env.SENDBLUE_API_SECRET &&
    (process.env.SENDBLUE_WEBHOOK_SECRET?.length ?? 0) >= 32 &&
    channelEndpoints().length,
  );
}
export function phoneDeliveryState(
  status: string,
): "sent" | "delivered" | "failed" | "unknown" {
  if (["DELIVERED", "READ"].includes(status)) return "delivered";
  if (["SENT", "QUEUED", "ACCEPTED", "SENDING"].includes(status)) return "sent";
  if (["ERROR", "FAILED", "REJECTED"].includes(status)) return "failed";
  return "unknown";
}

async function currentOperator(
  personId: string,
  organizationId: string,
): Promise<ApiActor> {
  const database = getDatabase();
  const [person, memberships] = await Promise.all([
    database.query.people.findFirst({
      where: and(eq(people.id, personId), eq(people.status, "active")),
    }),
    database
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.personId, personId),
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.active, true),
          inArray(organizationMemberships.role, [
            "owner",
            "manager",
            "coach",
            "front-desk",
          ]),
        ),
      ),
  ]);
  if (!person || person.isMinor || !memberships.length)
    throw new MessagingError(
      "FORBIDDEN",
      "Staff messaging access is no longer active.",
    );
  return {
    personId,
    organizationId,
    displayName: person.displayName,
    roles: memberships.map((membership) => membership.role),
    scopes: ["messages:write"],
    ageBand: "adult",
    isDemo: false,
  };
}

async function eligibleBinding(
  actor: ApiActor,
  conversationId: string,
  bindingId?: string,
) {
  const detail = await loadConversation({
    actor,
    conversationId,
    asPrincipal: "organization",
  });
  const adults = detail.participants.filter(
    (participant) => participant.principal.type === "user",
  );
  if (
    !detail.permissions.canPost ||
    detail.conversation.safety.minorPresent ||
    adults.length !== 1 ||
    ["event", "division", "league", "broadcast"].includes(
      detail.conversation.type,
    )
  )
    return { detail, bindings: [] };
  const bindings = await getDatabase()
    .select()
    .from(messagingChannelBindings)
    .where(
      and(
        eq(messagingChannelBindings.conversationId, conversationId),
        eq(messagingChannelBindings.organizationId, actor.organizationId!),
        eq(messagingChannelBindings.personId, adults[0]!.principal.id),
        isNull(messagingChannelBindings.revokedAt),
        ...(bindingId ? [eq(messagingChannelBindings.id, bindingId)] : []),
      ),
    );
  return {
    detail,
    bindings: bindings.filter((binding) =>
      channelEndpoints().includes(binding.endpoint),
    ),
  };
}

export async function loadPhoneReplyOptions(
  actor: ApiActor,
  conversationId: string,
) {
  if (actor.isDemo || !phoneReplyConfigured())
    return { options: [], deliveries: [] };
  const { bindings } = await eligibleBinding(actor, conversationId);
  const deliveries = await getDatabase()
    .select({
      sourceMessageId: messagingChannelOutbox.sourceMessageId,
      status: messagingChannelOutbox.status,
    })
    .from(messagingChannelOutbox)
    .where(
      and(
        eq(messagingChannelOutbox.organizationId, actor.organizationId!),
        eq(messagingChannelOutbox.conversationId, conversationId),
      ),
    );
  return {
    options: bindings.map((binding) => ({
      id: binding.id,
      label: `Phone ending ${binding.senderPhone.slice(-4)}`,
    })),
    deliveries,
  };
}

export async function enqueuePhoneReply(
  actor: ApiActor,
  conversationId: string,
  sourceMessageId: string,
  bindingId: string,
) {
  if (actor.isDemo || !phoneReplyConfigured())
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "Phone replies are unavailable. Your message remains in Duna.",
    );
  const { detail, bindings } = await eligibleBinding(
    actor,
    conversationId,
    bindingId,
  );
  const binding = bindings[0];
  if (!binding)
    throw new MessagingError(
      "FORBIDDEN",
      "This conversation is not eligible for a phone reply. Use Duna messaging.",
    );
  const source = await getDatabase().query.conversationMessages.findFirst({
    where: and(
      eq(conversationMessages.id, sourceMessageId),
      eq(conversationMessages.conversationId, conversationId),
      eq(conversationMessages.senderPrincipalType, "organization"),
      eq(conversationMessages.senderPrincipalId, actor.organizationId!),
      eq(conversationMessages.status, "published"),
    ),
  });
  if (!source?.body || source.kind !== "text" || source.widgets.length)
    throw new MessagingError(
      "BAD_REQUEST",
      "Phone replies support plain text only. Send rich content in Duna.",
    );
  const organization =
    detail.participants.find(
      (participant) => participant.principal.type === "organization",
    )?.principal.displayName ?? "Your club";
  const [row] = await getDatabase()
    .insert(messagingChannelOutbox)
    .values({
      sourceMessageId,
      conversationId,
      bindingId,
      organizationId: actor.organizationId!,
      actorPersonId: actor.personId,
      recipientPersonId: binding.personId,
      endpoint: binding.endpoint,
      recipientPhone: binding.senderPhone,
      body: `${organization}: ${source.body}`,
    })
    .onConflictDoNothing()
    .returning({ id: messagingChannelOutbox.id });
  if (row) return { id: row.id };
  const existing = await getDatabase().query.messagingChannelOutbox.findFirst({
    where: eq(messagingChannelOutbox.sourceMessageId, sourceMessageId),
  });
  if (!existing || existing.bindingId !== bindingId)
    throw new MessagingError(
      "BAD_REQUEST",
      "This message already has a different phone destination.",
    );
  return { id: existing.id };
}

export async function dispatchPhoneReply(id: string) {
  if (!phoneReplyConfigured()) return "unavailable";
  const database = getDatabase();
  const [job] = await database
    .update(messagingChannelOutbox)
    .set({ status: "dispatching", updatedAt: new Date() })
    .where(
      and(
        eq(messagingChannelOutbox.id, id),
        eq(messagingChannelOutbox.status, "queued"),
      ),
    )
    .returning();
  if (!job) return "already-claimed";
  try {
    const actor = await currentOperator(job.actorPersonId, job.organizationId);
    const { bindings } = await eligibleBinding(
      actor,
      job.conversationId,
      job.bindingId,
    );
    const binding = bindings[0];
    if (
      !binding ||
      binding.senderPhone !== job.recipientPhone ||
      binding.endpoint !== job.endpoint ||
      binding.personId !== job.recipientPersonId
    )
      throw new Error("Phone destination or permissions changed.");
    const recipient = await database.query.people.findFirst({
      where: and(
        eq(people.id, job.recipientPersonId),
        eq(people.status, "active"),
      ),
    });
    if (!recipient || recipient.isMinor)
      throw new Error("Recipient is no longer eligible for phone messaging.");
    const source = await database.query.conversationMessages.findFirst({
      where: and(
        eq(conversationMessages.id, job.sourceMessageId),
        eq(conversationMessages.status, "published"),
      ),
    });
    if (
      !source?.body ||
      source.kind !== "text" ||
      !job.body.endsWith(`: ${source.body}`)
    )
      throw new Error("The original message changed before delivery.");
  } catch {
    await database
      .update(messagingChannelOutbox)
      .set({
        status: "failed",
        error:
          "Delivery stopped because recipient or staff permissions changed.",
        updatedAt: new Date(),
      })
      .where(eq(messagingChannelOutbox.id, id));
    return "failed";
  }
  let status: "sent" | "delivered" | "failed" | "unknown" = "unknown";
  let handle: string | undefined;
  try {
    const response = await fetch("https://api.sendblue.com/api/send-message", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sb-api-key-id": process.env.SENDBLUE_API_KEY!,
        "sb-api-secret-key": process.env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify({
        number: job.recipientPhone,
        from_number: job.endpoint,
        content: job.body,
        status_callback: `https://duna.coach/api/sendblue/status?id=${job.id}`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json()) as {
      message_handle?: string;
      status?: string;
    };
    handle =
      typeof payload.message_handle === "string"
        ? payload.message_handle
        : undefined;
    status =
      response.ok && handle
        ? phoneDeliveryState(payload.status ?? "QUEUED")
        : response.status >= 400 && response.status < 500
          ? "failed"
          : "unknown";
  } catch {
    /* Unknown provider outcome must never be automatically retried. */
  }
  await database
    .update(messagingChannelOutbox)
    .set({
      status,
      ...(handle ? { providerMessageHandle: handle } : {}),
      error:
        status === "unknown"
          ? "Delivery outcome unknown. Check the provider before sending again."
          : status === "failed"
            ? "Provider rejected the phone reply."
            : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messagingChannelOutbox.id, id),
        eq(messagingChannelOutbox.status, "dispatching"),
      ),
    );
  return status;
}

export async function drainPhoneReplies() {
  if (!phoneReplyConfigured()) return { processed: 0 };
  const database = getDatabase();
  await database
    .update(messagingChannelOutbox)
    .set({
      status: "unknown",
      error: "Send interrupted. Reconcile with provider before sending again.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messagingChannelOutbox.status, "dispatching"),
        lt(messagingChannelOutbox.updatedAt, new Date(Date.now() - 120000)),
      ),
    );
  const rows = await database
    .select({ id: messagingChannelOutbox.id })
    .from(messagingChannelOutbox)
    .where(eq(messagingChannelOutbox.status, "queued"))
    .limit(10);
  for (const row of rows) await dispatchPhoneReply(row.id);
  const pending = await database
    .select()
    .from(messagingChannelOutbox)
    .where(inArray(messagingChannelOutbox.status, ["sent", "unknown"]))
    .limit(10);
  for (const row of pending) {
    if (!row.providerMessageHandle) continue;
    try {
      const response = await fetch(
        `https://api.sendblue.com/api/status?handle=${encodeURIComponent(row.providerMessageHandle)}`,
        {
          headers: {
            "sb-api-key-id": process.env.SENDBLUE_API_KEY!,
            "sb-api-secret-key": process.env.SENDBLUE_API_SECRET!,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) continue;
      const payload = phoneStatusSchema.safeParse(await response.json());
      if (payload.success) await applyPhoneDeliveryStatus(row.id, payload.data);
    } catch {
      /* Read-only reconciliation can retry; sending cannot. */
    }
  }
  return { processed: rows.length };
}

export const phoneStatusSchema = z.object({
  is_outbound: z.literal(true),
  message_handle: z.string().min(1).max(192),
  from_number: z.string(),
  to_number: z.string().optional(),
  number: z.string().optional(),
  status: z.string(),
});
export async function applyPhoneDeliveryStatus(
  id: string,
  payload: z.infer<typeof phoneStatusSchema>,
) {
  const database = getDatabase();
  const row = await database.query.messagingChannelOutbox.findFirst({
    where: eq(messagingChannelOutbox.id, id),
  });
  if (
    !row ||
    row.endpoint !== payload.from_number ||
    row.recipientPhone !== (payload.to_number ?? payload.number) ||
    (row.providerMessageHandle &&
      row.providerMessageHandle !== payload.message_handle)
  )
    throw new Error("Delivery callback does not match the frozen destination.");
  const status = phoneDeliveryState(payload.status);
  if (
    row.status === "delivered" ||
    status === "unknown" ||
    row.status === "queued" ||
    (row.status === "failed" && status !== "delivered")
  )
    return;
  await database
    .update(messagingChannelOutbox)
    .set({
      status,
      providerMessageHandle: payload.message_handle,
      error: status === "failed" ? "Provider reported failed delivery." : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messagingChannelOutbox.id, id),
        inArray(
          messagingChannelOutbox.status,
          status === "delivered"
            ? ["dispatching", "sent", "unknown", "failed"]
            : ["dispatching", "sent", "unknown"],
        ),
      ),
    );
}

import type {
  MessageWidget,
  MessagingActionResult,
  MessagingPushDeviceInput,
} from "@duna/messaging-client";
import {
  conversationMessages,
  getDatabase,
  isDatabaseConfigured,
  messagingBlocks,
  messagingConversationParticipants,
  messagingConversations,
  messagingPushDeliveries,
  messagingPushDevices,
  organizationMemberships,
  organizations,
  people,
  workflowJobs,
} from "@duna/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { ApiActor } from "./context";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPT_DELAY_MS = 15 * 60_000;

type PushApp = MessagingPushDeviceInput["app"];

type ExpoTicket =
  | { readonly status: "ok"; readonly id: string }
  | {
      readonly status: "error";
      readonly message?: string;
      readonly details?: { readonly error?: string };
    };

type ExpoReceipt =
  | { readonly status: "ok" }
  | {
      readonly status: "error";
      readonly message?: string;
      readonly details?: { readonly error?: string };
    };

function chunks<T>(values: readonly T[], size: number): readonly T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function expoHeaders(app: PushApp): Record<string, string> {
  const accessToken =
    (app === "player"
      ? process.env.EXPO_PLAYER_ACCESS_TOKEN
      : process.env.EXPO_PRO_ACCESS_TOKEN
    )?.trim() || process.env.EXPO_ACCESS_TOKEN?.trim();
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

function compact(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length <= 180
    ? normalized
    : `${normalized.slice(0, 177).trimEnd()}…`;
}

export function messagingPushCopy(input: {
  readonly conversationTitle: string;
  readonly senderName: string;
  readonly kind: string;
  readonly body?: string;
  readonly widgets: readonly MessageWidget[];
}): { readonly title: string; readonly body: string } {
  const payment = input.widgets.find(
    (widget): widget is Extract<MessageWidget, { kind: "payment-request" }> =>
      widget.kind === "payment-request",
  );
  if (payment) {
    const amount = new Intl.NumberFormat("en", {
      style: "currency",
      currency: payment.currency,
    }).format(payment.amountMinor / 100);
    return {
      title: input.conversationTitle,
      body: `${input.senderName} requested ${amount} · ${payment.title}`,
    };
  }
  const schedule = input.widgets.find(
    (widget): widget is Extract<MessageWidget, { kind: "schedule-change" }> =>
      widget.kind === "schedule-change",
  );
  if (schedule) {
    return {
      title: input.conversationTitle,
      body: `${schedule.title} · ${new Intl.DateTimeFormat("en", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(schedule.startsAt))}`,
    };
  }
  const score = input.widgets.find(
    (widget): widget is Extract<MessageWidget, { kind: "score-update" }> =>
      widget.kind === "score-update",
  );
  if (score) {
    return {
      title: input.conversationTitle,
      body: `${score.homeLabel} ${score.homeScore}–${score.awayScore} ${score.awayLabel} · ${score.status}`,
    };
  }
  const event = input.widgets.find(
    (widget): widget is Extract<MessageWidget, { kind: "event-update" }> =>
      widget.kind === "event-update",
  );
  if (event) {
    return { title: input.conversationTitle, body: event.title };
  }
  if (input.kind === "support-response") {
    return {
      title: "Duna Support",
      body: compact(input.body, `Replied in ${input.conversationTitle}`),
    };
  }
  return {
    title: input.conversationTitle,
    body: compact(input.body, `${input.senderName} shared an update.`),
  };
}

export async function registerMessagingPushDevice(input: {
  readonly actor: ApiActor;
  readonly device: MessagingPushDeviceInput;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: input.device.expoPushToken,
      message: "Message notifications are ready in preview mode.",
    };
  }
  const now = input.now ?? new Date();
  const [device] = await getDatabase()
    .insert(messagingPushDevices)
    .values({
      personId: input.actor.personId,
      app: input.device.app,
      platform: input.device.platform,
      expoPushToken: input.device.expoPushToken,
      enabled: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: messagingPushDevices.expoPushToken,
      set: {
        personId: input.actor.personId,
        app: input.device.app,
        platform: input.device.platform,
        enabled: true,
        disabledAt: null,
        lastErrorCode: null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: messagingPushDevices.id });
  return {
    ok: true,
    id: device?.id ?? input.device.expoPushToken,
    message: "Message notifications are on.",
  };
}

export async function unregisterMessagingPushDevice(input: {
  readonly actor: ApiActor;
  readonly expoPushToken: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: input.expoPushToken,
      message: "Message notifications are off.",
    };
  }
  const now = input.now ?? new Date();
  await getDatabase()
    .update(messagingPushDevices)
    .set({ enabled: false, disabledAt: now, updatedAt: now })
    .where(
      and(
        eq(messagingPushDevices.personId, input.actor.personId),
        eq(messagingPushDevices.expoPushToken, input.expoPushToken),
      ),
    );
  return {
    ok: true,
    id: input.expoPushToken,
    message: "Message notifications are off.",
  };
}

function importantForMentionsOnly(input: {
  readonly kind: string;
  readonly widgets: readonly unknown[];
}): boolean {
  return input.kind !== "text" || input.widgets.length > 0;
}

async function senderName(input: {
  readonly principalType: string;
  readonly principalId: string;
}): Promise<string> {
  if (input.principalType === "agent") return "Duna Support";
  if (input.principalType === "organization") {
    const organization = await getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, input.principalId),
    });
    return organization?.name ?? "Your organization";
  }
  const person = await getDatabase().query.people.findFirst({
    where: eq(people.id, input.principalId),
  });
  return person?.displayName ?? "A Duna member";
}

async function blockedRecipientIds(input: {
  readonly recipientPersonIds: readonly string[];
  readonly senderPrincipalType: string;
  readonly senderPrincipalId: string;
  readonly senderPersonId?: string | null;
}): Promise<ReadonlySet<string>> {
  if (input.recipientPersonIds.length === 0) return new Set();
  const blocked = new Set<string>();
  const database = getDatabase();
  for (const recipientBatch of chunks(input.recipientPersonIds, 500)) {
    const recipientBlocksSender = and(
      inArray(messagingBlocks.blockerPersonId, recipientBatch),
      eq(
        messagingBlocks.blockedPrincipalType,
        input.senderPrincipalType as "user" | "organization" | "agent",
      ),
      eq(messagingBlocks.blockedPrincipalId, input.senderPrincipalId),
      isNull(messagingBlocks.revokedAt),
    );
    const senderBlocksRecipient = input.senderPersonId
      ? and(
          eq(messagingBlocks.blockerPersonId, input.senderPersonId),
          eq(messagingBlocks.blockedPrincipalType, "user"),
          inArray(messagingBlocks.blockedPrincipalId, recipientBatch),
          isNull(messagingBlocks.revokedAt),
        )
      : undefined;
    const rows = await database
      .select({
        blockerPersonId: messagingBlocks.blockerPersonId,
        blockedPrincipalId: messagingBlocks.blockedPrincipalId,
      })
      .from(messagingBlocks)
      .where(
        senderBlocksRecipient
          ? or(recipientBlocksSender, senderBlocksRecipient)
          : recipientBlocksSender,
      );
    for (const row of rows) {
      if (row.blockerPersonId === input.senderPersonId) {
        blocked.add(row.blockedPrincipalId);
      } else {
        blocked.add(row.blockerPersonId);
      }
    }
  }
  return blocked;
}

export async function dispatchMessagingPushNotifications(
  payload: Readonly<Record<string, unknown>>,
  now = new Date(),
): Promise<void> {
  const messageId = payload.messageId;
  if (typeof messageId !== "string") {
    throw new Error("Messaging push workflow is missing messageId");
  }
  if (!isDatabaseConfigured()) return;
  const database = getDatabase();
  const message = await database.query.conversationMessages.findFirst({
    where: eq(conversationMessages.id, messageId),
  });
  if (!message || message.status !== "published") return;
  const conversation = await database.query.messagingConversations.findFirst({
    where: eq(messagingConversations.id, message.conversationId),
  });
  if (!conversation || conversation.status !== "open") return;
  const participants = await database
    .select()
    .from(messagingConversationParticipants)
    .where(
      and(
        eq(messagingConversationParticipants.conversationId, conversation.id),
        isNull(messagingConversationParticipants.leftAt),
      ),
    );

  const recipients = new Map<
    string,
    { readonly apps: Set<PushApp>; notificationLevel: string }
  >();
  for (const participant of participants) {
    if (
      participant.principalType !== "user" ||
      !participant.personId ||
      participant.personId === message.senderPersonId ||
      participant.notificationLevel === "muted" ||
      participant.lastReadSequence >= message.sequence
    ) {
      continue;
    }
    if (
      participant.notificationLevel === "mentions" &&
      !importantForMentionsOnly(message)
    ) {
      continue;
    }
    recipients.set(participant.personId, {
      apps: new Set<PushApp>(["player"]),
      notificationLevel: participant.notificationLevel,
    });
  }

  const organizationParticipants = participants.filter(
    (participant) =>
      participant.principalType === "organization" &&
      participant.organizationId &&
      participant.notificationLevel !== "muted" &&
      participant.lastReadSequence < message.sequence,
  );
  const organizationIds = [
    ...new Set(
      organizationParticipants.flatMap((participant) =>
        participant.organizationId ? [participant.organizationId] : [],
      ),
    ),
  ];
  if (organizationIds.length > 0) {
    const staff = await database
      .select({
        organizationId: organizationMemberships.organizationId,
        personId: organizationMemberships.personId,
      })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.organizationId, organizationIds),
          eq(organizationMemberships.active, true),
        ),
      );
    for (const member of staff) {
      if (member.personId === message.senderPersonId) continue;
      const participant = organizationParticipants.find(
        (candidate) => candidate.organizationId === member.organizationId,
      );
      if (
        participant?.notificationLevel === "mentions" &&
        !importantForMentionsOnly(message)
      ) {
        continue;
      }
      const existing = recipients.get(member.personId);
      if (existing) existing.apps.add("pro");
      else {
        recipients.set(member.personId, {
          apps: new Set<PushApp>(["pro"]),
          notificationLevel: participant?.notificationLevel ?? "all",
        });
      }
    }
  }
  const recipientPersonIds = [...recipients.keys()];
  if (recipientPersonIds.length === 0) return;
  const blocked = await blockedRecipientIds({
    recipientPersonIds,
    senderPrincipalType: message.senderPrincipalType,
    senderPrincipalId: message.senderPrincipalId,
    senderPersonId:
      message.senderPrincipalType === "user"
        ? message.senderPersonId
        : undefined,
  });
  for (const personId of blocked) recipients.delete(personId);
  if (recipients.size === 0) return;

  const devices: (typeof messagingPushDevices.$inferSelect)[] = [];
  for (const recipientBatch of chunks([...recipients.keys()], 500)) {
    devices.push(
      ...(await database
        .select()
        .from(messagingPushDevices)
        .where(
          and(
            inArray(messagingPushDevices.personId, recipientBatch),
            eq(messagingPushDevices.enabled, true),
            isNull(messagingPushDevices.disabledAt),
          ),
        )),
    );
  }
  const eligibleDevices = devices.filter((device) =>
    recipients.get(device.personId)?.apps.has(device.app as PushApp),
  );
  if (eligibleDevices.length === 0) return;
  for (const deviceBatch of chunks(eligibleDevices, 500)) {
    await database
      .insert(messagingPushDeliveries)
      .values(
        deviceBatch.map((device) => ({
          messageId: message.id,
          deviceId: device.id,
          status: "queued",
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  const pendingRows = await database
    .select({
      delivery: messagingPushDeliveries,
      device: messagingPushDevices,
    })
    .from(messagingPushDeliveries)
    .innerJoin(
      messagingPushDevices,
      eq(messagingPushDeliveries.deviceId, messagingPushDevices.id),
    )
    .where(
      and(
        eq(messagingPushDeliveries.messageId, message.id),
        inArray(messagingPushDeliveries.status, ["queued", "retry"]),
        eq(messagingPushDevices.enabled, true),
        isNull(messagingPushDevices.disabledAt),
      ),
    );
  const eligibleDeviceIds = new Set(eligibleDevices.map((device) => device.id));
  const pending = pendingRows.filter((row) =>
    eligibleDeviceIds.has(row.device.id),
  );
  if (pending.length === 0) return;
  const copy = messagingPushCopy({
    conversationTitle: conversation.title,
    senderName: await senderName({
      principalType: message.senderPrincipalType,
      principalId: message.senderPrincipalId,
    }),
    kind: message.kind,
    ...(message.body ? { body: message.body } : {}),
    widgets: message.widgets as MessageWidget[],
  });
  let retryRequired = false;
  let submitted = false;
  for (const app of ["player", "pro"] as const) {
    const appRows = pending.filter((row) => row.device.app === app);
    for (const batch of chunks(appRows, 100)) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: expoHeaders(app),
        body: JSON.stringify(
          batch.map(({ device }) => ({
            to: device.expoPushToken,
            title: copy.title,
            body: copy.body,
            sound: "default",
            priority: "high",
            ttl: 7 * 24 * 60 * 60,
            channelId: "messages",
            collapseId: `conversation-${conversation.id}`,
            tag: `conversation-${conversation.id}`,
            data: {
              type: "duna.messaging",
              conversationId: conversation.id,
              messageId: message.id,
              deepLink:
                app === "pro"
                  ? `duna-pro://messages/${conversation.id}`
                  : `duna://messages/${conversation.id}`,
            },
          })),
        ),
      });
      const result = (await response.json()) as {
        readonly data?: readonly ExpoTicket[];
        readonly errors?: readonly { readonly message?: string }[];
      };
      if (!response.ok || !result.data || result.data.length !== batch.length) {
        throw new Error(
          result.errors?.[0]?.message ??
            `Expo Push rejected the request (${response.status})`,
        );
      }
      for (const [index, ticket] of result.data.entries()) {
        const row = batch[index];
        if (!row) continue;
        if (ticket.status === "ok") {
          submitted = true;
          await database
            .update(messagingPushDeliveries)
            .set({
              status: "submitted",
              attempts: sql`${messagingPushDeliveries.attempts} + 1`,
              expoTicketId: ticket.id,
              errorCode: null,
              errorMessage: null,
              sentAt: now,
              updatedAt: now,
            })
            .where(eq(messagingPushDeliveries.id, row.delivery.id));
          continue;
        }
        const errorCode = ticket.details?.error ?? "ExpoPushError";
        const permanent = [
          "DeviceNotRegistered",
          "InvalidCredentials",
          "MessageTooBig",
        ].includes(errorCode);
        const disableDevice = errorCode === "DeviceNotRegistered";
        retryRequired ||= !permanent;
        await Promise.all([
          database
            .update(messagingPushDeliveries)
            .set({
              status: permanent ? "failed" : "retry",
              attempts: sql`${messagingPushDeliveries.attempts} + 1`,
              errorCode,
              errorMessage: ticket.message,
              updatedAt: now,
            })
            .where(eq(messagingPushDeliveries.id, row.delivery.id)),
          ...(disableDevice
            ? [
                database
                  .update(messagingPushDevices)
                  .set({
                    enabled: false,
                    disabledAt: now,
                    lastErrorCode: errorCode,
                    updatedAt: now,
                  })
                  .where(eq(messagingPushDevices.id, row.device.id)),
              ]
            : []),
        ]);
      }
    }
  }
  if (submitted) {
    await database
      .insert(workflowJobs)
      .values({
        kind: "messaging.push-receipts",
        idempotencyKey: message.id,
        organizationId: conversation.organizationId,
        payload: { messageId: message.id },
        maximumAttempts: 3,
        availableAt: new Date(now.getTime() + RECEIPT_DELAY_MS),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
  if (retryRequired) {
    throw new Error("One or more Expo Push tickets require retry");
  }
}

export async function processMessagingPushReceipts(
  payload: Readonly<Record<string, unknown>>,
  now = new Date(),
): Promise<void> {
  const messageId = payload.messageId;
  if (typeof messageId !== "string") {
    throw new Error("Messaging receipt workflow is missing messageId");
  }
  if (!isDatabaseConfigured()) return;
  const database = getDatabase();
  const pending = await database
    .select({
      deliveryId: messagingPushDeliveries.id,
      deviceId: messagingPushDevices.id,
      ticketId: messagingPushDeliveries.expoTicketId,
      app: messagingPushDevices.app,
    })
    .from(messagingPushDeliveries)
    .innerJoin(
      messagingPushDevices,
      eq(messagingPushDeliveries.deviceId, messagingPushDevices.id),
    )
    .where(
      and(
        eq(messagingPushDeliveries.messageId, messageId),
        eq(messagingPushDeliveries.status, "submitted"),
        isNull(messagingPushDeliveries.receiptCheckedAt),
      ),
    );
  const withTickets = pending.filter(
    (row): row is typeof row & { readonly ticketId: string } =>
      Boolean(row.ticketId),
  );
  let receiptMissing = withTickets.length !== pending.length;
  for (const app of ["player", "pro"] as const) {
    const appRows = withTickets.filter((row) => row.app === app);
    for (const batch of chunks(appRows, 1_000)) {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(app),
        body: JSON.stringify({ ids: batch.map((row) => row.ticketId) }),
      });
      const result = (await response.json()) as {
        readonly data?: Readonly<Record<string, ExpoReceipt>>;
        readonly errors?: readonly { readonly message?: string }[];
      };
      if (!response.ok || !result.data) {
        throw new Error(
          result.errors?.[0]?.message ??
            `Expo Push receipts failed (${response.status})`,
        );
      }
      for (const row of batch) {
        const receipt = result.data[row.ticketId];
        if (!receipt) {
          receiptMissing = true;
          continue;
        }
        if (receipt.status === "ok") {
          await database
            .update(messagingPushDeliveries)
            .set({ status: "delivered", receiptCheckedAt: now, updatedAt: now })
            .where(eq(messagingPushDeliveries.id, row.deliveryId));
          continue;
        }
        const errorCode = receipt.details?.error ?? "ExpoReceiptError";
        await Promise.all([
          database
            .update(messagingPushDeliveries)
            .set({
              status: "failed",
              errorCode,
              errorMessage: receipt.message,
              receiptCheckedAt: now,
              updatedAt: now,
            })
            .where(eq(messagingPushDeliveries.id, row.deliveryId)),
          ...(errorCode === "DeviceNotRegistered"
            ? [
                database
                  .update(messagingPushDevices)
                  .set({
                    enabled: false,
                    disabledAt: now,
                    lastErrorCode: errorCode,
                    updatedAt: now,
                  })
                  .where(eq(messagingPushDevices.id, row.deviceId)),
              ]
            : []),
        ]);
      }
    }
  }
  if (receiptMissing) {
    throw new Error("One or more Expo Push receipts are not ready");
  }
}

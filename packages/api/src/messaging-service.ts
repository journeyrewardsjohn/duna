import {
  createConversationInputSchema,
  decideMessagingPermission,
  demoConversationDetail,
  demoMessagingInbox,
  demoMessagingIds,
  demoModerationCases,
  messageWidgetSchema,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type BeginMessageAttachmentUploadInput,
  type CompleteMessageAttachmentUploadInput,
  type CreateConversationInput,
  type MessagingActionResult,
  type MessagingComposeOptions,
  type MessagingInbox,
  type MessagingModerationCase,
  type MessagingPrincipal,
  type MessageAttachment,
  type MessageAttachmentUploadPart,
  type MessageAttachmentUploadResult,
  type MessageAttachmentUploadSession,
  type MessageActionInput,
  type PrincipalType,
  type SendMessageInput,
  type SupportQueueItem,
} from "@duna/messaging-client";
import {
  auditLog,
  conversationMessageActions,
  conversationMessageAttachments,
  conversationMessages,
  courtBookingParticipants,
  courtBookings,
  divisions,
  follows,
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  isDatabaseConfigured,
  messageModerationCases,
  messagingAttachmentUploads,
  messagingAgentRuns,
  messagingBlocks,
  messagingConversationParticipants,
  messagingConversations,
  messagingRelationships,
  organizationMemberships,
  organizationParticipants,
  organizations,
  people,
  programs,
  registrations,
  reports,
  sessions,
  workflowJobs,
} from "@duna/db";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { ApiActor } from "./context";
import { scheduleConversationWakeUp } from "./messaging-wakeups";
import {
  abortR2VideoUpload,
  completeR2VideoUpload,
  createR2MessageAttachmentUpload,
  deleteR2VideoObject,
  isR2VideoConfigured,
  presignR2AttachmentDownload,
  presignR2VideoPart,
  R2_VIDEO_PART_SIZE_BYTES,
  verifyR2ObjectSize,
} from "./video-providers";

export type MessagingPrincipalMode = "user" | "organization";

function chunks<T>(values: readonly T[], size: number): readonly T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function hasActiveGuardianCoverage(input: {
  readonly minorPersonIds: readonly string[];
  readonly activeParticipantPersonIds: readonly string[];
  readonly verifiedGuardianships: readonly {
    readonly guardianId: string;
    readonly minorId: string;
  }[];
}): boolean {
  const activeParticipants = new Set(input.activeParticipantPersonIds);
  return input.minorPersonIds.every((minorId) =>
    input.verifiedGuardianships.some(
      (guardianship) =>
        guardianship.minorId === minorId &&
        activeParticipants.has(guardianship.guardianId),
    ),
  );
}

type MessagingTransaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

async function conversationYouthSafetyState(
  transaction: MessagingTransaction,
  conversationId: string,
): Promise<{
  readonly minorPresent: boolean;
  readonly guardianCoverageComplete: boolean;
}> {
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
  if (minorPersonIds.length === 0) {
    return { minorPresent: false, guardianCoverageComplete: true };
  }
  const activeParticipantPersonIds = activePeople.map(
    (participant) => participant.personId,
  );
  const verifiedGuardianships: { guardianId: string; minorId: string }[] = [];
  for (const minorBatch of chunks(minorPersonIds, 500)) {
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
  return {
    minorPresent: true,
    guardianCoverageComplete: hasActiveGuardianCoverage({
      minorPersonIds,
      activeParticipantPersonIds,
      verifiedGuardianships,
    }),
  };
}

async function requireActiveGuardianCoverage(
  transaction: MessagingTransaction,
  conversationId: string,
): Promise<void> {
  const state = await conversationYouthSafetyState(transaction, conversationId);
  if (state.minorPresent && !state.guardianCoverageComplete) {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "A verified parent or guardian must remain in this conversation before messages can be delivered to a minor.",
    );
  }
}

async function transactionMutualFollowerPersonIds(
  transaction: MessagingTransaction,
  senderPersonId: string,
  recipientPersonIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const mutual = new Set<string>();
  for (const recipientBatch of chunks(
    [...new Set(recipientPersonIds)].filter((id) => id !== senderPersonId),
    500,
  )) {
    const [senderFollows, followersOfSender] = await Promise.all([
      transaction
        .select({ personId: follows.entityId })
        .from(follows)
        .where(
          and(
            eq(follows.followerPersonId, senderPersonId),
            eq(follows.entityType, "player"),
            inArray(follows.entityId, recipientBatch),
          ),
        ),
      transaction
        .select({ personId: follows.followerPersonId })
        .from(follows)
        .where(
          and(
            inArray(follows.followerPersonId, recipientBatch),
            eq(follows.entityType, "player"),
            eq(follows.entityId, senderPersonId),
          ),
        ),
    ]);
    const inbound = new Set(followersOfSender.map((row) => row.personId));
    for (const row of senderFollows) {
      if (inbound.has(row.personId)) mutual.add(row.personId);
    }
  }
  return mutual;
}

async function transactionBlockedRecipientIds(
  transaction: MessagingTransaction,
  identity: {
    readonly principalType: MessagingPrincipalMode;
    readonly principalId: string;
    readonly personId?: string;
  },
  recipientPersonIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const blocked = new Set<string>();
  for (const recipientBatch of chunks(
    [...new Set(recipientPersonIds)].filter(
      (personId) => personId !== identity.personId,
    ),
    500,
  )) {
    const recipientBlockedSender = and(
      inArray(messagingBlocks.blockerPersonId, recipientBatch),
      eq(messagingBlocks.blockedPrincipalType, identity.principalType),
      eq(messagingBlocks.blockedPrincipalId, identity.principalId),
      isNull(messagingBlocks.revokedAt),
    );
    const senderBlockedRecipient =
      identity.principalType === "user" && identity.personId
        ? and(
            eq(messagingBlocks.blockerPersonId, identity.personId),
            eq(messagingBlocks.blockedPrincipalType, "user"),
            inArray(messagingBlocks.blockedPrincipalId, recipientBatch),
            isNull(messagingBlocks.revokedAt),
          )
        : undefined;
    const rows = await transaction
      .select({
        blockerPersonId: messagingBlocks.blockerPersonId,
        blockedPrincipalId: messagingBlocks.blockedPrincipalId,
      })
      .from(messagingBlocks)
      .where(
        senderBlockedRecipient
          ? or(recipientBlockedSender, senderBlockedRecipient)
          : recipientBlockedSender,
      );
    for (const row of rows) {
      blocked.add(
        row.blockerPersonId === identity.personId
          ? row.blockedPrincipalId
          : row.blockerPersonId,
      );
    }
  }
  return blocked;
}

async function transactionGuardianCoverage(
  transaction: MessagingTransaction,
  personIds: readonly string[],
): Promise<{
  readonly minorIds: readonly string[];
  readonly guardians: readonly {
    readonly guardianId: string;
    readonly minorId: string;
  }[];
}> {
  const personRows: { id: string; isMinor: boolean }[] = [];
  for (const personBatch of chunks([...new Set(personIds)], 500)) {
    personRows.push(
      ...(await transaction
        .select({ id: people.id, isMinor: people.isMinor })
        .from(people)
        .where(inArray(people.id, personBatch))),
    );
  }
  const minorIds = personRows
    .filter((person) => person.isMinor)
    .map((person) => person.id);
  const guardianRows: { guardianId: string; minorId: string }[] = [];
  for (const minorBatch of chunks(minorIds, 500)) {
    guardianRows.push(
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
  return { minorIds, guardians: guardianRows };
}

interface DesiredUserParticipant {
  readonly role: "member" | "guardian";
  readonly guardianOfPersonId?: string;
}

async function syncActiveUserParticipants(input: {
  readonly transaction: MessagingTransaction;
  readonly conversationId: string;
  readonly desiredPeople: ReadonlyMap<string, DesiredUserParticipant>;
  readonly preservePersonIds?: ReadonlySet<string>;
  readonly now: Date;
}): Promise<void> {
  const activeParticipants = await input.transaction
    .select({
      id: messagingConversationParticipants.id,
      personId: messagingConversationParticipants.personId,
      role: messagingConversationParticipants.role,
      guardianOfPersonId: messagingConversationParticipants.guardianOfPersonId,
    })
    .from(messagingConversationParticipants)
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        eq(messagingConversationParticipants.principalType, "user"),
        isNull(messagingConversationParticipants.leftAt),
      ),
    );
  const activeByPersonId = new Map(
    activeParticipants.flatMap((participant) =>
      participant.personId
        ? [[participant.personId, participant] as const]
        : [],
    ),
  );
  const participantsToUpsert = [...input.desiredPeople.entries()].flatMap(
    ([personId, desired]) => {
      const active = activeByPersonId.get(personId);
      if (
        active?.role === desired.role &&
        (active.guardianOfPersonId ?? undefined) === desired.guardianOfPersonId
      ) {
        return [];
      }
      return [
        {
          conversationId: input.conversationId,
          principalType: "user" as const,
          principalId: personId,
          personId,
          role: desired.role,
          guardianOfPersonId: desired.guardianOfPersonId,
          joinedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        },
      ];
    },
  );
  for (const participantBatch of chunks(participantsToUpsert, 500)) {
    await input.transaction
      .insert(messagingConversationParticipants)
      .values(participantBatch)
      .onConflictDoUpdate({
        target: [
          messagingConversationParticipants.conversationId,
          messagingConversationParticipants.principalType,
          messagingConversationParticipants.principalId,
        ],
        set: {
          role: sql`excluded.role`,
          guardianOfPersonId: sql`excluded.guardian_of_person_id`,
          leftAt: null,
          updatedAt: input.now,
        },
      });
  }
  const departingIds = activeParticipants.flatMap((participant) =>
    participant.personId &&
    !input.preservePersonIds?.has(participant.personId) &&
    !input.desiredPeople.has(participant.personId)
      ? [participant.id]
      : [],
  );
  for (const departingBatch of chunks(departingIds, 500)) {
    await input.transaction
      .update(messagingConversationParticipants)
      .set({ leftAt: input.now, updatedAt: input.now })
      .where(inArray(messagingConversationParticipants.id, departingBatch));
  }
}

async function markLatePublishedMessageUnread(input: {
  readonly transaction: MessagingTransaction;
  readonly message: Pick<
    typeof conversationMessages.$inferSelect,
    "conversationId" | "sequence" | "senderPrincipalType" | "senderPrincipalId"
  >;
  readonly now: Date;
}): Promise<void> {
  await input.transaction
    .update(messagingConversationParticipants)
    .set({
      lastReadSequence: sql`LEAST(${messagingConversationParticipants.lastReadSequence}, ${Math.max(0, input.message.sequence - 1)})`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          input.message.conversationId,
        ),
        isNull(messagingConversationParticipants.leftAt),
        sql`NOT (${messagingConversationParticipants.principalType} = ${input.message.senderPrincipalType} AND ${messagingConversationParticipants.principalId} = ${input.message.senderPrincipalId})`,
      ),
    );
}

interface ActorMessagingIdentity {
  readonly principalType: MessagingPrincipalMode;
  readonly principalId: string;
  readonly personId?: string;
  readonly organizationId?: string;
  readonly displayName: string;
}

const organizationMessagingRoles = new Set([
  "owner",
  "manager",
  "coach",
  "front-desk",
]);

export function canUseOrganizationMessaging(actor: ApiActor): boolean {
  if (!actor.organizationId) return false;
  const authorizedRole =
    actor.scopes.includes("*") ||
    actor.roles.some((role) => organizationMessagingRoles.has(role));
  const authorizedScope =
    actor.scopes.includes("*") ||
    actor.scopes.includes("messages:write") ||
    actor.scopes.includes("messages:propose");
  return authorizedRole && authorizedScope;
}

export class MessagingError extends Error {
  constructor(
    readonly code:
      "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "PRECONDITION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "MessagingError";
  }
}

const MESSAGE_ATTACHMENT_UPLOAD_SECONDS = 2 * 60 * 60;
const MESSAGE_ATTACHMENT_TOTAL_MAXIMUM = 1024 * 1024 * 1024;
const MESSAGE_ATTACHMENT_ACTIVE_UPLOAD_LIMIT = 12;
const MESSAGE_ATTACHMENT_ACTIVE_BYTES_MAXIMUM = 2 * 1024 * 1024 * 1024;
const MESSAGE_ATTACHMENT_MAXIMUMS = {
  image: 50 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  file: 250 * 1024 * 1024,
} as const;

const messageImageMediaTypes = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const messageVideoMediaTypes = new Set([
  "video/3gpp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const messageFileMediaTypes = new Set([
  "application/pdf",
  "application/rtf",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);

function normalizeAttachmentMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function validateMessageAttachment(input: {
  readonly fileName: string;
  readonly mediaType: string;
  readonly byteSize: number;
}): { readonly kind: "image" | "video" | "file"; readonly mediaType: string } {
  const mediaType = normalizeAttachmentMediaType(input.mediaType);
  const kind = messageImageMediaTypes.has(mediaType)
    ? "image"
    : messageVideoMediaTypes.has(mediaType)
      ? "video"
      : messageFileMediaTypes.has(mediaType)
        ? "file"
        : undefined;
  if (!kind) {
    throw new MessagingError(
      "BAD_REQUEST",
      "Choose an image, video, PDF, text file, or standard office document.",
    );
  }
  if (
    !Number.isInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > MESSAGE_ATTACHMENT_MAXIMUMS[kind]
  ) {
    const limit = MESSAGE_ATTACHMENT_MAXIMUMS[kind] / (1024 * 1024);
    throw new MessagingError(
      "BAD_REQUEST",
      `${kind === "image" ? "Images" : kind === "video" ? "Videos" : "Documents"} must be ${limit >= 1024 ? `${limit / 1024} GB` : `${limit} MB`} or smaller.`,
    );
  }
  if (!input.fileName.trim()) {
    throw new MessagingError(
      "BAD_REQUEST",
      "The attachment needs a file name.",
    );
  }
  return { kind, mediaType };
}

export function validateMessageAttachmentTotal(
  byteSizes: readonly number[],
): void {
  const totalBytes = byteSizes.reduce((total, byteSize) => total + byteSize, 0);
  if (totalBytes > MESSAGE_ATTACHMENT_TOTAL_MAXIMUM) {
    throw new MessagingError(
      "BAD_REQUEST",
      "Attachments in one message can total up to 1 GB.",
    );
  }
}

function safeAttachmentFileName(value: string): string {
  const withoutControlCharacters = [...value.normalize("NFKC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? "-" : character;
    })
    .join("");
  const cleaned = withoutControlCharacters
    .replaceAll(/[/\\]/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "duna-attachment";
}

function identityForActor(
  actor: ApiActor,
  mode: MessagingPrincipalMode = "user",
): ActorMessagingIdentity {
  if (mode === "organization") {
    if (!actor.organizationId) {
      throw new MessagingError(
        "FORBIDDEN",
        "Choose an organization before using its inbox.",
      );
    }
    if (!canUseOrganizationMessaging(actor)) {
      throw new MessagingError(
        "FORBIDDEN",
        "Your organization role cannot send messages.",
      );
    }
    return {
      principalType: "organization",
      principalId: actor.organizationId,
      organizationId: actor.organizationId,
      personId: actor.personId,
      displayName: actor.displayName,
    };
  }
  return {
    principalType: "user",
    principalId: actor.personId,
    personId: actor.personId,
    organizationId: actor.organizationId,
    displayName: actor.displayName,
  };
}

function principalKey(type: PrincipalType, id: string): string {
  return `${type}:${id}`;
}

function actorPrincipal(identity: ActorMessagingIdentity): MessagingPrincipal {
  return {
    type: identity.principalType,
    id: identity.principalId,
    displayName: identity.displayName,
  };
}

type ParticipantRow = typeof messagingConversationParticipants.$inferSelect;
type MessageRow = typeof conversationMessages.$inferSelect;

async function principalDirectory(input: {
  readonly participants?: readonly ParticipantRow[];
  readonly messages?: readonly MessageRow[];
}): Promise<Map<string, MessagingPrincipal>> {
  const personIds = new Set<string>();
  const organizationIds = new Set<string>();
  for (const participant of input.participants ?? []) {
    if (participant.personId) personIds.add(participant.personId);
    if (participant.organizationId)
      organizationIds.add(participant.organizationId);
  }
  for (const message of input.messages ?? []) {
    if (message.senderPersonId) personIds.add(message.senderPersonId);
    if (message.senderOrganizationId)
      organizationIds.add(message.senderOrganizationId);
  }
  const database = getDatabase();
  const personRows: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isProfessional: boolean;
  }[] = [];
  for (const personBatch of chunks([...personIds], 500)) {
    personRows.push(
      ...(await database
        .select({
          id: people.id,
          displayName: people.displayName,
          avatarUrl: people.avatarUrl,
          isProfessional: people.isProfessional,
        })
        .from(people)
        .where(inArray(people.id, personBatch))),
    );
  }
  const organizationRows: { id: string; name: string }[] = [];
  for (const organizationBatch of chunks([...organizationIds], 500)) {
    organizationRows.push(
      ...(await database
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, organizationBatch))),
    );
  }
  const directory = new Map<string, MessagingPrincipal>();
  for (const person of personRows) {
    directory.set(principalKey("user", person.id), {
      type: "user",
      id: person.id,
      displayName: person.displayName,
      ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
      ...(person.isProfessional ? { isProfessional: true } : {}),
    });
  }
  for (const organization of organizationRows) {
    directory.set(principalKey("organization", organization.id), {
      type: "organization",
      id: organization.id,
      displayName: organization.name,
    });
  }
  directory.set(principalKey("agent", "duna-ai-support"), {
    type: "agent",
    id: "duna-ai-support",
    displayName: "Duna Support",
  });
  return directory;
}

function principalFromDirectory(
  directory: ReadonlyMap<string, MessagingPrincipal>,
  type: PrincipalType,
  id: string,
): MessagingPrincipal {
  return (
    directory.get(principalKey(type, id)) ?? {
      type,
      id,
      displayName:
        type === "agent"
          ? "Duna Support"
          : type === "organization"
            ? "Duna organization"
            : "Duna member",
    }
  );
}

function widgetsFromRow(row: MessageRow) {
  const parsed = messageWidgetSchema.array().safeParse(row.widgets);
  return parsed.success ? parsed.data : [];
}

type AttachmentRow = typeof conversationMessageAttachments.$inferSelect;
type MessageAttachmentDirectory = ReadonlyMap<string, MessageAttachment[]>;

export async function loadMessageAttachmentDirectory(
  messageIds: readonly string[],
  options: { readonly includeUnsafe?: boolean } = {},
): Promise<MessageAttachmentDirectory> {
  const uniqueMessageIds = [...new Set(messageIds)];
  if (uniqueMessageIds.length === 0 || !isDatabaseConfigured()) {
    return new Map();
  }
  const rows: AttachmentRow[] = [];
  for (const messageBatch of chunks(uniqueMessageIds, 500)) {
    rows.push(
      ...(await getDatabase()
        .select()
        .from(conversationMessageAttachments)
        .where(
          inArray(conversationMessageAttachments.messageId, messageBatch),
        )),
    );
  }
  const resolved = await Promise.all(
    rows.map(async (row) => {
      const mayDownload = row.safetyStatus === "safe" || options.includeUnsafe;
      let downloadUrl: string | undefined;
      if (mayDownload && isR2VideoConfigured()) {
        try {
          downloadUrl = (
            await presignR2AttachmentDownload({
              objectKey: row.storageKey,
              contentType: row.mediaType,
              fileName: row.fileName,
              inline: row.kind === "image" || row.kind === "video",
            })
          ).url;
        } catch {
          // Keep message history readable if private storage is temporarily down.
        }
      }
      return {
        messageId: row.messageId,
        attachment: {
          id: row.id,
          kind: row.kind as MessageAttachment["kind"],
          mediaType: row.mediaType,
          fileName: row.fileName,
          byteSize: row.byteSize,
          safetyStatus: row.safetyStatus as MessageAttachment["safetyStatus"],
          ...(downloadUrl ? { downloadUrl } : {}),
        } satisfies MessageAttachment,
      };
    }),
  );
  const directory = new Map<string, MessageAttachment[]>();
  for (const item of resolved) {
    const current = directory.get(item.messageId);
    if (current) current.push(item.attachment);
    else directory.set(item.messageId, [item.attachment]);
  }
  return directory;
}

function messageFromRow(
  row: MessageRow,
  directory: ReadonlyMap<string, MessagingPrincipal>,
  attachments: MessageAttachmentDirectory = new Map(),
): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    clientMessageId: row.clientMessageId,
    seq: row.sequence,
    sender: principalFromDirectory(
      directory,
      row.senderPrincipalType,
      row.senderPrincipalId,
    ),
    kind: row.kind,
    ...(row.body ? { body: row.body } : {}),
    widgets: widgetsFromRow(row),
    attachments: attachments.get(row.id) ?? [],
    status: row.status,
    moderationState: row.moderationState,
    createdAt: row.createdAt.toISOString(),
    ...(row.editedAt ? { editedAt: row.editedAt.toISOString() } : {}),
    ...(row.removedAt ? { removedAt: row.removedAt.toISOString() } : {}),
  };
}

function participantPrincipal(
  participant: ParticipantRow,
  directory: ReadonlyMap<string, MessagingPrincipal>,
) {
  return principalFromDirectory(
    directory,
    participant.principalType,
    participant.principalId,
  );
}

export async function loadMessagingInbox(input: {
  readonly actor: ApiActor;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly now?: Date;
}): Promise<MessagingInbox> {
  const identity = identityForActor(input.actor, input.asPrincipal);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return demoMessagingInbox(actorPrincipal(identity), input.now);
  }
  const database = getDatabase();
  const membershipFilter =
    identity.principalType === "organization"
      ? and(
          eq(messagingConversationParticipants.principalType, "organization"),
          eq(
            messagingConversationParticipants.organizationId,
            identity.principalId,
          ),
        )
      : and(
          eq(messagingConversationParticipants.principalType, "user"),
          eq(messagingConversationParticipants.personId, identity.principalId),
        );
  const rows = await database
    .select({
      membership: messagingConversationParticipants,
      conversation: messagingConversations,
    })
    .from(messagingConversationParticipants)
    .innerJoin(
      messagingConversations,
      eq(
        messagingConversationParticipants.conversationId,
        messagingConversations.id,
      ),
    )
    .where(
      and(
        membershipFilter,
        isNull(messagingConversationParticipants.leftAt),
        eq(messagingConversations.status, "open"),
      ),
    )
    .orderBy(
      desc(messagingConversations.lastMessageAt),
      desc(messagingConversations.updatedAt),
    )
    .limit(100);
  if (rows.length === 0) {
    return {
      principal: actorPrincipal(identity),
      conversations: [],
      totalUnread: 0,
      syncedAt: (input.now ?? new Date()).toISOString(),
    };
  }
  const conversationIds = rows.map(({ conversation }) => conversation.id);
  const [messageRows, unreadRows] = await Promise.all([
    database
      .selectDistinctOn([conversationMessages.conversationId])
      .from(conversationMessages)
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          eq(conversationMessages.status, "published"),
        ),
      )
      .orderBy(
        conversationMessages.conversationId,
        desc(conversationMessages.sequence),
      ),
    database
      .select({
        conversationId: conversationMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationMessages)
      .innerJoin(
        messagingConversationParticipants,
        eq(
          conversationMessages.conversationId,
          messagingConversationParticipants.conversationId,
        ),
      )
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          eq(conversationMessages.status, "published"),
          membershipFilter,
          isNull(messagingConversationParticipants.leftAt),
          sql`${conversationMessages.sequence} > ${messagingConversationParticipants.lastReadSequence}`,
        ),
      )
      .groupBy(conversationMessages.conversationId),
  ]);
  const participantRows = rows.map(({ membership }) => membership);
  const directory = await principalDirectory({
    participants: participantRows,
    messages: messageRows,
  });
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    messageRows.map((message) => message.id),
  );
  const lastMessageByConversation = new Map(
    messageRows.map((message) => [message.conversationId, message]),
  );
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, row.count]),
  );
  const conversations: ConversationSummary[] = rows.map(
    ({ membership, conversation }) => {
      const lastRow = lastMessageByConversation.get(conversation.id);
      const summaryParticipants = [
        participantPrincipal(membership, directory),
        ...(lastRow
          ? [
              principalFromDirectory(
                directory,
                lastRow.senderPrincipalType,
                lastRow.senderPrincipalId,
              ),
            ]
          : []),
      ].filter(
        (principal, index, values) =>
          values.findIndex(
            (candidate) =>
              candidate.type === principal.type &&
              candidate.id === principal.id,
          ) === index,
      );
      return {
        id: conversation.id,
        type: conversation.type,
        title: conversation.title,
        ...(conversation.contextType &&
        conversation.contextId &&
        conversation.contextLabel
          ? {
              context: {
                type: conversation.contextType,
                id: conversation.contextId,
                label: conversation.contextLabel,
                ...(conversation.organizationId
                  ? { organizationId: conversation.organizationId }
                  : {}),
              },
            }
          : {}),
        participants: summaryParticipants,
        ...(lastRow
          ? {
              lastMessage: messageFromRow(
                lastRow,
                directory,
                attachmentDirectory,
              ),
            }
          : {}),
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        announcementOnly: conversation.announcementOnly,
        muted: membership.notificationLevel === "muted",
        safety: {
          minorPresent: conversation.minorPresent,
          guardianPresent: conversation.guardianCoverageComplete,
          screeningRequired: conversation.safetyScreeningRequired,
        },
        updatedAt: (
          conversation.lastMessageAt ?? conversation.updatedAt
        ).toISOString(),
      };
    },
  );
  return {
    principal:
      directory.get(
        principalKey(identity.principalType, identity.principalId),
      ) ?? actorPrincipal(identity),
    conversations,
    totalUnread: conversations.reduce(
      (total, conversation) => total + conversation.unreadCount,
      0,
    ),
    syncedAt: (input.now ?? new Date()).toISOString(),
  };
}

async function requireConversationMembership(input: {
  readonly conversationId: string;
  readonly identity: ActorMessagingIdentity;
}) {
  const database = getDatabase();
  const participant =
    await database.query.messagingConversationParticipants.findFirst({
      where: and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        eq(
          messagingConversationParticipants.principalType,
          input.identity.principalType,
        ),
        eq(
          messagingConversationParticipants.principalId,
          input.identity.principalId,
        ),
        isNull(messagingConversationParticipants.leftAt),
      ),
    });
  if (!participant) {
    throw new MessagingError("NOT_FOUND", "Conversation not found.");
  }
  return participant;
}

async function cleanupExpiredMessageAttachmentUploads(input: {
  readonly ownerPersonId: string;
  readonly now: Date;
}) {
  const expired = await getDatabase()
    .select()
    .from(messagingAttachmentUploads)
    .where(
      and(
        eq(messagingAttachmentUploads.ownerPersonId, input.ownerPersonId),
        inArray(messagingAttachmentUploads.status, ["initiated", "uploaded"]),
        lte(messagingAttachmentUploads.expiresAt, input.now),
      ),
    )
    .limit(12);
  for (const upload of expired) {
    try {
      if (upload.status === "initiated") {
        await abortR2VideoUpload({
          objectKey: upload.storageKey,
          uploadId: upload.providerUploadId,
        });
      } else {
        await deleteR2VideoObject(upload.storageKey);
      }
      await getDatabase()
        .update(messagingAttachmentUploads)
        .set({ status: "aborted", updatedAt: input.now })
        .where(eq(messagingAttachmentUploads.id, upload.id));
    } catch {
      // A later upload attempt or storage lifecycle policy can retry cleanup.
    }
  }
}

export async function beginMessageAttachmentUpload(input: {
  readonly actor: ApiActor;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly attachment: BeginMessageAttachmentUploadInput;
  readonly now?: Date;
}): Promise<MessageAttachmentUploadSession> {
  const now = input.now ?? new Date();
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      id: crypto.randomUUID(),
      partSizeBytes: R2_VIDEO_PART_SIZE_BYTES,
      totalParts: Math.ceil(
        input.attachment.byteSize / R2_VIDEO_PART_SIZE_BYTES,
      ),
      expiresAt: new Date(
        now.getTime() + MESSAGE_ATTACHMENT_UPLOAD_SECONDS * 1_000,
      ).toISOString(),
    };
  }
  if (!isR2VideoConfigured()) {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "Private message attachment storage is not configured.",
    );
  }
  await cleanupExpiredMessageAttachmentUploads({
    ownerPersonId: input.actor.personId,
    now,
  });
  const identity = identityForActor(input.actor, input.asPrincipal);
  const membership = await requireConversationMembership({
    conversationId: input.attachment.conversationId,
    identity,
  });
  if (!membership.canPost) {
    throw new MessagingError(
      "FORBIDDEN",
      "You cannot add attachments to this conversation.",
    );
  }
  const conversation =
    await getDatabase().query.messagingConversations.findFirst({
      where: and(
        eq(messagingConversations.id, input.attachment.conversationId),
        eq(messagingConversations.status, "open"),
      ),
    });
  if (!conversation) {
    throw new MessagingError("NOT_FOUND", "Conversation not found.");
  }
  if (
    conversation.announcementOnly &&
    membership.role !== "moderator" &&
    identity.principalType !== "organization"
  ) {
    throw new MessagingError(
      "FORBIDDEN",
      "Only conversation moderators can add attachments here.",
    );
  }
  const validated = validateMessageAttachment(input.attachment);
  const id = crypto.randomUUID();
  const fileName = safeAttachmentFileName(input.attachment.fileName);
  const storageKey = `messaging/${input.attachment.conversationId}/${input.actor.personId}/${id}/${fileName}`;
  const totalParts = Math.ceil(
    input.attachment.byteSize / R2_VIDEO_PART_SIZE_BYTES,
  );
  const expiresAt = new Date(
    now.getTime() + MESSAGE_ATTACHMENT_UPLOAD_SECONDS * 1_000,
  );
  const created = await createR2MessageAttachmentUpload({
    objectKey: storageKey,
    contentType: validated.mediaType,
    attachmentId: id,
    ownerPersonId: input.actor.personId,
    conversationId: input.attachment.conversationId,
  });
  try {
    await getTransactionalDatabase().transaction(async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`messaging-attachment:${input.actor.personId}`}))`,
      );
      const activeUploads = await transaction
        .select({ byteSize: messagingAttachmentUploads.byteSize })
        .from(messagingAttachmentUploads)
        .where(
          and(
            eq(messagingAttachmentUploads.ownerPersonId, input.actor.personId),
            inArray(messagingAttachmentUploads.status, [
              "initiated",
              "uploaded",
            ]),
            gt(messagingAttachmentUploads.expiresAt, now),
          ),
        )
        .limit(MESSAGE_ATTACHMENT_ACTIVE_UPLOAD_LIMIT);
      const activeBytes = activeUploads.reduce(
        (total, upload) => total + upload.byteSize,
        0,
      );
      if (
        activeUploads.length >= MESSAGE_ATTACHMENT_ACTIVE_UPLOAD_LIMIT ||
        activeBytes + input.attachment.byteSize >
          MESSAGE_ATTACHMENT_ACTIVE_BYTES_MAXIMUM
      ) {
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "Finish or cancel your current attachment uploads before adding more.",
        );
      }
      await transaction.insert(messagingAttachmentUploads).values({
        id,
        conversationId: input.attachment.conversationId,
        ownerPersonId: input.actor.personId,
        storageKey,
        providerUploadId: created.uploadId,
        kind: validated.kind,
        mediaType: validated.mediaType,
        fileName,
        byteSize: input.attachment.byteSize,
        partSizeBytes: R2_VIDEO_PART_SIZE_BYTES,
        totalParts,
        status: "initiated",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    await abortR2VideoUpload({
      objectKey: storageKey,
      uploadId: created.uploadId,
    }).catch(() => undefined);
    throw error;
  }
  return {
    id,
    partSizeBytes: R2_VIDEO_PART_SIZE_BYTES,
    totalParts,
    expiresAt: expiresAt.toISOString(),
  };
}

async function requireMessageAttachmentUpload(input: {
  readonly actor: ApiActor;
  readonly uploadId: string;
  readonly now?: Date;
}) {
  const upload = await getDatabase().query.messagingAttachmentUploads.findFirst(
    {
      where: and(
        eq(messagingAttachmentUploads.id, input.uploadId),
        eq(messagingAttachmentUploads.ownerPersonId, input.actor.personId),
      ),
    },
  );
  if (!upload) {
    throw new MessagingError("NOT_FOUND", "Attachment upload not found.");
  }
  if (upload.status !== "initiated") {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      upload.status === "uploaded"
        ? "This attachment has already finished uploading."
        : "This attachment upload is no longer available.",
    );
  }
  if (upload.expiresAt <= (input.now ?? new Date())) {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "This attachment upload expired. Choose the file again.",
    );
  }
  return upload;
}

export async function presignMessageAttachmentPart(input: {
  readonly actor: ApiActor;
  readonly uploadId: string;
  readonly partNumber: number;
  readonly now?: Date;
}): Promise<MessageAttachmentUploadPart> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      url: "https://uploads.example.invalid/duna-message-part",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }
  const upload = await requireMessageAttachmentUpload(input);
  if (input.partNumber < 1 || input.partNumber > upload.totalParts) {
    throw new MessagingError(
      "BAD_REQUEST",
      "That attachment upload part is outside the file.",
    );
  }
  const signed = await presignR2VideoPart({
    objectKey: upload.storageKey,
    uploadId: upload.providerUploadId,
    partNumber: input.partNumber,
  });
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}

export async function completeMessageAttachmentUpload(input: {
  readonly actor: ApiActor;
  readonly completion: CompleteMessageAttachmentUploadInput;
  readonly now?: Date;
}): Promise<MessageAttachmentUploadResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return { id: input.completion.uploadId, status: "uploaded" };
  }
  const upload = await requireMessageAttachmentUpload({
    actor: input.actor,
    uploadId: input.completion.uploadId,
    now: input.now,
  });
  const parts = [...input.completion.parts].sort(
    (left, right) => left.partNumber - right.partNumber,
  );
  if (
    parts.length !== upload.totalParts ||
    parts.some((part, index) => part.partNumber !== index + 1)
  ) {
    throw new MessagingError(
      "BAD_REQUEST",
      "Every attachment upload part must finish before the message is sent.",
    );
  }
  await completeR2VideoUpload({
    objectKey: upload.storageKey,
    uploadId: upload.providerUploadId,
    parts,
  });
  try {
    await verifyR2ObjectSize({
      objectKey: upload.storageKey,
      expectedBytes: upload.byteSize,
    });
  } catch (error) {
    await deleteR2VideoObject(upload.storageKey).catch(() => undefined);
    await getDatabase()
      .update(messagingAttachmentUploads)
      .set({ status: "aborted", updatedAt: input.now ?? new Date() })
      .where(eq(messagingAttachmentUploads.id, upload.id));
    throw error;
  }
  const [completed] = await getDatabase()
    .update(messagingAttachmentUploads)
    .set({ status: "uploaded", updatedAt: input.now ?? new Date() })
    .where(
      and(
        eq(messagingAttachmentUploads.id, upload.id),
        eq(messagingAttachmentUploads.status, "initiated"),
      ),
    )
    .returning({ id: messagingAttachmentUploads.id });
  if (!completed) {
    await deleteR2VideoObject(upload.storageKey).catch(() => undefined);
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "This attachment upload is no longer available.",
    );
  }
  return { id: upload.id, status: "uploaded" };
}

export async function abortMessageAttachmentUpload(input: {
  readonly actor: ApiActor;
  readonly uploadId: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return { ok: true, id: input.uploadId, message: "Upload cancelled." };
  }
  const upload = await getDatabase().query.messagingAttachmentUploads.findFirst(
    {
      where: and(
        eq(messagingAttachmentUploads.id, input.uploadId),
        eq(messagingAttachmentUploads.ownerPersonId, input.actor.personId),
      ),
    },
  );
  if (!upload) {
    return { ok: true, id: input.uploadId, message: "Upload cancelled." };
  }
  if (upload.status === "attached" || upload.status === "aborted") {
    return { ok: true, id: upload.id, message: "Upload cancelled." };
  }
  const [claimed] = await getDatabase()
    .update(messagingAttachmentUploads)
    .set({ status: "aborted", updatedAt: input.now ?? new Date() })
    .where(
      and(
        eq(messagingAttachmentUploads.id, upload.id),
        eq(messagingAttachmentUploads.ownerPersonId, input.actor.personId),
        eq(messagingAttachmentUploads.status, upload.status),
      ),
    )
    .returning({ id: messagingAttachmentUploads.id });
  if (!claimed) {
    return { ok: true, id: upload.id, message: "Upload cancelled." };
  }
  if (upload.status === "initiated") {
    await abortR2VideoUpload({
      objectKey: upload.storageKey,
      uploadId: upload.providerUploadId,
    }).catch(() => undefined);
    // A concurrent completion can turn a multipart upload into an object
    // between the state claim and provider abort. Deleting is idempotent and
    // ensures that race cannot leave a private orphan behind.
    await deleteR2VideoObject(upload.storageKey).catch(() => undefined);
  } else if (upload.status === "uploaded") {
    await deleteR2VideoObject(upload.storageKey).catch(() => undefined);
  }
  return { ok: true, id: upload.id, message: "Upload cancelled." };
}

export async function loadConversation(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly beforeSequence?: number;
}): Promise<ConversationDetail> {
  const identity = identityForActor(input.actor, input.asPrincipal);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return demoConversationDetail(input.conversationId);
  }
  const membership = await requireConversationMembership({
    conversationId: input.conversationId,
    identity,
  });
  const database = getDatabase();
  const conversation = await database.query.messagingConversations.findFirst({
    where: eq(messagingConversations.id, input.conversationId),
  });
  if (!conversation || conversation.status === "archived") {
    throw new MessagingError("NOT_FOUND", "Conversation not found.");
  }
  const sampledParticipantRows = await database
    .select()
    .from(messagingConversationParticipants)
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .orderBy(asc(messagingConversationParticipants.joinedAt))
    .limit(100);
  const participantRows = sampledParticipantRows.some(
    (participant) => participant.id === membership.id,
  )
    ? sampledParticipantRows
    : [membership, ...sampledParticipantRows.slice(0, 99)];
  const visibleMessageFilter = or(
    eq(conversationMessages.status, "published"),
    and(
      eq(conversationMessages.senderPrincipalType, identity.principalType),
      eq(conversationMessages.senderPrincipalId, identity.principalId),
    ),
  );
  const messageRows = await database
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, input.conversationId),
        visibleMessageFilter,
        ...(input.beforeSequence
          ? [sql`${conversationMessages.sequence} < ${input.beforeSequence}`]
          : []),
      ),
    )
    .orderBy(desc(conversationMessages.sequence))
    .limit(100);
  messageRows.reverse();
  const directory = await principalDirectory({
    participants: participantRows,
    messages: messageRows,
  });
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    messageRows.map((message) => message.id),
  );
  const lastPublished = [...messageRows]
    .reverse()
    .find((message) => message.status === "published");
  if (
    lastPublished &&
    lastPublished.sequence > membership.lastDeliveredSequence
  ) {
    await database
      .update(messagingConversationParticipants)
      .set({
        lastDeliveredSequence: lastPublished.sequence,
        updatedAt: new Date(),
      })
      .where(eq(messagingConversationParticipants.id, membership.id));
    scheduleConversationWakeUp({
      conversationId: input.conversationId,
      seq: lastPublished.sequence,
    });
  }
  const summary: ConversationSummary = {
    id: conversation.id,
    type: conversation.type,
    title: conversation.title,
    ...(conversation.contextType &&
    conversation.contextId &&
    conversation.contextLabel
      ? {
          context: {
            type: conversation.contextType,
            id: conversation.contextId,
            label: conversation.contextLabel,
            ...(conversation.organizationId
              ? { organizationId: conversation.organizationId }
              : {}),
          },
        }
      : {}),
    participants: participantRows
      .slice(0, 8)
      .map((participant) => participantPrincipal(participant, directory)),
    ...(lastPublished
      ? {
          lastMessage: messageFromRow(
            lastPublished,
            directory,
            attachmentDirectory,
          ),
        }
      : {}),
    unreadCount: messageRows.filter(
      (message) =>
        message.status === "published" &&
        message.sequence > membership.lastReadSequence,
    ).length,
    announcementOnly: conversation.announcementOnly,
    muted: membership.notificationLevel === "muted",
    safety: {
      minorPresent: conversation.minorPresent,
      guardianPresent: conversation.guardianCoverageComplete,
      screeningRequired: conversation.safetyScreeningRequired,
    },
    updatedAt: (
      conversation.lastMessageAt ?? conversation.updatedAt
    ).toISOString(),
  };
  return {
    conversation: summary,
    participants: participantRows.map((participant) => ({
      principal: participantPrincipal(participant, directory),
      role: participant.role,
      ...(participant.guardianOfPersonId
        ? { guardianOfPersonId: participant.guardianOfPersonId }
        : {}),
      canPost: participant.canPost,
      lastReadSeq: participant.lastReadSequence,
      lastDeliveredSeq: participant.lastDeliveredSequence,
    })),
    messages: messageRows.map((message) =>
      messageFromRow(message, directory, attachmentDirectory),
    ),
    permissions: {
      canPost:
        membership.canPost &&
        (!conversation.announcementOnly ||
          membership.role === "moderator" ||
          identity.principalType === "organization"),
      canAddParticipants:
        membership.role === "moderator" ||
        identity.principalType === "organization",
      canManageConversation:
        membership.role === "moderator" ||
        identity.principalType === "organization",
      canBlock:
        identity.principalType === "user" && conversation.type !== "support",
      ...(!membership.canPost
        ? { reason: "Posting is disabled for this participant." }
        : {}),
    },
  };
}

/*
 * Relationship evidence is intentionally historical: inactive memberships,
 * completed events, and past rentals still establish that the organization is
 * not contacting a stranger. Current blocks remain authoritative.
 */
async function organizationPriorRelationshipPersonIds(
  organizationId: string,
  personIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const uniquePersonIds = [...new Set(personIds)];
  if (uniquePersonIds.length === 0) return new Set();
  const database = getDatabase();
  const related = new Set<string>();
  for (const personBatch of chunks(uniquePersonIds, 500)) {
    const [recorded, participants, staff, registrationsForPeople, rentals] =
      await Promise.all([
        database
          .select({ personId: messagingRelationships.personId })
          .from(messagingRelationships)
          .where(
            and(
              eq(messagingRelationships.organizationId, organizationId),
              inArray(messagingRelationships.personId, personBatch),
            ),
          ),
        database
          .select({ personId: organizationParticipants.personId })
          .from(organizationParticipants)
          .where(
            and(
              eq(organizationParticipants.organizationId, organizationId),
              inArray(organizationParticipants.personId, personBatch),
            ),
          ),
        database
          .select({ personId: organizationMemberships.personId })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, organizationId),
              inArray(organizationMemberships.personId, personBatch),
            ),
          ),
        database
          .select({ personId: registrations.personId })
          .from(registrations)
          .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
          .innerJoin(programs, eq(sessions.programId, programs.id))
          .where(
            and(
              eq(programs.organizationId, organizationId),
              inArray(registrations.personId, personBatch),
            ),
          ),
        database
          .select({
            ownerPersonId: courtBookings.personId,
            participantPersonId: courtBookingParticipants.personId,
          })
          .from(courtBookings)
          .leftJoin(
            courtBookingParticipants,
            eq(courtBookingParticipants.bookingId, courtBookings.id),
          )
          .where(
            and(
              eq(courtBookings.organizationId, organizationId),
              or(
                inArray(courtBookings.personId, personBatch),
                inArray(courtBookingParticipants.personId, personBatch),
              ),
            ),
          ),
      ]);
    for (const row of recorded) {
      if (row.personId) related.add(row.personId);
    }
    for (const row of participants) related.add(row.personId);
    for (const row of staff) related.add(row.personId);
    for (const row of registrationsForPeople) related.add(row.personId);
    for (const row of rentals) {
      related.add(row.ownerPersonId);
      if (row.participantPersonId) related.add(row.participantPersonId);
    }
  }
  return related;
}

async function organizationAudienceForContext(input: {
  readonly organizationId: string;
  readonly context: NonNullable<CreateConversationInput["context"]>;
}): Promise<readonly string[]> {
  const database = getDatabase();
  if (input.context.organizationId !== input.organizationId) {
    throw new MessagingError(
      "FORBIDDEN",
      "This audience does not belong to the selected organization.",
    );
  }
  if (input.context.type === "organization") {
    if (input.context.id !== input.organizationId) {
      throw new MessagingError(
        "FORBIDDEN",
        "This organization audience does not match the selected organization.",
      );
    }
    const rows = await database
      .select({ personId: organizationParticipants.personId })
      .from(organizationParticipants)
      .where(
        and(
          eq(organizationParticipants.organizationId, input.organizationId),
          eq(organizationParticipants.status, "active"),
        ),
      );
    return rows.map((row) => row.personId);
  }
  if (input.context.type === "event" || input.context.type === "lesson") {
    const rows = await database
      .select({
        personId: registrations.personId,
        organizationId: programs.organizationId,
      })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .innerJoin(programs, eq(sessions.programId, programs.id))
      .where(
        and(
          eq(registrations.sessionId, input.context.id),
          eq(programs.organizationId, input.organizationId),
          inArray(registrations.status, [
            "invited",
            "pending",
            "confirmed",
            "waitlisted",
            "checked-in",
          ]),
        ),
      );
    return rows.map((row) => row.personId);
  }
  if (input.context.type === "division") {
    const rows = await database
      .select({ personId: registrations.personId })
      .from(registrations)
      .innerJoin(divisions, eq(registrations.divisionId, divisions.id))
      .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
      .innerJoin(programs, eq(sessions.programId, programs.id))
      .where(
        and(
          eq(registrations.divisionId, input.context.id),
          eq(programs.organizationId, input.organizationId),
          inArray(registrations.status, [
            "invited",
            "pending",
            "confirmed",
            "waitlisted",
            "checked-in",
          ]),
        ),
      );
    return rows.map((row) => row.personId);
  }
  if (input.context.type === "league") {
    const rows = await database
      .select({ personId: registrations.personId })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .innerJoin(programs, eq(sessions.programId, programs.id))
      .where(
        and(
          eq(programs.id, input.context.id),
          eq(programs.organizationId, input.organizationId),
          inArray(registrations.status, [
            "invited",
            "pending",
            "confirmed",
            "waitlisted",
            "checked-in",
          ]),
        ),
      );
    return [...new Set(rows.map((row) => row.personId))];
  }
  if (input.context.type === "rental") {
    const rows = await database
      .select({
        ownerPersonId: courtBookings.personId,
        participantPersonId: courtBookingParticipants.personId,
        participantStatus: courtBookingParticipants.status,
      })
      .from(courtBookings)
      .leftJoin(
        courtBookingParticipants,
        eq(courtBookingParticipants.bookingId, courtBookings.id),
      )
      .where(
        and(
          eq(courtBookings.id, input.context.id),
          eq(courtBookings.organizationId, input.organizationId),
        ),
      );
    return [
      ...new Set(
        rows.flatMap((row) => [
          row.ownerPersonId,
          ...(row.participantPersonId &&
          row.participantStatus !== "declined" &&
          row.participantStatus !== "cancelled"
            ? [row.participantPersonId]
            : []),
        ]),
      ),
    ];
  }
  throw new MessagingError(
    "BAD_REQUEST",
    "That context is not available as an organization audience yet.",
  );
}

async function followersOfProfessional(personId: string) {
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person?.isProfessional) {
    throw new MessagingError(
      "FORBIDDEN",
      "Follower broadcasts are available to verified Duna Pros.",
    );
  }
  const rows = await database
    .select({ personId: follows.followerPersonId })
    .from(follows)
    .where(
      and(eq(follows.entityType, "player"), eq(follows.entityId, personId)),
    );
  return rows.map((row) => row.personId);
}

async function mutualFollowerPersonIds(
  senderPersonId: string,
  recipientPersonIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const uniqueRecipientIds = [
    ...new Set(recipientPersonIds.filter((id) => id !== senderPersonId)),
  ];
  if (uniqueRecipientIds.length === 0) return new Set();
  const database = getDatabase();
  const [senderFollows, followersOfSender] = await Promise.all([
    database
      .select({ personId: follows.entityId })
      .from(follows)
      .where(
        and(
          eq(follows.followerPersonId, senderPersonId),
          eq(follows.entityType, "player"),
          inArray(follows.entityId, uniqueRecipientIds),
        ),
      ),
    database
      .select({ personId: follows.followerPersonId })
      .from(follows)
      .where(
        and(
          inArray(follows.followerPersonId, uniqueRecipientIds),
          eq(follows.entityType, "player"),
          eq(follows.entityId, senderPersonId),
        ),
      ),
  ]);
  const inbound = new Set(followersOfSender.map((row) => row.personId));
  return new Set(
    senderFollows
      .map((row) => row.personId)
      .filter((personId) => inbound.has(personId)),
  );
}

export async function loadMessagingComposeOptions(input: {
  readonly actor: ApiActor;
}): Promise<MessagingComposeOptions> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      candidates: [
        {
          principal: {
            type: "user",
            id: demoMessagingIds.mia,
            displayName: "Mia Rivera",
          },
          isMinor: true,
        },
      ],
      canBroadcastFollowers: true,
      followerCount: 248,
    };
  }
  const database = getDatabase();
  const [actor, outgoingRows, incomingRows] = await Promise.all([
    database.query.people.findFirst({
      where: eq(people.id, input.actor.personId),
    }),
    database
      .select({ personId: follows.entityId })
      .from(follows)
      .where(
        and(
          eq(follows.followerPersonId, input.actor.personId),
          eq(follows.entityType, "player"),
        ),
      ),
    database
      .select({ personId: follows.followerPersonId })
      .from(follows)
      .where(
        and(
          eq(follows.entityType, "player"),
          eq(follows.entityId, input.actor.personId),
        ),
      ),
  ]);
  const incomingIds = new Set(incomingRows.map((row) => row.personId));
  const mutualIds = outgoingRows
    .map((row) => row.personId)
    .filter((personId) => incomingIds.has(personId));
  const blockedIds = await blockedRecipientIdsForIdentity(
    identityForActor(input.actor),
    mutualIds,
  );
  const eligibleIds = mutualIds.filter((personId) => !blockedIds.has(personId));
  const candidateRows: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isMinor: boolean;
    isProfessional: boolean;
  }[] = [];
  for (const eligibleBatch of chunks(eligibleIds, 500)) {
    candidateRows.push(
      ...(await database
        .select({
          id: people.id,
          displayName: people.displayName,
          avatarUrl: people.avatarUrl,
          isMinor: people.isMinor,
          isProfessional: people.isProfessional,
        })
        .from(people)
        .where(
          and(inArray(people.id, eligibleBatch), eq(people.status, "active")),
        )),
    );
  }
  candidateRows.sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
  return {
    candidates: candidateRows.map((candidate) => ({
      principal: {
        type: "user",
        id: candidate.id,
        displayName: candidate.displayName,
        ...(candidate.avatarUrl ? { avatarUrl: candidate.avatarUrl } : {}),
        ...(candidate.isProfessional ? { isProfessional: true } : {}),
      },
      isMinor: candidate.isMinor,
    })),
    canBroadcastFollowers: Boolean(actor?.isProfessional),
    followerCount: actor?.isProfessional ? incomingRows.length : 0,
  };
}

async function blockedRecipientIdsForIdentity(
  identity: ActorMessagingIdentity,
  recipientPersonIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const uniqueRecipientIds = [...new Set(recipientPersonIds)];
  if (uniqueRecipientIds.length === 0) return new Set();
  const blocked = new Set<string>();
  const database = getDatabase();
  for (const recipientBatch of chunks(uniqueRecipientIds, 500)) {
    const recipientBlockedSender = and(
      inArray(messagingBlocks.blockerPersonId, recipientBatch),
      eq(messagingBlocks.blockedPrincipalType, identity.principalType),
      eq(messagingBlocks.blockedPrincipalId, identity.principalId),
      isNull(messagingBlocks.revokedAt),
    );
    const senderBlockedRecipient =
      identity.principalType === "user"
        ? and(
            eq(messagingBlocks.blockerPersonId, identity.principalId),
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
        senderBlockedRecipient
          ? or(recipientBlockedSender, senderBlockedRecipient)
          : recipientBlockedSender,
      );
    for (const row of rows) {
      blocked.add(
        row.blockerPersonId === identity.principalId
          ? row.blockedPrincipalId
          : row.blockerPersonId,
      );
    }
  }
  return blocked;
}

async function guardianCoverage(personIds: readonly string[]) {
  if (personIds.length === 0) {
    return {
      minorIds: [] as string[],
      guardians: [] as (typeof guardianships.$inferSelect)[],
    };
  }
  const database = getDatabase();
  const personRows: { id: string; isMinor: boolean }[] = [];
  for (const personBatch of chunks([...new Set(personIds)], 500)) {
    personRows.push(
      ...(await database
        .select({ id: people.id, isMinor: people.isMinor })
        .from(people)
        .where(inArray(people.id, personBatch))),
    );
  }
  const minorIds = personRows
    .filter((person) => person.isMinor)
    .map((person) => person.id);
  const guardianRows: (typeof guardianships.$inferSelect)[] = [];
  for (const minorBatch of chunks(minorIds, 500)) {
    guardianRows.push(
      ...(await database
        .select()
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
  const covered = new Set(guardianRows.map((row) => row.minorId));
  const uncovered = minorIds.filter((minorId) => !covered.has(minorId));
  if (uncovered.length > 0) {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "Every minor needs a verified parent or guardian before messaging can begin.",
    );
  }
  return { minorIds, guardians: guardianRows };
}

export function validateConversationCreationMode(input: {
  readonly principalType: MessagingPrincipalMode;
  readonly conversation: CreateConversationInput;
}): void {
  const { conversation, principalType } = input;
  if (principalType === "organization" && conversation.followerBroadcast) {
    throw new MessagingError(
      "BAD_REQUEST",
      "Follower broadcasts must be sent as the verified Duna Pro, not as an organization.",
    );
  }
  if (principalType === "organization" && conversation.type === "support") {
    throw new MessagingError(
      "FORBIDDEN",
      "Duna Support conversations are opened by the member who needs help.",
    );
  }
  if (principalType !== "user") return;
  if (conversation.type === "support") {
    if (
      conversation.recipientPersonIds.length > 0 ||
      conversation.context ||
      conversation.followerBroadcast
    ) {
      throw new MessagingError(
        "BAD_REQUEST",
        "Duna Support conversations cannot include user-selected recipients or contexts.",
      );
    }
    return;
  }
  if ((conversation.type === "broadcast") !== conversation.followerBroadcast) {
    throw new MessagingError(
      "BAD_REQUEST",
      "A member broadcast must be an explicit Duna Pro follower broadcast.",
    );
  }
  if (
    conversation.type !== "dm" &&
    conversation.type !== "group" &&
    conversation.type !== "broadcast"
  ) {
    throw new MessagingError(
      "FORBIDDEN",
      "Members can start mutual-follow conversations, follower broadcasts, or Duna Support. Event audiences are resolved by their organization.",
    );
  }
}

export function validateMessageAuthoring(input: {
  readonly principalType: MessagingPrincipalMode;
  readonly kind: SendMessageInput["kind"];
  readonly widgetCount: number;
}): void {
  if (input.kind === "support-response" || input.kind === "system") {
    throw new MessagingError(
      "FORBIDDEN",
      "Duna Support and system messages can only be created by trusted Duna services.",
    );
  }
  if (
    input.principalType === "user" &&
    (input.widgetCount > 0 ||
      (input.kind !== "text" && input.kind !== "announcement"))
  ) {
    throw new MessagingError(
      "FORBIDDEN",
      "Member-authored messages can contain text. Verified Duna services create transactional cards and actions.",
    );
  }
}

export async function createMessagingConversation(input: {
  readonly actor: ApiActor;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly conversation: CreateConversationInput;
  readonly now?: Date;
  readonly requestId: string;
}): Promise<MessagingActionResult> {
  const parsed = createConversationInputSchema.parse(input.conversation);
  const identity = identityForActor(input.actor, input.asPrincipal);
  validateConversationCreationMode({
    principalType: identity.principalType,
    conversation: parsed,
  });
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: crypto.randomUUID(),
      message: "Conversation ready in demo mode.",
    };
  }
  const database = getDatabase();
  if (parsed.type === "support" && identity.principalType === "user") {
    const [existingSupport] = await database
      .select({ id: messagingConversations.id })
      .from(messagingConversationParticipants)
      .innerJoin(
        messagingConversations,
        eq(
          messagingConversationParticipants.conversationId,
          messagingConversations.id,
        ),
      )
      .where(
        and(
          eq(messagingConversations.type, "support"),
          eq(messagingConversations.status, "open"),
          eq(messagingConversationParticipants.principalType, "user"),
          eq(
            messagingConversationParticipants.principalId,
            identity.principalId,
          ),
          isNull(messagingConversationParticipants.leftAt),
        ),
      )
      .limit(1);
    if (existingSupport) {
      return {
        ok: true,
        id: existingSupport.id,
        message: "Duna Support conversation ready.",
      };
    }
  }
  let recipientPersonIds = [...new Set(parsed.recipientPersonIds)];
  if (identity.principalType === "organization") {
    if (parsed.context) {
      // Context conversations are exact server-resolved rosters. A caller may
      // not smuggle additional, merely related people into an event, division,
      // league, lesson, rental, or organization thread.
      recipientPersonIds = [
        ...new Set(
          await organizationAudienceForContext({
            organizationId: identity.principalId,
            context: parsed.context,
          }),
        ),
      ];
    }
    const relatedPersonIds = await organizationPriorRelationshipPersonIds(
      identity.principalId,
      recipientPersonIds,
    );
    if (
      recipientPersonIds.some((personId) => !relatedPersonIds.has(personId))
    ) {
      throw new MessagingError(
        "FORBIDDEN",
        "Every recipient must have an existing Duna relationship with this organization.",
      );
    }
  } else if (parsed.followerBroadcast || parsed.type === "broadcast") {
    const followerIds = await followersOfProfessional(identity.principalId);
    recipientPersonIds = recipientPersonIds.length
      ? recipientPersonIds.filter((personId) => followerIds.includes(personId))
      : [...followerIds];
  } else if (parsed.type === "dm" || parsed.type === "group") {
    const mutuallyFollowingIds = await mutualFollowerPersonIds(
      identity.principalId,
      recipientPersonIds,
    );
    if (
      recipientPersonIds.some(
        (personId) =>
          personId !== identity.principalId &&
          !mutuallyFollowingIds.has(personId),
      )
    ) {
      throw new MessagingError(
        "FORBIDDEN",
        "Member conversations require mutual follows. Event groups must be created from their event context.",
      );
    }
  }
  recipientPersonIds = recipientPersonIds.filter(
    (personId) => personId !== identity.personId,
  );
  if (recipientPersonIds.length === 0 && parsed.type !== "support") {
    throw new MessagingError(
      "BAD_REQUEST",
      "Choose at least one eligible recipient.",
    );
  }
  const blockedIds = await blockedRecipientIdsForIdentity(
    identity,
    recipientPersonIds,
  );
  recipientPersonIds = recipientPersonIds.filter(
    (personId) => !blockedIds.has(personId),
  );
  if (recipientPersonIds.length === 0 && parsed.type !== "support") {
    throw new MessagingError(
      "FORBIDDEN",
      "The selected recipients are not available for messaging.",
    );
  }
  const allUserIds = [
    ...(identity.personId ? [identity.personId] : []),
    ...recipientPersonIds,
  ];
  const unfilteredCoverage = await guardianCoverage(allUserIds);
  const blockedGuardianIds = await blockedRecipientIdsForIdentity(
    identity,
    unfilteredCoverage.guardians.map((guardianship) => guardianship.guardianId),
  );
  const eligibleGuardians = unfilteredCoverage.guardians.filter(
    (guardianship) => !blockedGuardianIds.has(guardianship.guardianId),
  );
  const coveredMinorIds = new Set(
    eligibleGuardians.map((guardianship) => guardianship.minorId),
  );
  if (
    unfilteredCoverage.minorIds.some((minorId) => !coveredMinorIds.has(minorId))
  ) {
    throw new MessagingError(
      "PRECONDITION_FAILED",
      "A verified parent or guardian who can receive this sender's messages must be included for every minor.",
    );
  }
  const coverage = {
    minorIds: unfilteredCoverage.minorIds,
    guardians: eligibleGuardians,
  };
  const now = input.now ?? new Date();
  const conversationOrganizationId =
    identity.principalType === "organization"
      ? identity.principalId
      : parsed.context?.organizationId;
  const conversationResult = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [insertedConversation] = await transaction
        .insert(messagingConversations)
        .values({
          organizationId: conversationOrganizationId,
          type: parsed.type,
          title: parsed.title,
          contextType: parsed.context?.type,
          contextId: parsed.context?.id,
          contextLabel: parsed.context?.label,
          createdByPrincipalType: identity.principalType,
          createdByPrincipalId: identity.principalId,
          announcementOnly: parsed.announcementOnly,
          followerBroadcast: parsed.followerBroadcast,
          minorPresent: coverage.minorIds.length > 0,
          guardianCoverageComplete: true,
          safetyScreeningRequired: coverage.minorIds.length > 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: messagingConversations.id });
      let conversation = insertedConversation;
      let reused = false;
      if (
        !conversation &&
        identity.principalType === "organization" &&
        parsed.context
      ) {
        [conversation] = await transaction
          .select({ id: messagingConversations.id })
          .from(messagingConversations)
          .where(
            and(
              eq(messagingConversations.organizationId, identity.principalId),
              eq(messagingConversations.type, parsed.type),
              eq(messagingConversations.contextType, parsed.context.type),
              eq(messagingConversations.contextId, parsed.context.id),
              eq(messagingConversations.status, "open"),
            ),
          )
          .limit(1);
        reused = Boolean(conversation);
      }
      if (!conversation) {
        throw new MessagingError(
          "BAD_REQUEST",
          "Conversation could not be created.",
        );
      }
      if (reused) {
        await transaction
          .update(messagingConversations)
          .set({
            minorPresent: sql`${messagingConversations.minorPresent} OR ${coverage.minorIds.length > 0}`,
            guardianCoverageComplete: true,
            safetyScreeningRequired: sql`${messagingConversations.safetyScreeningRequired} OR ${coverage.minorIds.length > 0}`,
            updatedAt: now,
          })
          .where(eq(messagingConversations.id, conversation.id));
        const existingMembers = await transaction
          .select({
            id: messagingConversationParticipants.id,
            personId: messagingConversationParticipants.personId,
            role: messagingConversationParticipants.role,
            guardianOfPersonId:
              messagingConversationParticipants.guardianOfPersonId,
          })
          .from(messagingConversationParticipants)
          .where(
            and(
              eq(
                messagingConversationParticipants.conversationId,
                conversation.id,
              ),
              eq(messagingConversationParticipants.principalType, "user"),
              isNull(messagingConversationParticipants.leftAt),
            ),
          );
        const currentRecipientIds = new Set(recipientPersonIds);
        const currentGuardianIds = new Set(
          coverage.guardians.map((guardianship) => guardianship.guardianId),
        );
        const departingIds = existingMembers.flatMap((member) => {
          if (member.role === "guardian") {
            return member.personId &&
              currentGuardianIds.has(member.personId) &&
              member.guardianOfPersonId &&
              currentRecipientIds.has(member.guardianOfPersonId)
              ? []
              : [member.id];
          }
          return member.personId && currentRecipientIds.has(member.personId)
            ? []
            : [member.id];
        });
        for (const departingBatch of chunks(departingIds, 500)) {
          await transaction
            .update(messagingConversationParticipants)
            .set({ leftAt: now, updatedAt: now })
            .where(
              inArray(messagingConversationParticipants.id, departingBatch),
            );
        }
      }
      const participantValues: (typeof messagingConversationParticipants.$inferInsert)[] =
        [
          {
            conversationId: conversation.id,
            principalType: identity.principalType,
            principalId: identity.principalId,
            personId:
              identity.principalType === "user"
                ? identity.principalId
                : undefined,
            organizationId:
              identity.principalType === "organization"
                ? identity.principalId
                : undefined,
            role: "moderator",
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          ...recipientPersonIds.map((personId) => ({
            conversationId: conversation.id,
            principalType: "user" as const,
            principalId: personId,
            personId,
            role: "member" as const,
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          })),
          ...coverage.guardians
            .filter(
              (guardianship) =>
                guardianship.guardianId !== identity.personId &&
                !recipientPersonIds.includes(guardianship.guardianId),
            )
            .map((guardianship) => ({
              conversationId: conversation.id,
              principalType: "user" as const,
              principalId: guardianship.guardianId,
              personId: guardianship.guardianId,
              role: "guardian" as const,
              guardianOfPersonId: guardianship.minorId,
              joinedAt: now,
              createdAt: now,
              updatedAt: now,
            })),
          ...(parsed.type === "support"
            ? [
                {
                  conversationId: conversation.id,
                  principalType: "agent" as const,
                  principalId: "duna-ai-support",
                  role: "agent" as const,
                  joinedAt: now,
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : []),
        ];
      const uniqueParticipantValues = [
        ...new Map(
          participantValues.map((participant) => [
            principalKey(participant.principalType, participant.principalId),
            participant,
          ]),
        ).values(),
      ];
      for (const participantBatch of chunks(uniqueParticipantValues, 500)) {
        await transaction
          .insert(messagingConversationParticipants)
          .values(participantBatch)
          .onConflictDoUpdate({
            target: [
              messagingConversationParticipants.conversationId,
              messagingConversationParticipants.principalType,
              messagingConversationParticipants.principalId,
            ],
            set: {
              role: sql`excluded.role`,
              guardianOfPersonId: sql`excluded.guardian_of_person_id`,
              leftAt: null,
              canPost: true,
              updatedAt: now,
            },
          });
      }
      await transaction.insert(auditLog).values({
        organizationId: conversationOrganizationId,
        actorPersonId: input.actor.personId,
        actorType: identity.principalType,
        action: reused
          ? "messaging.context_conversation_synced"
          : "messaging.conversation_created",
        entityType: "messaging_conversation",
        entityId: conversation.id,
        reason: `${reused ? "Synced" : "Created"} ${parsed.type} conversation for ${recipientPersonIds.length} eligible recipient(s).`,
        traceId: input.requestId,
        conversationId: conversation.id,
        createdAt: now,
      });
      return { id: conversation.id, reused };
    },
  );
  const conversationId = conversationResult.id;
  if (parsed.initialMessage && parsed.clientMessageId) {
    await sendConversationMessage({
      actor: input.actor,
      asPrincipal: input.asPrincipal,
      message: {
        conversationId,
        clientMessageId: parsed.clientMessageId,
        kind: parsed.announcementOnly ? "announcement" : "text",
        body: parsed.initialMessage,
        widgets: [],
        attachmentUploadIds: [],
      },
      requestId: input.requestId,
      now,
    });
  } else {
    scheduleConversationWakeUp({
      conversationId,
      seq: 0,
    });
  }
  return {
    ok: true,
    id: conversationId,
    message: `Conversation ${conversationResult.reused ? "updated" : "created"} for ${recipientPersonIds.length} recipient${recipientPersonIds.length === 1 ? "" : "s"}.`,
  };
}

export async function sendConversationMessage(input: {
  readonly actor: ApiActor;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly message: SendMessageInput;
  readonly requestId: string;
  readonly now?: Date;
}): Promise<ConversationMessage> {
  const identity = identityForActor(input.actor, input.asPrincipal);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      id: crypto.randomUUID(),
      conversationId: input.message.conversationId,
      clientMessageId: input.message.clientMessageId,
      seq: 3,
      sender: actorPrincipal(identity),
      kind: input.message.kind,
      ...(input.message.body ? { body: input.message.body } : {}),
      widgets: input.message.widgets,
      attachments: [],
      status: input.actor.ageBand === "adult" ? "published" : "screening",
      moderationState:
        input.actor.ageBand === "adult" ? "not-required" : "screening",
      createdAt: (input.now ?? new Date()).toISOString(),
    };
  }
  const now = input.now ?? new Date();
  const transactionalDatabase = getTransactionalDatabase();
  try {
    const inserted = await transactionalDatabase.transaction(
      async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(conversationMessages)
          .where(
            and(
              eq(
                conversationMessages.clientMessageId,
                input.message.clientMessageId,
              ),
              eq(
                conversationMessages.conversationId,
                input.message.conversationId,
              ),
              eq(
                conversationMessages.senderPrincipalType,
                identity.principalType,
              ),
              eq(conversationMessages.senderPrincipalId, identity.principalId),
            ),
          )
          .limit(1);
        if (existing) return existing;
        const [conversation] = await transaction
          .select()
          .from(messagingConversations)
          .where(
            and(
              eq(messagingConversations.id, input.message.conversationId),
              eq(messagingConversations.status, "open"),
            ),
          )
          .limit(1);
        if (!conversation) {
          throw new MessagingError("NOT_FOUND", "Conversation not found.");
        }
        const [participant] = await transaction
          .select()
          .from(messagingConversationParticipants)
          .where(
            and(
              eq(
                messagingConversationParticipants.conversationId,
                conversation.id,
              ),
              eq(
                messagingConversationParticipants.principalType,
                identity.principalType,
              ),
              eq(
                messagingConversationParticipants.principalId,
                identity.principalId,
              ),
              isNull(messagingConversationParticipants.leftAt),
            ),
          )
          .limit(1);
        if (!participant?.canPost) {
          throw new MessagingError(
            "FORBIDDEN",
            "You cannot post in this conversation.",
          );
        }
        validateMessageAuthoring({
          principalType: identity.principalType,
          kind: input.message.kind,
          widgetCount: input.message.widgets.length,
        });
        if (
          conversation.announcementOnly &&
          participant.role !== "moderator" &&
          identity.principalType !== "organization"
        ) {
          throw new MessagingError(
            "FORBIDDEN",
            "Only conversation moderators can post announcements.",
          );
        }
        if (
          identity.principalType === "organization" &&
          conversation.contextType &&
          conversation.contextId &&
          conversation.contextLabel &&
          [
            "organization",
            "event",
            "division",
            "league",
            "lesson",
            "rental",
          ].includes(conversation.contextType)
        ) {
          const currentAudienceIds = [
            ...new Set(
              await organizationAudienceForContext({
                organizationId: identity.principalId,
                context: {
                  type: conversation.contextType,
                  id: conversation.contextId,
                  label: conversation.contextLabel,
                  organizationId: identity.principalId,
                },
              }),
            ),
          ];
          const blockedAudienceIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            currentAudienceIds,
          );
          const unblockedAudienceIds = currentAudienceIds.filter(
            (personId) => !blockedAudienceIds.has(personId),
          );
          const coverage = await transactionGuardianCoverage(
            transaction,
            unblockedAudienceIds,
          );
          const blockedGuardianIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            coverage.guardians.map((guardianship) => guardianship.guardianId),
          );
          const eligibleGuardians = coverage.guardians.filter(
            (guardianship) => !blockedGuardianIds.has(guardianship.guardianId),
          );
          const coveredMinorIds = new Set(
            eligibleGuardians.map((guardianship) => guardianship.minorId),
          );
          const minorIds = new Set(coverage.minorIds);
          const activeAudienceIds = new Set(
            unblockedAudienceIds.filter(
              (personId) =>
                !minorIds.has(personId) || coveredMinorIds.has(personId),
            ),
          );
          if (activeAudienceIds.size === 0) {
            throw new MessagingError(
              "PRECONDITION_FAILED",
              "This audience currently has no eligible recipients.",
            );
          }
          const desiredPeople = new Map<string, DesiredUserParticipant>();
          for (const personId of activeAudienceIds) {
            desiredPeople.set(personId, { role: "member" });
          }
          for (const guardianship of eligibleGuardians) {
            if (
              !activeAudienceIds.has(guardianship.minorId) ||
              desiredPeople.has(guardianship.guardianId)
            ) {
              continue;
            }
            desiredPeople.set(guardianship.guardianId, {
              role: "guardian",
              guardianOfPersonId: guardianship.minorId,
            });
          }
          await syncActiveUserParticipants({
            transaction,
            conversationId: conversation.id,
            desiredPeople,
            now,
          });
        }
        if (
          identity.principalType === "user" &&
          participant.role !== "guardian" &&
          conversation.createdByPrincipalType === "user" &&
          !conversation.contextType &&
          !conversation.followerBroadcast &&
          (conversation.type === "dm" || conversation.type === "group")
        ) {
          const activeMembers = await transaction
            .select({
              personId: messagingConversationParticipants.personId,
              role: messagingConversationParticipants.role,
            })
            .from(messagingConversationParticipants)
            .where(
              and(
                eq(
                  messagingConversationParticipants.conversationId,
                  conversation.id,
                ),
                eq(messagingConversationParticipants.principalType, "user"),
                isNull(messagingConversationParticipants.leftAt),
              ),
            );
          const recipientPersonIds = activeMembers.flatMap((member) =>
            member.personId &&
            member.personId !== identity.principalId &&
            member.role !== "guardian"
              ? [member.personId]
              : [],
          );
          const mutualIds = await transactionMutualFollowerPersonIds(
            transaction,
            identity.principalId,
            recipientPersonIds,
          );
          const blockedRecipientIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            recipientPersonIds,
          );
          const mutuallyAvailableIds = recipientPersonIds.filter(
            (personId) =>
              mutualIds.has(personId) && !blockedRecipientIds.has(personId),
          );
          const coverage = await transactionGuardianCoverage(
            transaction,
            mutuallyAvailableIds,
          );
          const blockedGuardianIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            coverage.guardians.map((guardianship) => guardianship.guardianId),
          );
          const eligibleGuardians = coverage.guardians.filter(
            (guardianship) => !blockedGuardianIds.has(guardianship.guardianId),
          );
          const coveredMinorIds = new Set(
            eligibleGuardians.map((guardianship) => guardianship.minorId),
          );
          const minorIds = new Set(coverage.minorIds);
          const activeRecipientIds = new Set(
            mutuallyAvailableIds.filter(
              (personId) =>
                !minorIds.has(personId) || coveredMinorIds.has(personId),
            ),
          );
          if (activeRecipientIds.size === 0) {
            throw new MessagingError(
              "PRECONDITION_FAILED",
              "This conversation needs at least one current mutual follow who has not blocked messaging.",
            );
          }
          const desiredPeople = new Map<string, DesiredUserParticipant>();
          for (const personId of activeRecipientIds) {
            desiredPeople.set(personId, { role: "member" });
          }
          for (const guardianship of eligibleGuardians) {
            if (
              !activeRecipientIds.has(guardianship.minorId) ||
              guardianship.guardianId === identity.principalId ||
              desiredPeople.has(guardianship.guardianId)
            ) {
              continue;
            }
            desiredPeople.set(guardianship.guardianId, {
              role: "guardian",
              guardianOfPersonId: guardianship.minorId,
            });
          }
          await syncActiveUserParticipants({
            transaction,
            conversationId: conversation.id,
            desiredPeople,
            preservePersonIds: new Set([identity.principalId]),
            now,
          });
        }
        if (
          identity.principalType === "user" &&
          conversation.followerBroadcast
        ) {
          const [professional] = await transaction
            .select({ isProfessional: people.isProfessional })
            .from(people)
            .where(eq(people.id, identity.principalId))
            .limit(1);
          if (!professional?.isProfessional) {
            throw new MessagingError(
              "PRECONDITION_FAILED",
              "Follower broadcasts are available only while the sender is a verified Duna Pro.",
            );
          }
          const currentFollowerRows = await transaction
            .select({ personId: follows.followerPersonId })
            .from(follows)
            .where(
              and(
                eq(follows.entityType, "player"),
                eq(follows.entityId, identity.principalId),
              ),
            );
          const currentFollowerIds = [
            ...new Set(
              currentFollowerRows
                .map((row) => row.personId)
                .filter((personId) => personId !== identity.principalId),
            ),
          ];
          const blockedFollowerIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            currentFollowerIds,
          );
          const unblockedFollowerIds = currentFollowerIds.filter(
            (personId) => !blockedFollowerIds.has(personId),
          );
          const coverage = await transactionGuardianCoverage(
            transaction,
            unblockedFollowerIds,
          );
          const blockedGuardianIds = await transactionBlockedRecipientIds(
            transaction,
            identity,
            coverage.guardians.map((guardianship) => guardianship.guardianId),
          );
          const eligibleGuardians = coverage.guardians.filter(
            (guardianship) => !blockedGuardianIds.has(guardianship.guardianId),
          );
          const coveredMinorIds = new Set(
            eligibleGuardians.map((guardianship) => guardianship.minorId),
          );
          const minorIds = new Set(coverage.minorIds);
          const activeWardIds = new Set(
            unblockedFollowerIds.filter(
              (personId) =>
                !minorIds.has(personId) || coveredMinorIds.has(personId),
            ),
          );
          if (activeWardIds.size === 0) {
            throw new MessagingError(
              "PRECONDITION_FAILED",
              "None of this broadcast's current followers are eligible for messaging.",
            );
          }
          const desiredPeople = new Map<string, DesiredUserParticipant>();
          for (const personId of activeWardIds) {
            desiredPeople.set(personId, { role: "member" });
          }
          for (const guardianship of eligibleGuardians) {
            if (
              !activeWardIds.has(guardianship.minorId) ||
              guardianship.guardianId === identity.principalId ||
              desiredPeople.has(guardianship.guardianId)
            ) {
              continue;
            }
            desiredPeople.set(guardianship.guardianId, {
              role: "guardian",
              guardianOfPersonId: guardianship.minorId,
            });
          }
          await syncActiveUserParticipants({
            transaction,
            conversationId: conversation.id,
            desiredPeople,
            preservePersonIds: new Set([identity.principalId]),
            now,
          });
        }
        const youthSafetyState = await conversationYouthSafetyState(
          transaction,
          conversation.id,
        );
        if (
          youthSafetyState.minorPresent &&
          !youthSafetyState.guardianCoverageComplete
        ) {
          throw new MessagingError(
            "PRECONDITION_FAILED",
            "A verified parent or guardian must remain in this conversation before messages can be delivered to a minor.",
          );
        }
        const needsScreening =
          conversation.minorPresent || youthSafetyState.minorPresent;
        const uniqueAttachmentUploadIds = [
          ...new Set(input.message.attachmentUploadIds),
        ];
        if (
          uniqueAttachmentUploadIds.length !==
          input.message.attachmentUploadIds.length
        ) {
          throw new MessagingError(
            "BAD_REQUEST",
            "The same attachment cannot be added twice.",
          );
        }
        const [sequenceUpdate] = await transaction
          .update(messagingConversations)
          .set({
            lastMessageSequence: sql`${messagingConversations.lastMessageSequence} + 1`,
            lastMessageAt: now,
            minorPresent: needsScreening,
            guardianCoverageComplete: youthSafetyState.guardianCoverageComplete,
            safetyScreeningRequired: needsScreening,
            updatedAt: now,
          })
          .where(eq(messagingConversations.id, conversation.id))
          .returning({ sequence: messagingConversations.lastMessageSequence });
        if (!sequenceUpdate) {
          throw new MessagingError("NOT_FOUND", "Conversation not found.");
        }
        const [message] = await transaction
          .insert(conversationMessages)
          .values({
            conversationId: conversation.id,
            sequence: sequenceUpdate.sequence,
            clientMessageId: input.message.clientMessageId,
            senderPrincipalType: identity.principalType,
            senderPrincipalId: identity.principalId,
            senderPersonId:
              identity.principalType === "user"
                ? identity.principalId
                : input.actor.personId,
            senderOrganizationId:
              identity.principalType === "organization"
                ? identity.principalId
                : undefined,
            kind: input.message.kind,
            body: input.message.body,
            widgets: input.message.widgets,
            status: needsScreening ? "screening" : "published",
            moderationState: needsScreening ? "screening" : "not-required",
            publishedAt: needsScreening ? undefined : now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!message) {
          throw new MessagingError("BAD_REQUEST", "Message could not be sent.");
        }
        if (uniqueAttachmentUploadIds.length > 0) {
          const attachmentUploads = await transaction
            .update(messagingAttachmentUploads)
            .set({
              status: "attached",
              attachedMessageId: message.id,
              updatedAt: now,
            })
            .where(
              and(
                inArray(
                  messagingAttachmentUploads.id,
                  uniqueAttachmentUploadIds,
                ),
                eq(messagingAttachmentUploads.conversationId, conversation.id),
                eq(
                  messagingAttachmentUploads.ownerPersonId,
                  input.actor.personId,
                ),
                eq(messagingAttachmentUploads.status, "uploaded"),
                gt(messagingAttachmentUploads.expiresAt, now),
              ),
            )
            .returning();
          if (attachmentUploads.length !== uniqueAttachmentUploadIds.length) {
            throw new MessagingError(
              "PRECONDITION_FAILED",
              "One or more attachments are unavailable. Choose them again.",
            );
          }
          validateMessageAttachmentTotal(
            attachmentUploads.map((attachment) => attachment.byteSize),
          );
          await transaction.insert(conversationMessageAttachments).values(
            attachmentUploads.map((attachment) => ({
              messageId: message.id,
              storageKey: attachment.storageKey,
              kind: attachment.kind,
              mediaType: attachment.mediaType,
              fileName: attachment.fileName,
              byteSize: attachment.byteSize,
              safetyStatus: needsScreening ? "pending" : "safe",
              createdAt: now,
            })),
          );
        }
        if (needsScreening) {
          await transaction
            .insert(workflowJobs)
            .values({
              kind: "messaging.safesport-screen",
              idempotencyKey: `message:${message.id}`,
              organizationId: conversation.organizationId,
              personId: input.actor.personId,
              payload: {
                messageId: message.id,
                conversationId: conversation.id,
              },
              maximumAttempts: 4,
              traceId: input.requestId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
        } else {
          await transaction
            .insert(workflowJobs)
            .values({
              kind: "messaging.push-message",
              idempotencyKey: message.id,
              organizationId: conversation.organizationId,
              personId: input.actor.personId,
              payload: { messageId: message.id },
              maximumAttempts: 6,
              traceId: input.requestId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
        }
        await transaction.insert(auditLog).values({
          organizationId: conversation.organizationId,
          actorPersonId: input.actor.personId,
          actorType: identity.principalType,
          action: needsScreening
            ? "messaging.message_queued_for_safety"
            : "messaging.message_published",
          entityType: "conversation_message",
          entityId: message.id,
          reason: needsScreening
            ? "Message is held until SafeSport screening completes."
            : "Message passed relationship and participant checks.",
          traceId: input.requestId,
          conversationId: conversation.id,
          createdAt: now,
        });
        return message;
      },
    );
    const directory = new Map<string, MessagingPrincipal>([
      [
        principalKey(identity.principalType, identity.principalId),
        actorPrincipal(identity),
      ],
    ]);
    const attachmentDirectory = await loadMessageAttachmentDirectory([
      inserted.id,
    ]);
    const message = messageFromRow(inserted, directory, attachmentDirectory);
    scheduleConversationWakeUp({
      conversationId: message.conversationId,
      seq: message.seq,
    });
    return message;
  } catch (error) {
    const existing = await getDatabase().query.conversationMessages.findFirst({
      where: and(
        eq(conversationMessages.clientMessageId, input.message.clientMessageId),
        eq(conversationMessages.conversationId, input.message.conversationId),
        eq(conversationMessages.senderPrincipalType, identity.principalType),
        eq(conversationMessages.senderPrincipalId, identity.principalId),
      ),
    });
    if (existing) {
      const directory = await principalDirectory({ messages: [existing] });
      const attachmentDirectory = await loadMessageAttachmentDirectory([
        existing.id,
      ]);
      const message = messageFromRow(existing, directory, attachmentDirectory);
      scheduleConversationWakeUp({
        conversationId: message.conversationId,
        seq: message.seq,
      });
      return message;
    }
    throw error;
  }
}

export async function recordConversationMessageAction(input: {
  readonly actor: ApiActor;
  readonly action: MessageActionInput;
  readonly requestId: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: `${input.action.messageId}:${input.action.actionId}`,
      message: "Message action recorded in demo mode.",
    };
  }
  const database = getDatabase();
  const message = await database.query.conversationMessages.findFirst({
    where: eq(conversationMessages.id, input.action.messageId),
  });
  if (!message || message.status !== "published") {
    throw new MessagingError("NOT_FOUND", "Message action is unavailable.");
  }
  const detail = await loadConversation({
    actor: input.actor,
    conversationId: message.conversationId,
    asPrincipal: "user",
  });
  const visibleMessage = detail.messages.find(
    (candidate) => candidate.id === message.id,
  );
  if (!visibleMessage) {
    throw new MessagingError("FORBIDDEN", "Message action is unavailable.");
  }
  const actionAllowed = visibleMessage.widgets.some((widget, index) => {
    if (
      input.action.actionType === "acknowledge" &&
      widget.kind === "schedule-change"
    ) {
      return (
        widget.acknowledgementRequired &&
        input.action.actionId === `schedule-change:${index}:acknowledge`
      );
    }
    return (
      input.action.actionType === "quick-action" &&
      widget.kind === "quick-actions" &&
      widget.actions.some((action) => action.id === input.action.actionId)
    );
  });
  if (!actionAllowed) {
    throw new MessagingError(
      "BAD_REQUEST",
      "That action is not available on this message.",
    );
  }
  const now = input.now ?? new Date();
  const [recorded] = await database
    .insert(conversationMessageActions)
    .values({
      messageId: message.id,
      personId: input.actor.personId,
      actionId: input.action.actionId,
      actionType: input.action.actionType,
      payload: {},
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: conversationMessageActions.id });
  if (recorded) {
    const conversation = await database.query.messagingConversations.findFirst({
      where: eq(messagingConversations.id, message.conversationId),
    });
    await database.insert(auditLog).values({
      organizationId: conversation?.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "user",
      action: "messaging.message_action_recorded",
      entityType: "conversation_message_action",
      entityId: recorded.id,
      reason: `Member selected ${input.action.actionType} action ${input.action.actionId}.`,
      traceId: input.requestId,
      conversationId: message.conversationId,
      createdAt: now,
    });
  }
  return {
    ok: true,
    id: recorded?.id ?? `${message.id}:${input.action.actionId}`,
    message: "Response recorded.",
  };
}

export async function appendAgentConversationMessage(input: {
  readonly conversationId: string;
  readonly body: string;
  readonly clientMessageId: string;
  readonly requestId: string;
  readonly supportActorPersonId?: string;
  readonly now?: Date;
}): Promise<ConversationMessage> {
  if (!isDatabaseConfigured()) {
    return {
      id: crypto.randomUUID(),
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      seq: 2,
      sender: {
        type: "agent",
        id: "duna-ai-support",
        displayName: "Duna Support",
      },
      kind: "support-response",
      body: input.body,
      widgets: [],
      attachments: [],
      status: "published",
      moderationState: "not-required",
      createdAt: (input.now ?? new Date()).toISOString(),
    };
  }
  const now = input.now ?? new Date();
  const row = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.clientMessageId, input.clientMessageId),
            eq(conversationMessages.conversationId, input.conversationId),
            eq(conversationMessages.senderPrincipalType, "agent"),
            eq(conversationMessages.senderPrincipalId, "duna-ai-support"),
          ),
        )
        .limit(1);
      if (existing) return existing;
      const [conversation] = await transaction
        .select()
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, input.conversationId),
            eq(messagingConversations.type, "support"),
            eq(messagingConversations.status, "open"),
          ),
        )
        .limit(1);
      if (!conversation) {
        throw new MessagingError(
          "NOT_FOUND",
          "Support conversation not found.",
        );
      }
      const [agentParticipant] = await transaction
        .select()
        .from(messagingConversationParticipants)
        .where(
          and(
            eq(
              messagingConversationParticipants.conversationId,
              conversation.id,
            ),
            eq(messagingConversationParticipants.principalType, "agent"),
            eq(
              messagingConversationParticipants.principalId,
              "duna-ai-support",
            ),
            isNull(messagingConversationParticipants.leftAt),
          ),
        )
        .limit(1);
      if (!agentParticipant) {
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "Duna Support is not attached to this conversation.",
        );
      }
      const youthSafetyState = await conversationYouthSafetyState(
        transaction,
        conversation.id,
      );
      if (
        youthSafetyState.minorPresent &&
        !youthSafetyState.guardianCoverageComplete
      ) {
        throw new MessagingError(
          "PRECONDITION_FAILED",
          "A verified parent or guardian must remain in this conversation before messages can be delivered to a minor.",
        );
      }
      const needsScreening =
        conversation.minorPresent || youthSafetyState.minorPresent;
      const [sequenceUpdate] = await transaction
        .update(messagingConversations)
        .set({
          lastMessageSequence: sql`${messagingConversations.lastMessageSequence} + 1`,
          lastMessageAt: now,
          minorPresent: needsScreening,
          guardianCoverageComplete: youthSafetyState.guardianCoverageComplete,
          safetyScreeningRequired: needsScreening,
          updatedAt: now,
        })
        .where(eq(messagingConversations.id, conversation.id))
        .returning({ sequence: messagingConversations.lastMessageSequence });
      if (!sequenceUpdate) {
        throw new MessagingError(
          "NOT_FOUND",
          "Support conversation not found.",
        );
      }
      const [message] = await transaction
        .insert(conversationMessages)
        .values({
          conversationId: conversation.id,
          sequence: sequenceUpdate.sequence,
          clientMessageId: input.clientMessageId,
          senderPrincipalType: "agent",
          senderPrincipalId: "duna-ai-support",
          kind: "support-response",
          body: input.body,
          widgets: [],
          status: needsScreening ? "screening" : "published",
          moderationState: needsScreening ? "screening" : "not-required",
          publishedAt: needsScreening ? undefined : now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!message) {
        throw new MessagingError(
          "BAD_REQUEST",
          "Support reply could not be saved.",
        );
      }
      await transaction
        .insert(workflowJobs)
        .values({
          kind: needsScreening
            ? "messaging.safesport-screen"
            : "messaging.push-message",
          idempotencyKey: needsScreening ? `message:${message.id}` : message.id,
          organizationId: conversation.organizationId,
          personId: input.supportActorPersonId,
          payload: {
            messageId: message.id,
            ...(needsScreening ? { conversationId: conversation.id } : {}),
          },
          maximumAttempts: needsScreening ? 4 : 6,
          traceId: input.requestId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      await transaction.insert(auditLog).values({
        organizationId: conversation.organizationId,
        actorPersonId: input.supportActorPersonId,
        actorType: input.supportActorPersonId ? "support-staff" : "agent",
        action: needsScreening
          ? "messaging.support_reply_queued_for_safety"
          : "messaging.support_reply_published",
        entityType: "conversation_message",
        entityId: message.id,
        reason: needsScreening
          ? "A support response is held until SafeSport screening completes."
          : input.supportActorPersonId
            ? "A Duna Support person replied in the support conversation."
            : "Duna Support produced a read-only contextual reply.",
        traceId: input.requestId,
        conversationId: conversation.id,
        createdAt: now,
      });
      return message;
    },
  );
  const message = messageFromRow(
    row,
    new Map([
      [
        principalKey("agent", "duna-ai-support"),
        {
          type: "agent",
          id: "duna-ai-support",
          displayName: "Duna Support",
        },
      ],
    ]),
  );
  scheduleConversationWakeUp({
    conversationId: message.conversationId,
    seq: message.seq,
  });
  return message;
}

export async function markConversationRead(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly sequence: number;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  const identity = identityForActor(input.actor, input.asPrincipal);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: input.conversationId,
      message: "Conversation read.",
    };
  }
  const now = input.now ?? new Date();
  const [updated] = await getDatabase()
    .update(messagingConversationParticipants)
    .set({
      lastReadSequence: sql`GREATEST(${messagingConversationParticipants.lastReadSequence}, ${input.sequence})`,
      lastDeliveredSequence: sql`GREATEST(${messagingConversationParticipants.lastDeliveredSequence}, ${input.sequence})`,
      updatedAt: now,
    })
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        eq(
          messagingConversationParticipants.principalType,
          identity.principalType,
        ),
        eq(messagingConversationParticipants.principalId, identity.principalId),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .returning({ id: messagingConversationParticipants.id });
  if (!updated)
    throw new MessagingError("NOT_FOUND", "Conversation not found.");
  scheduleConversationWakeUp({
    conversationId: input.conversationId,
    seq: input.sequence,
  });
  return { ok: true, id: input.conversationId, message: "Conversation read." };
}

export async function setMessagingBlock(input: {
  readonly actor: ApiActor;
  readonly blockedPrincipalType: MessagingPrincipalMode;
  readonly blockedPrincipalId: string;
  readonly blocked: boolean;
  readonly reason?: string;
  readonly requestId: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: input.blockedPrincipalId,
      message: input.blocked ? "Messages blocked." : "Messages allowed again.",
    };
  }
  if (
    input.blockedPrincipalType === "user" &&
    input.blockedPrincipalId === input.actor.personId
  ) {
    throw new MessagingError("BAD_REQUEST", "You cannot block yourself.");
  }
  const now = input.now ?? new Date();
  const transactionalDatabase = getTransactionalDatabase();
  await transactionalDatabase.transaction(async (transaction) => {
    if (input.blocked) {
      await transaction
        .insert(messagingBlocks)
        .values({
          blockerPersonId: input.actor.personId,
          blockedPrincipalType: input.blockedPrincipalType,
          blockedPrincipalId: input.blockedPrincipalId,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      if (input.blockedPrincipalType === "organization") {
        await transaction.execute(sql`
          UPDATE messaging_conversation_participants AS member
          SET left_at = ${now}, updated_at = ${now}
          WHERE member.person_id = ${input.actor.personId}
            AND member.left_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM messaging_conversation_participants AS org_member
              WHERE org_member.conversation_id = member.conversation_id
                AND org_member.principal_type = 'organization'
                AND org_member.principal_id = ${input.blockedPrincipalId}
                AND org_member.left_at IS NULL
            )
        `);
      } else {
        await transaction.execute(sql`
          UPDATE messaging_conversation_participants AS member
          SET left_at = ${now}, updated_at = ${now}
          WHERE member.person_id = ${input.actor.personId}
            AND member.left_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM messaging_conversations AS conversation
              WHERE conversation.id = member.conversation_id
                AND conversation.type = 'dm'
                AND conversation.status = 'open'
            )
            AND EXISTS (
              SELECT 1
              FROM messaging_conversation_participants AS blocked_member
              WHERE blocked_member.conversation_id = member.conversation_id
                AND blocked_member.principal_type = 'user'
                AND blocked_member.principal_id = ${input.blockedPrincipalId}
                AND blocked_member.left_at IS NULL
            )
        `);
      }
      await transaction.execute(sql`
        UPDATE messaging_conversation_participants AS minor_member
        SET left_at = ${now}, updated_at = ${now}
        WHERE minor_member.left_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM guardianships AS blocked_guardianship
            WHERE blocked_guardianship.guardian_id = ${input.actor.personId}
              AND blocked_guardianship.minor_id = minor_member.person_id
              AND blocked_guardianship.verified = TRUE
              AND blocked_guardianship.review_status = 'verified'
          )
          AND EXISTS (
            SELECT 1
            FROM messaging_conversation_participants AS departed_guardian
            WHERE departed_guardian.conversation_id = minor_member.conversation_id
              AND departed_guardian.person_id = ${input.actor.personId}
              AND departed_guardian.left_at = ${now}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM guardianships AS remaining_guardianship
            INNER JOIN messaging_conversation_participants AS remaining_guardian
              ON remaining_guardian.person_id = remaining_guardianship.guardian_id
             AND remaining_guardian.conversation_id = minor_member.conversation_id
             AND remaining_guardian.left_at IS NULL
            WHERE remaining_guardianship.minor_id = minor_member.person_id
              AND remaining_guardianship.verified = TRUE
              AND remaining_guardianship.review_status = 'verified'
          )
      `);
    } else {
      await transaction
        .update(messagingBlocks)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(messagingBlocks.blockerPersonId, input.actor.personId),
            eq(
              messagingBlocks.blockedPrincipalType,
              input.blockedPrincipalType,
            ),
            eq(messagingBlocks.blockedPrincipalId, input.blockedPrincipalId),
            isNull(messagingBlocks.revokedAt),
          ),
        );
    }
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "user",
      action: input.blocked
        ? "messaging.principal_blocked"
        : "messaging.principal_unblocked",
      entityType: "messaging_principal",
      entityId: principalKey(
        input.blockedPrincipalType,
        input.blockedPrincipalId,
      ),
      reason:
        input.reason ??
        (input.blocked
          ? "Member stopped future messages from this principal."
          : "Member restored messaging permission for future eligible conversations."),
      traceId: input.requestId,
      createdAt: now,
    });
  });
  return {
    ok: true,
    id: input.blockedPrincipalId,
    message: input.blocked ? "Messages blocked." : "Messages allowed again.",
  };
}

export async function reportConversationMessage(input: {
  readonly actor: ApiActor;
  readonly messageId: string;
  readonly category: string;
  readonly details: string;
  readonly requestId: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return { ok: true, id: input.messageId, message: "Report submitted." };
  }
  const database = getDatabase();
  const message = await database.query.conversationMessages.findFirst({
    where: eq(conversationMessages.id, input.messageId),
  });
  if (!message) throw new MessagingError("NOT_FOUND", "Message not found.");
  await requireConversationMembership({
    conversationId: message.conversationId,
    identity: identityForActor(input.actor),
  });
  const conversation = await database.query.messagingConversations.findFirst({
    where: eq(messagingConversations.id, message.conversationId),
  });
  const now = input.now ?? new Date();
  const [report] = await database
    .insert(reports)
    .values({
      reporterPersonId: input.actor.personId,
      entityType: "conversation-message",
      entityId: message.id,
      category: input.category,
      details: input.details,
      involvesMinor: conversation?.minorPresent ?? false,
      slaDueAt: new Date(
        now.getTime() + (conversation?.minorPresent ? 4 : 24) * 60 * 60 * 1_000,
      ),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: reports.id });
  return {
    ok: true,
    id: report?.id ?? message.id,
    message: "Report submitted.",
  };
}

export async function loadMessagingModerationQueue(input: {
  readonly actor: ApiActor;
}): Promise<MessagingModerationCase[]> {
  if (!isDatabaseConfigured() || input.actor.isDemo)
    return [...demoModerationCases];
  if (
    !input.actor.roles.includes("admin") &&
    !input.actor.roles.includes("super-admin")
  ) {
    throw new MessagingError("FORBIDDEN", "Admin access required.");
  }
  const rows = await getDatabase()
    .select({
      moderation: messageModerationCases,
      message: conversationMessages,
      conversation: messagingConversations,
    })
    .from(messageModerationCases)
    .innerJoin(
      conversationMessages,
      eq(messageModerationCases.messageId, conversationMessages.id),
    )
    .innerJoin(
      messagingConversations,
      eq(conversationMessages.conversationId, messagingConversations.id),
    )
    .where(
      inArray(messageModerationCases.status, [
        "open",
        "reviewing",
        "escalated",
      ]),
    )
    .orderBy(desc(messageModerationCases.createdAt))
    .limit(200);
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    rows.map(({ message }) => message.id),
    { includeUnsafe: true },
  );
  return rows.map(({ moderation, message, conversation }) => ({
    id: moderation.id,
    messageId: message.id,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    status: moderation.status as MessagingModerationCase["status"],
    severity: moderation.severity as MessagingModerationCase["severity"],
    categories: moderation.categories,
    explanation: moderation.explanation,
    ...(message.body ? { messagePreview: message.body.slice(0, 2_000) } : {}),
    attachments: attachmentDirectory.get(message.id) ?? [],
    minorPresent: conversation.minorPresent,
    createdAt: moderation.createdAt.toISOString(),
  }));
}

export async function loadDunaSupportQueue(input: {
  readonly actor: ApiActor;
}): Promise<SupportQueueItem[]> {
  if (
    !input.actor.roles.includes("admin") &&
    !input.actor.roles.includes("super-admin")
  ) {
    throw new MessagingError("FORBIDDEN", "Admin access required.");
  }
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    const detail = demoConversationDetail(demoMessagingIds.support);
    return [
      {
        conversationId: detail.conversation.id,
        title: detail.conversation.title,
        member: detail.participants.find(
          (participant) => participant.principal.type === "user",
        )?.principal ?? {
          type: "user",
          id: demoMessagingIds.alex,
          displayName: "Alex Morgan",
        },
        messages: detail.messages,
        updatedAt: detail.conversation.updatedAt,
        aiStatus: "completed",
      },
    ];
  }
  const database = getDatabase();
  const conversationRows = await database
    .select()
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.type, "support"),
        eq(messagingConversations.status, "open"),
      ),
    )
    .orderBy(desc(messagingConversations.lastMessageAt))
    .limit(100);
  if (conversationRows.length === 0) return [];
  const conversationIds = conversationRows.map(
    (conversation) => conversation.id,
  );
  const [participantRows, messageRows, agentRows] = await Promise.all([
    database
      .select()
      .from(messagingConversationParticipants)
      .where(
        and(
          inArray(
            messagingConversationParticipants.conversationId,
            conversationIds,
          ),
          isNull(messagingConversationParticipants.leftAt),
        ),
      ),
    database
      .select()
      .from(conversationMessages)
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          eq(conversationMessages.status, "published"),
        ),
      )
      .orderBy(desc(conversationMessages.sequence))
      .limit(2_000),
    database
      .select()
      .from(messagingAgentRuns)
      .where(inArray(messagingAgentRuns.conversationId, conversationIds))
      .orderBy(desc(messagingAgentRuns.createdAt)),
  ]);
  const directory = await principalDirectory({
    participants: participantRows,
    messages: messageRows,
  });
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    messageRows.map((message) => message.id),
  );
  const participantsByConversation = new Map<string, ParticipantRow[]>();
  for (const participant of participantRows) {
    const existing = participantsByConversation.get(participant.conversationId);
    if (existing) existing.push(participant);
    else
      participantsByConversation.set(participant.conversationId, [participant]);
  }
  const messagesByConversation = new Map<string, MessageRow[]>();
  for (const message of messageRows) {
    const existing = messagesByConversation.get(message.conversationId);
    if (existing) existing.push(message);
    else messagesByConversation.set(message.conversationId, [message]);
  }
  const latestAgentRun = new Map<
    string,
    typeof messagingAgentRuns.$inferSelect
  >();
  for (const agentRun of agentRows) {
    if (!latestAgentRun.has(agentRun.conversationId)) {
      latestAgentRun.set(agentRun.conversationId, agentRun);
    }
  }
  return conversationRows.map((conversation) => {
    const memberParticipant = (
      participantsByConversation.get(conversation.id) ?? []
    ).find((participant) => participant.principalType === "user");
    const run = latestAgentRun.get(conversation.id);
    const rows = (messagesByConversation.get(conversation.id) ?? [])
      .slice(0, 20)
      .reverse();
    const aiStatus: SupportQueueItem["aiStatus"] = !run
      ? "not-started"
      : run.status === "handoff"
        ? "handoff"
        : run.status === "failed"
          ? "failed"
          : "completed";
    return {
      conversationId: conversation.id,
      title: conversation.title,
      member: memberParticipant
        ? participantPrincipal(memberParticipant, directory)
        : {
            type: "user" as const,
            id: conversation.createdByPrincipalId,
            displayName: "Duna member",
          },
      messages: rows.map((message) =>
        messageFromRow(message, directory, attachmentDirectory),
      ),
      updatedAt: (
        conversation.lastMessageAt ?? conversation.updatedAt
      ).toISOString(),
      aiStatus,
      ...(run?.handoffReason ? { handoffReason: run.handoffReason } : {}),
    };
  });
}

export async function reviewMessagingModerationCase(input: {
  readonly actor: ApiActor;
  readonly caseId: string;
  readonly decision: "cleared" | "restricted" | "escalated";
  readonly note: string;
  readonly requestId: string;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!input.actor.roles.includes("super-admin")) {
    throw new MessagingError("FORBIDDEN", "Super Admin access required.");
  }
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return { ok: true, id: input.caseId, message: "Review recorded." };
  }
  const now = input.now ?? new Date();
  const transactionalDatabase = getTransactionalDatabase();
  const reviewedMessage = await transactionalDatabase.transaction(
    async (transaction) => {
      const [moderation] = await transaction
        .select()
        .from(messageModerationCases)
        .where(eq(messageModerationCases.id, input.caseId))
        .limit(1);
      if (!moderation) throw new MessagingError("NOT_FOUND", "Case not found.");
      const [message] = await transaction
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.id, moderation.messageId))
        .limit(1);
      if (!message) throw new MessagingError("NOT_FOUND", "Message not found.");
      if (input.decision === "cleared") {
        await requireActiveGuardianCoverage(
          transaction,
          message.conversationId,
        );
      }
      await transaction
        .update(messageModerationCases)
        .set({
          status: input.decision,
          reviewedByPersonId: input.actor.personId,
          reviewedAt: now,
          resolutionNote: input.note,
          updatedAt: now,
        })
        .where(eq(messageModerationCases.id, input.caseId));
      await transaction
        .update(conversationMessages)
        .set({
          status: input.decision === "cleared" ? "published" : "removed",
          moderationState: input.decision === "cleared" ? "safe" : "blocked",
          publishedAt: input.decision === "cleared" ? now : undefined,
          removedAt: input.decision === "cleared" ? undefined : now,
          updatedAt: now,
        })
        .where(eq(conversationMessages.id, moderation.messageId));
      await transaction
        .update(conversationMessageAttachments)
        .set({
          safetyStatus: input.decision === "cleared" ? "safe" : "blocked",
        })
        .where(
          eq(conversationMessageAttachments.messageId, moderation.messageId),
        );
      if (input.decision === "cleared") {
        await markLatePublishedMessageUnread({ transaction, message, now });
        await transaction
          .insert(workflowJobs)
          .values({
            kind: "messaging.push-message",
            idempotencyKey: moderation.messageId,
            personId: input.actor.personId,
            payload: { messageId: moderation.messageId },
            maximumAttempts: 6,
            traceId: input.requestId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "super-admin",
        action: `messaging.moderation_${input.decision}`,
        entityType: "message_moderation_case",
        entityId: input.caseId,
        reason: input.note,
        traceId: input.requestId,
        createdAt: now,
      });
      return {
        conversationId: message.conversationId,
        seq: message.sequence,
      };
    },
  );
  scheduleConversationWakeUp(reviewedMessage);
  return { ok: true, id: input.caseId, message: "Review recorded." };
}

export const messagingPermissionPolicy = decideMessagingPermission;

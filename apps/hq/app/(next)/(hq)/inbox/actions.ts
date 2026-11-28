"use server";

import type { ConciergeDelivery, ConciergeSendProposal } from "@duna/api";
import { messageWidgetSchema } from "@duna/messaging-client";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfigured } from "@/components/people/people-data";
import type { InboxActionResult } from "@/components/inbox/inbox-result";

/**
 * Inbox's changes (H-INBOX). Reviewing a message sends nothing: it asks
 * Concierge for the Send review (who gets it, on which channel, who can't be
 * reached). Only `confirmSendAction`, called by the confirmation a person
 * answers, sends, and only for the content hash that person reviewed. Every
 * call answers a result instead of throwing, so the screen can say what
 * happened with the reference. Logs carry the action, ids' absence/presence
 * and counts only: never a message body, a name or a destination.
 */

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Codes whose message the API writes for people. */
const plainCodes = new Set([
  "BAD_REQUEST",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

async function run<T>(
  action: string,
  perform: () => Promise<T>,
  nothing = "Nothing was sent.",
): Promise<InboxActionResult<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    log.info("hq.inbox.actionSucceeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (code === "CONFLICT") {
      log.info("hq.inbox.actionRefused", { action, reason: "stale" });
      return {
        ok: false,
        code: "stale",
        message: `Something changed since you reviewed it: someone joined or left, a channel changed, or the text was edited. ${nothing} Review it again.`,
        reference: requestId,
      };
    }
    if (isPermissionDenied(error)) {
      log.info("hq.inbox.actionDenied", { action });
      return {
        ok: false,
        code: "denied",
        message: `Your role can't do this here. An owner or manager can. ${nothing}`,
        reference: requestId,
      };
    }
    if (isNotConfigured(error)) {
      log.info("hq.inbox.actionNotConfigured", { action });
      return {
        ok: false,
        code: "not-configured",
        message: `This needs Duna Database connected in this environment, which isn't set up yet. ${nothing}`,
        reference: requestId,
      };
    }
    log.warn("hq.inbox.actionFailed", { action, code: code ?? "unknown" });
    return {
      ok: false,
      code: "failed",
      message:
        code && plainCodes.has(code) && error instanceof Error && error.message
          ? `${error.message} ${nothing}`
          : `Something went wrong on our side. ${nothing} Try again.`,
      reference: requestId,
    };
  }
}

/**
 * A change whose backend procedure has not landed yet (its capability
 * switch is off, so no control offers it). Says so and changes nothing.
 */
async function needsApi(
  action: string,
  what: string,
): Promise<InboxActionResult<never>> {
  const { requestId } = await getServerContext();
  log.info("hq.inbox.actionNeedsApi", { action });
  return {
    ok: false,
    code: "not-configured",
    message: `${what} isn't switched on for clubs yet. Nothing was changed.`,
    reference: requestId,
  };
}

function invalid(message: string): InboxActionResult<never> {
  return { ok: false, code: "invalid", message };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => uuidPattern.test(value);
const MAX_BODY = 4000;

function refresh() {
  revalidatePath("/inbox", "layout");
}

// ------------------------------------------------------------ the Send review

/** Builds the Send review for a reply. Sends nothing. */
export async function reviewReplyAction(input: {
  readonly conversationId: string;
  readonly body: string;
  readonly draftedBy: "person" | "duna";
  readonly kind: "conversation" | "operational";
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  const body = input.body.trim();
  if (!body) return invalid("Write the message first.");
  if (body.length > MAX_BODY)
    return invalid(`Keep it under ${MAX_BODY} characters.`);
  if (!isId(input.conversationId)) return invalid("Open a conversation first.");
  return run("reviewReply", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.draftSend({
      conversationId: input.conversationId,
      body,
      draftedBy: input.draftedBy,
      kind: input.kind,
    });
  });
}

/** Changes the text on a review (a new content hash). Sends nothing. */
export async function editReviewAction(input: {
  readonly proposalId: string;
  readonly body: string;
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  const body = input.body.trim();
  if (!body) return invalid("Write the message first.");
  if (body.length > MAX_BODY)
    return invalid(`Keep it under ${MAX_BODY} characters.`);
  return run("editReview", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.editDraft({
      proposalId: input.proposalId,
      body,
    });
  });
}

/** Moves one person to another channel on the review. Sends nothing. */
export async function setRecipientChannelAction(input: {
  readonly proposalId: string;
  readonly recipientId: string;
  readonly channel: "duna" | "email" | "imessage" | "whatsapp";
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  return run("setRecipientChannel", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.setRecipientChannel(input);
  });
}

/** A review as it is now (after a refusal, or handed over by another screen). */
export async function loadReviewAction(input: {
  readonly proposalId: string;
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  return run("loadReview", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.proposal(input);
  });
}

/**
 * The person pressed Send on the confirmation. Valid only for the content
 * hash they reviewed; the idempotency key comes from the confirming control
 * and is reused on a retry, so a repeat never sends twice.
 */
export async function confirmSendAction(input: {
  readonly proposalId: string;
  readonly contentHash: string;
  readonly idempotencyKey: string;
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  if (!/^[0-9a-f]{64}$/.test(input.contentHash))
    return invalid("Review the message before sending it. Nothing was sent.");
  if (input.idempotencyKey.length < 8)
    return invalid("Review the message before sending it. Nothing was sent.");
  const result = await run("confirmSend", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.confirmSend(input);
  });
  if (result.ok) {
    log.info("hq.inbox.sent", {
      recipients: result.data.recipientCount,
      unreachable: result.data.unreachableCount,
      status: result.data.status,
    });
    refresh();
  }
  return result;
}

/** Drops a review. Nothing was sent. */
export async function cancelReviewAction(input: {
  readonly proposalId: string;
}): Promise<InboxActionResult<ConciergeSendProposal>> {
  return run("cancelReview", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.cancelSend(input);
  });
}

/** Each person's delivery for a send. */
export async function deliveriesAction(input: {
  readonly proposalId: string;
}): Promise<InboxActionResult<readonly ConciergeDelivery[]>> {
  return run(
    "deliveries",
    async () => {
      const caller = await getServerCaller();
      return (await caller.operator.concierge.deliveries(input)).deliveries;
    },
    "",
  );
}

// ------------------------------------------------------------ the thread

/** Assigns a thread to a staff member (a hand-off), or clears it. */
export async function assignThreadAction(input: {
  readonly conversationId: string;
  readonly assigneePersonId: string | null;
}): Promise<InboxActionResult<{ readonly assigneePersonId: string | null }>> {
  const result = await run(
    "assignThread",
    async () => {
      const caller = await getServerCaller();
      const assigned = await caller.operator.concierge.assignThread(input);
      return { assigneePersonId: assigned.assigneePersonId };
    },
    "Nothing was changed.",
  );
  if (result.ok) refresh();
  return result;
}

/** The club's staff have read the thread up to `sequence`. */
export async function markReadAction(input: {
  readonly conversationId: string;
  readonly sequence: number;
}): Promise<InboxActionResult<{ readonly conversationId: string }>> {
  if (input.sequence < 1) return { ok: true, data: input };
  return run(
    "markRead",
    async () => {
      const caller = await getServerCaller();
      return caller.operator.concierge.markRead(input);
    },
    "",
  );
}

/** Staff mute for a thread: no operator procedure yet (switch `mute`). */
export async function muteThreadAction(input: {
  readonly conversationId: string;
  readonly muted: boolean;
}): Promise<InboxActionResult<never>> {
  void input;
  return needsApi("muteThread", "Muting a thread for the club");
}

/** Mark a thread done: no procedure yet (switch `markDone`). */
export async function markDoneAction(input: {
  readonly conversationId: string;
  readonly done: boolean;
}): Promise<InboxActionResult<never>> {
  void input;
  return needsApi("markDone", "Marking a thread done");
}

/** Ask Duna writes a reply into the composer: no procedure yet (switch `askDraft`). */
export async function suggestReplyAction(input: {
  readonly conversationId: string;
}): Promise<InboxActionResult<never>> {
  void input;
  return needsApi("suggestReply", "Ask Duna writing straight into the reply");
}

// ------------------------------------------------------------ new conversations

/**
 * Opens (or finds) the thread for the club, a session, a league, a division
 * or one person, and prepares the Send review for its first message.
 * Sends nothing: the person reviews and presses Send.
 */
export async function startThreadAction(input: {
  readonly contextType:
    "organization" | "lesson" | "event" | "league" | "division" | "direct";
  readonly contextId: string;
  readonly label?: string;
  readonly body: string;
  readonly draftedBy: "person" | "duna";
}): Promise<
  InboxActionResult<{
    readonly conversationId: string;
    readonly proposal?: ConciergeSendProposal;
  }>
> {
  const body = input.body.trim();
  if (!body) return invalid("Write the message first.");
  if (body.length > MAX_BODY)
    return invalid(`Keep it under ${MAX_BODY} characters.`);
  if (!input.contextId) return invalid("Choose who it is for.");
  const result = await run("startThread", async () => {
    const caller = await getServerCaller();
    return caller.operator.concierge.drafts.createFromHandoff({
      source: "hq.inbox.compose",
      contextType: input.contextType,
      contextId: input.contextId,
      ...(input.label ? { label: input.label.slice(0, 160) } : {}),
      suggestedText: body,
      draftedBy: input.draftedBy,
      kind: "conversation",
    });
  });
  if (result.ok) refresh();
  return result;
}

/**
 * A named group of chosen people (or a message with cards, a poll or
 * "updates only"), in the Duna app. Called only by the confirmation that
 * restated the recipients; the client message id makes a retry safe.
 */
export async function createGroupAction(input: {
  readonly organizationId: string;
  readonly title: string;
  readonly message: string;
  readonly recipientPersonIds: readonly string[];
  readonly context?: {
    readonly type: "organization" | "lesson" | "event" | "league" | "division";
    readonly id: string;
    readonly label: string;
  };
  readonly widgets: readonly unknown[];
  readonly announcementOnly: boolean;
  readonly idempotencyKey: string;
}): Promise<InboxActionResult<{ readonly conversationId: string }>> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title) return invalid("Name the conversation.");
  if (!message) return invalid("Write the message first.");
  if (!input.context && input.recipientPersonIds.length === 0)
    return invalid("Choose at least one person.");
  const widgets = messageWidgetSchema.array().max(8).safeParse(input.widgets);
  if (!widgets.success) return invalid("A card or poll isn't complete yet.");
  const clientMessageId = isId(input.idempotencyKey)
    ? input.idempotencyKey
    : crypto.randomUUID();
  const result = await run("createGroup", async () => {
    const caller = await getServerCaller();
    const created = await caller.messaging.create({
      asPrincipal: "organization",
      conversation: {
        type: !input.context
          ? "group"
          : input.context.type === "league"
            ? "league"
            : input.context.type === "division"
              ? "division"
              : input.context.type === "event"
                ? "event"
                : "group",
        title: title.slice(0, 160),
        recipientPersonIds: input.context ? [] : [...input.recipientPersonIds],
        ...(input.context
          ? {
              context: {
                type: input.context.type,
                id: input.context.id,
                label: input.context.label,
                organizationId: input.organizationId,
              },
            }
          : {}),
        announcementOnly: input.announcementOnly,
        followerBroadcast: false,
        initialMessage: message,
        initialWidgets: widgets.data,
        clientMessageId,
      },
    });
    return { conversationId: created.id };
  });
  if (result.ok) {
    log.info("hq.inbox.groupCreated", {
      recipients: input.recipientPersonIds.length,
      cards: widgets.data.length,
    });
    refresh();
  }
  return result;
}

"use client";

import type { ConciergeDelivery, ConciergeSendProposal } from "@duna/api";
import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Chip,
  Notice,
  Rise,
  Select,
  Skeleton,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useEffect, useRef, useState } from "react";
import {
  cancelReviewAction,
  confirmSendAction,
  deliveriesAction,
  loadReviewAction,
  setRecipientChannelAction,
} from "@/app/(next)/(hq)/inbox/actions";
import {
  type ChannelStatus,
  channelLabels,
  type ConciergeChannel,
  deliveryLabels,
  type DeliveryStatus,
  isOpenReview,
  reviewSummary,
  unreachableText,
} from "./inbox-model";
import {
  InboxActionError,
  messageOf,
  reportFailure,
  unwrap,
} from "./inbox-result";

function names(
  list: readonly { readonly person: { readonly displayName: string } }[],
) {
  const shown = list.slice(0, 5).map((entry) => entry.person.displayName);
  const rest = list.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

/**
 * The Send review (Concierge): the text, every person with the ONE channel
 * they will be reached on, who can't be reached and why, and one primary
 * action that names the count. Pressing it asks once more, restating who
 * gets it and on what; only that answer sends, for the exact version
 * reviewed. If anything changed meanwhile the send is refused and the
 * review refreshes.
 */
export function SendReview({
  proposal: initial,
  channels,
  canSend,
  canChooseChannel,
  canSeeDeliveries,
  where,
  onEdit,
  onClosed,
  onSent,
}: {
  readonly proposal: ConciergeSendProposal;
  readonly channels: readonly ChannelStatus[];
  readonly canSend: boolean;
  readonly canChooseChannel: boolean;
  readonly canSeeDeliveries: boolean;
  /** "Saturday clinic": named in the confirmation. */
  readonly where: string;
  /** Back to writing, with this text. */
  readonly onEdit?: (body: string) => void;
  /** The review was discarded. */
  readonly onClosed?: () => void;
  readonly onSent?: (proposal: ConciergeSendProposal) => void;
}) {
  const [proposal, setProposal] = useState(initial);
  const [notice, setNotice] = useState<string | undefined>();
  useEffect(() => setProposal(initial), [initial]);
  const confirm = useConfirm();
  const summary = reviewSummary(proposal);
  const open = isOpenReview(proposal);
  const working = new Set(
    channels.filter((channel) => channel.state === "on").map((c) => c.channel),
  );

  const discard = useAction(
    async () =>
      unwrap(await cancelReviewAction({ proposalId: proposal.proposalId })),
    {
      messages: { success: "Discarded. Nothing was sent." },
      report: reportFailure("hq.inbox.discardFailed"),
      onSuccess: () => onClosed?.(),
    },
  );

  const changeChannel = useAction(
    async (_context, recipientId: string, channel: ConciergeChannel) =>
      unwrap(
        await setRecipientChannelAction({
          proposalId: proposal.proposalId,
          recipientId,
          channel,
        }),
      ),
    {
      messages: { error: "The channel wasn't changed. Nothing was sent." },
      report: reportFailure("hq.inbox.channelChangeFailed"),
      onSuccess: (next) => setProposal(next),
    },
  );

  const send = async () => {
    setNotice(undefined);
    const many = summary.sendCount > 10;
    const channelWords = summary.byChannel
      .map(
        ({ channel, count }) =>
          `${count} ${channel === "duna" ? "in the Duna app" : `by ${channelLabels[channel]}`}`,
      )
      .join(", ");
    const outcome = await confirm.run({
      tier: many ? "strong" : "confirm",
      title:
        summary.sendCount === 1
          ? `Send this to ${summary.reachable[0]!.person.displayName}?`
          : `Send this to ${summary.sendCount} people?`,
      description: `It is posted in ${where} for the club, and each person gets it on the one channel shown: ${channelWords}.`,
      affected:
        summary.unreachable.length > 0
          ? `${summary.unreachable.length} ${summary.unreachable.length === 1 ? "person can't" : "people can't"} be reached and won't get it.`
          : undefined,
      ...(many
        ? {
            recipients: names(summary.reachable),
            consequence: "A sent message can't be taken back.",
          }
        : {}),
      verb: summary.verb,
      cancelLabel: "Keep reviewing",
      agentConfirm: `Sends the reviewed message to ${summary.sendCount} ${summary.sendCount === 1 ? "person" : "people"} in ${where}`,
      perform: async ({ idempotencyKey }) =>
        unwrap(
          await confirmSendAction({
            proposalId: proposal.proposalId,
            contentHash: proposal.contentHash,
            idempotencyKey,
          }),
        ),
      success: (sent) =>
        `Sent to ${sent.recipientCount - sent.unreachableCount} ${sent.recipientCount - sent.unreachableCount === 1 ? "person" : "people"}`,
      report: reportFailure("hq.inbox.sendFailed"),
    });
    if (outcome.status === "done") {
      setProposal(outcome.result);
      onSent?.(outcome.result);
      return;
    }
    if (
      outcome.status === "failed" &&
      outcome.error instanceof InboxActionError &&
      outcome.error.code === "stale"
    ) {
      setNotice(outcome.error.userMessage);
      const fresh = await loadReviewAction({ proposalId: proposal.proposalId });
      if (fresh.ok) setProposal(fresh.data);
    }
  };

  if (!open) {
    return (
      <Rise
        className="inbox-review"
        data-status={proposal.status}
        from="bottom"
      >
        <SentCard canSeeDeliveries={canSeeDeliveries} proposal={proposal} />
        {confirm.dialog}
      </Rise>
    );
  }

  return (
    <Rise className="inbox-review" from="bottom">
      <section aria-label="Send review" className="inbox-review__card">
        <header className="inbox-review__head">
          <p className="inbox-eyebrow">Review before sending</p>
          {proposal.draftedBy === "duna" ? (
            <Chip kind="status" tone="info">
              Drafted by Ask Duna
            </Chip>
          ) : null}
        </header>
        <p className="inbox-review__body">{proposal.body}</p>
        {notice ? (
          <Notice role="alert" title="Review it again" tone="warning">
            {notice}
          </Notice>
        ) : null}
        <div className="inbox-review__who">
          <p className="inbox-review__count">
            <span className="td-num">{summary.sendCount}</span>{" "}
            {summary.sendCount === 1 ? "person gets it" : "people get it"}
            {summary.unreachable.length > 0 ? (
              <>
                {" · "}
                <span className="td-num">
                  {summary.unreachable.length}
                </span>{" "}
                can't be reached
              </>
            ) : null}
          </p>
          <ul aria-label="Who gets it" className="inbox-recipients">
            {summary.reachable.map((recipient) => {
              const channel = recipient.channel as ConciergeChannel;
              return (
                <li className="inbox-recipient" key={recipient.recipientId}>
                  <Avatar
                    decorative
                    name={recipient.person.displayName}
                    size="sm"
                    src={recipient.person.avatarUrl}
                  />
                  <span className="inbox-recipient__name">
                    {recipient.person.displayName}
                    {recipient.guardianOf ? (
                      <span className="inbox-recipient__note">
                        Guardian of {recipient.guardianOf.displayName}
                      </span>
                    ) : null}
                  </span>
                  {canChooseChannel && working.size > 1 ? (
                    <Select
                      aria-label={`Channel for ${recipient.person.displayName}`}
                      className="inbox-recipient__channel"
                      onValueChange={(value) => {
                        if (value && value !== channel)
                          void changeChannel.run(
                            recipient.recipientId,
                            value as ConciergeChannel,
                          );
                      }}
                      options={[...working].map((option) => ({
                        value: option,
                        label: channelLabels[option],
                      }))}
                      value={channel}
                    />
                  ) : (
                    <Chip kind="taxonomy">
                      <Icon
                        name={
                          channel === "duna"
                            ? "thread"
                            : channel === "email"
                              ? "mail"
                              : "phone-bubble"
                        }
                        size="chip"
                      />
                      {channelLabels[channel]}
                    </Chip>
                  )}
                </li>
              );
            })}
            {summary.unreachable.map((recipient) => (
              <li
                className="inbox-recipient"
                data-unreachable
                key={recipient.recipientId}
              >
                <Avatar
                  decorative
                  name={recipient.person.displayName}
                  size="sm"
                  src={recipient.person.avatarUrl}
                />
                <span className="inbox-recipient__name">
                  {recipient.person.displayName}
                  <span className="inbox-recipient__note">
                    {recipient.unreachableReason
                      ? unreachableText[recipient.unreachableReason]
                      : "Can't be reached"}
                  </span>
                </span>
                <Chip kind="status" tone="neutral">
                  Won't get it
                </Chip>
              </li>
            ))}
          </ul>
          {proposal.guardianNote ? (
            <p className="inbox-quiet">
              <Icon name="junior-guardian" size="inline" />{" "}
              {proposal.guardianNote}
            </p>
          ) : null}
        </div>
        {!canSend ? (
          <Notice title="An owner or manager sends it" tone="info">
            Your role can prepare and review messages. Someone who can send for
            the club presses Send.
          </Notice>
        ) : summary.sendCount === 0 ? (
          <Notice title="Nobody can be reached yet" tone="warning">
            Nothing can be sent until at least one person can be reached.
          </Notice>
        ) : null}
        {discard.error ? (
          <Notice role="alert" title="Not discarded" tone="danger">
            {messageOf(discard.error, "The review wasn't discarded.")}
          </Notice>
        ) : null}
        <footer className="inbox-review__actions">
          {onEdit ? (
            <Button onClick={() => onEdit(proposal.body)} variant="ghost">
              Edit
            </Button>
          ) : null}
          <Button {...discard.buttonProps} variant="secondary">
            Discard
          </Button>
          {canSend ? (
            <Button
              disabled={summary.sendCount === 0 || changeChannel.pending}
              icon={<Icon name="send" size="control" />}
              onClick={() => void send()}
              variant="primary"
            >
              {summary.verb}
            </Button>
          ) : null}
        </footer>
      </section>
      {confirm.dialog}
    </Rise>
  );
}

/** A send that happened (or ended): its state and each person's delivery. */
function SentCard({
  proposal,
  canSeeDeliveries,
}: {
  readonly proposal: ConciergeSendProposal;
  readonly canSeeDeliveries: boolean;
}) {
  const sent = ["sent", "sending", "confirmed", "partially-failed"].includes(
    proposal.status,
  );
  const [deliveries, setDeliveries] = useState<
    readonly ConciergeDelivery[] | "loading" | "error"
  >(canSeeDeliveries && sent ? "loading" : []);
  // One read per send, even when an effect runs twice (development's
  // strict mode, a remount): the same request is shared, never repeated.
  const requested = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!canSeeDeliveries || !sent) return;
    if (requested.current === proposal.proposalId) return;
    requested.current = proposal.proposalId;
    void deliveriesAction({ proposalId: proposal.proposalId }).then((result) =>
      setDeliveries(result.ok ? result.data : "error"),
    );
  }, [canSeeDeliveries, sent, proposal.proposalId]);
  const title =
    proposal.status === "cancelled"
      ? "Discarded: nothing was sent"
      : proposal.status === "expired"
        ? "This review expired: nothing was sent"
        : proposal.status === "partially-failed"
          ? "Sent, but some people didn't get it"
          : "Sent";
  return (
    <section aria-label="Delivery" className="inbox-review__card">
      <Notice
        role="status"
        title={title}
        tone={
          proposal.status === "partially-failed"
            ? "warning"
            : sent
              ? "positive"
              : "info"
        }
      >
        {sent
          ? `${proposal.recipientCount - proposal.unreachableCount} of ${proposal.recipientCount} people, each on their own channel.`
          : "Write it again below to send it."}
      </Notice>
      {sent && canSeeDeliveries ? (
        deliveries === "loading" ? (
          <Skeleton
            kind="lines"
            label="Loading each person's delivery"
            lines={3}
          />
        ) : deliveries === "error" ? (
          <p className="inbox-quiet">
            Each person's delivery couldn't be loaded. The message was sent.
          </p>
        ) : deliveries.length > 0 ? (
          <ul aria-label="Each person's delivery" className="inbox-recipients">
            {deliveries.map((delivery) => {
              const label = deliveryLabels[delivery.status as DeliveryStatus];
              return (
                <li className="inbox-recipient" key={delivery.deliveryId}>
                  <Avatar
                    decorative
                    name={delivery.person.displayName}
                    size="sm"
                    src={delivery.person.avatarUrl}
                  />
                  <span className="inbox-recipient__name">
                    {delivery.person.displayName}
                    <span className="inbox-recipient__note">
                      {channelLabels[delivery.channel as ConciergeChannel]}
                    </span>
                  </span>
                  <Chip kind="status" tone={label?.tone ?? "neutral"}>
                    {label?.label ?? delivery.status}
                  </Chip>
                </li>
              );
            })}
          </ul>
        ) : null
      ) : null}
    </section>
  );
}

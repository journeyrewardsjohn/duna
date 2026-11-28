"use client";

import type { ConciergeSendProposal } from "@duna/api";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Checkbox,
  Notice,
  Textarea,
  useAction,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  editReviewAction,
  reviewReplyAction,
} from "@/app/(next)/(hq)/inbox/actions";
import { useShell } from "../shell/shell-context";
import type { ChannelStatus } from "./inbox-model";
import { isOpenReview } from "./inbox-model";
import { messageOf, reportFailure, unwrap } from "./inbox-result";
import { SendReview } from "./send-review";

const MAX = 4000;

/**
 * Which channels work for the club, said plainly. A channel that isn't set
 * up says what it needs; it is never drawn as working.
 */
export function ChannelStrip({
  channels,
}: {
  readonly channels: readonly ChannelStatus[];
}) {
  const on = channels.filter((channel) => channel.state === "on");
  const notSetUp = channels.filter((channel) => channel.state === "not-set-up");
  const switchedOff = channels.filter(
    (channel) => channel.state === "switched-off",
  );
  const off = notSetUp.length + switchedOff.length;
  return (
    <details className="inbox-channels">
      <summary>
        <span className="inbox-channels__list">
          {on.map((channel) => (
            <span
              className="inbox-channel"
              data-state="on"
              key={channel.channel}
            >
              <Icon name="success" size="chip" />
              {channel.label}
            </span>
          ))}
          {notSetUp.length > 0 ? (
            <span className="inbox-channel" data-state="not-set-up">
              <Icon name="info" size="chip" />
              {notSetUp.map((channel) => channel.label).join(", ")}
              <span className="inbox-channel__state">not set up</span>
            </span>
          ) : null}
          {switchedOff.length > 0 ? (
            <span className="inbox-channel" data-state="switched-off">
              <Icon name="info" size="chip" />
              {switchedOff.map((channel) => channel.label).join(", ")}
              <span className="inbox-channel__state">switched off</span>
            </span>
          ) : null}
        </span>
        <span className="inbox-channels__more">
          {off > 0 ? "What's needed" : "How channels work"}
          <Icon name="chevron-down" size="chip" />
        </span>
      </summary>
      <ul className="inbox-channels__detail">
        {channels.map((channel) => (
          <li key={channel.channel}>
            <strong>{channel.label}.</strong> {channel.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The reply composer. Writing and pressing Review sends nothing: Concierge
 * prepares the Send review (who gets it, on which channel). Ask Duna may
 * draft words; a person always reviews and presses Send.
 */
export function Composer({
  conversationId,
  threadTitle,
  channels,
  canDraft,
  canSend,
  canChooseChannel,
  canSeeDeliveries,
  canReply,
  initialProposal,
}: {
  readonly conversationId: string;
  readonly threadTitle: string;
  readonly channels: readonly ChannelStatus[];
  readonly canDraft: boolean;
  readonly canSend: boolean;
  readonly canChooseChannel: boolean;
  readonly canSeeDeliveries: boolean;
  /** The reply capability (the Send review procedures exist). */
  readonly canReply: boolean;
  /** A review handed over from another screen. */
  readonly initialProposal?: ConciergeSendProposal;
}) {
  const router = useRouter();
  const shell = useShell();
  const fieldId = useId();
  const [body, setBody] = useState("");
  const [operational, setOperational] = useState(false);
  const [proposal, setProposal] = useState<ConciergeSendProposal | undefined>(
    initialProposal,
  );
  const [reviewing, setReviewing] = useState(Boolean(initialProposal));
  useLeaveGuard(body.trim().length > 0 && !reviewing);

  const review = useAction(
    async () => {
      const text = body.trim();
      if (proposal && isOpenReview(proposal)) {
        return unwrap(
          await editReviewAction({
            proposalId: proposal.proposalId,
            body: text,
          }),
        );
      }
      return unwrap(
        await reviewReplyAction({
          conversationId,
          body: text,
          draftedBy: "person",
          kind: operational ? "operational" : "conversation",
        }),
      );
    },
    {
      report: reportFailure("hq.inbox.reviewFailed"),
      onSuccess: (next) => {
        setProposal(next);
        setReviewing(true);
      },
    },
  );

  if (!canDraft || !canReply) {
    return (
      <div className="inbox-composer">
        <Notice title="You can read this conversation" tone="info">
          {canReply
            ? "Your role can't write for the club. An owner or manager can give you messaging."
            : "Writing from HQ isn't switched on for clubs yet."}
        </Notice>
      </div>
    );
  }

  if (reviewing && proposal) {
    return (
      <div className="inbox-composer" data-mode="review">
        <SendReview
          canChooseChannel={canChooseChannel}
          canSeeDeliveries={canSeeDeliveries}
          canSend={canSend}
          channels={channels}
          onClosed={() => {
            setProposal(undefined);
            setReviewing(false);
          }}
          onEdit={(text) => {
            setBody(text);
            setReviewing(false);
          }}
          onSent={() => {
            setBody("");
            router.refresh();
          }}
          proposal={proposal}
          where={threadTitle}
        />
        {!isOpenReview(proposal) ? (
          <div className="inbox-composer__again">
            <Button
              onClick={() => {
                setProposal(undefined);
                setReviewing(false);
              }}
              variant="secondary"
            >
              Write another message
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const tooLong = body.length > MAX;
  return (
    <form
      aria-label="Reply"
      className="inbox-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() && !tooLong) void review.run();
      }}
    >
      <Textarea
        aria-label="Message"
        autoResize
        id={fieldId}
        maxLength={MAX + 200}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (body.trim() && !tooLong) void review.run();
          }
        }}
        placeholder={`Write to ${threadTitle}. Nothing is sent until you review it.`}
        rows={2}
        value={body}
      />
      {tooLong ? (
        <p className="inbox-quiet" role="status">
          {body.length - MAX} characters over the limit.
        </p>
      ) : null}
      {review.error ? (
        <Notice role="alert" title="Not ready to review" tone="danger">
          {messageOf(
            review.error,
            "The review couldn't be prepared. Nothing was sent.",
          )}
        </Notice>
      ) : null}
      <ChannelStrip channels={channels} />
      <div className="inbox-composer__bar">
        <Checkbox
          checked={operational}
          description="Reaches people in their quiet hours"
          label="Schedule change or cancellation"
          onCheckedChange={(checked) => setOperational(Boolean(checked))}
        />
        <div className="inbox-composer__actions">
          <Button
            icon={<Icon name="highlight" size="control" />}
            onClick={() =>
              shell.openAsk(
                `Draft a short, friendly reply for the "${threadTitle}" conversation in our Inbox. I'll review it and send it myself.`,
              )
            }
            type="button"
            variant="ghost"
          >
            Draft with Ask Duna
          </Button>
          <Button
            disabled={!body.trim() || tooLong}
            loading={review.buttonProps.loading}
            type="submit"
            variant="primary"
          >
            Review
          </Button>
        </div>
      </div>
    </form>
  );
}

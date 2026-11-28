"use client";

/**
 * A court invitation (`/app/booking-invite/[token]`): who invited you, to
 * what, the price line (paid by the host, or your share) and the court's
 * cancellation policy; Accept through the existing flow (a confirmation, then
 * a place the host paid for is confirmed, or secure checkout for a share).
 */
import { formatMoney } from "@duna/core";
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Notice,
  Rise,
  useConfirm,
} from "@duna/ui/tideline";
import { useEffect, useRef, useState } from "react";
import { startShareCheckoutAction } from "@/app/(next)/(app)/app/booking-invite/[inviteToken]/actions";
import { courtCheckoutStatusAction } from "@/components/discover/court-actions";
import { unwrap } from "../action-result";
import type { CourtInvite } from "../api-types";
import { OfflineNotice } from "../states";

export function BookingInviteView({
  invite,
  checkoutSessionId: initialSession,
  cancelled,
}: {
  readonly invite: CourtInvite;
  readonly checkoutSessionId?: string;
  readonly cancelled: boolean;
}) {
  const confirm = useConfirm();
  const [read, setRead] = useState(!invite.policy.requireFullScroll);
  const [accepted, setAccepted] = useState(false);
  const [joined, setJoined] = useState(
    invite.participant.status === "accepted" ||
      invite.participant.status === "paid",
  );
  const [status, setStatus] = useState<string>();
  const policy = useRef<HTMLDivElement>(null);
  const hostPaid = invite.participant.shareAmountMinor === 0;
  const share = formatMoney(
    invite.participant.shareAmountMinor,
    invite.currency,
  );
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: invite.timezone,
    timeZoneName: "short",
  }).format(new Date(invite.startsAt));
  const minutes = Math.round(
    (Date.parse(invite.endsAt) - Date.parse(invite.startsAt)) / 60_000,
  );
  const ended =
    invite.bookingStatus === "cancelled" ||
    invite.bookingStatus === "expired" ||
    invite.bookingStatus === "refunded";

  useEffect(() => {
    const element = policy.current;
    if (
      invite.policy.requireFullScroll &&
      element &&
      element.scrollHeight <= element.clientHeight + 2
    ) {
      setRead(true);
    }
  }, [invite.policy.requireFullScroll]);

  useEffect(() => {
    if (!initialSession) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const answer = await courtCheckoutStatusAction(initialSession);
      if (stop) return;
      if (!answer.ok) {
        setStatus(answer.error);
        return;
      }
      if (answer.status.complete) {
        setJoined(true);
        setStatus("Every share is paid. The court is confirmed.");
        return;
      }
      if (answer.status.sharePaid) {
        setJoined(true);
        setStatus(
          "Your share is paid. The court is confirmed once everyone has paid.",
        );
        return;
      }
      timer = setTimeout(() => void check(), 1_500);
    };
    void check();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialSession]);

  const accept = () =>
    void confirm
      .run({
        tier: hostPaid ? "confirm" : "strong",
        title: hostPaid
          ? `Join ${invite.organizerName} on ${invite.courtName}?`
          : `Pay your share of ${share}?`,
        description: hostPaid
          ? `${when} at ${invite.venueName}. ${invite.organizerName} sees that you’re in.`
          : `${when} at ${invite.venueName}. Secure checkout opens next; your place is held while everyone pays.`,
        ...(hostPaid
          ? {}
          : {
              amount: share,
              recipients: invite.venueName,
              consequence: invite.policy.refundBeforeHours
                ? `Refundable until ${invite.policy.refundBeforeHours} hours before the start.`
                : "The venue’s terms apply to refunds.",
            }),
        verb: hostPaid ? "Accept invitation" : `Pay ${share}`,
        cancelLabel: "Not now",
        agentConfirm: hostPaid
          ? `Accepts ${invite.organizerName}'s court invitation`
          : `Opens checkout to pay a ${share} court share`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await startShareCheckoutAction({
              inviteToken: invite.inviteToken,
              policyAccepted: accepted,
              policyFullScrollConfirmed: read,
              idempotencyKey,
            }),
          ),
        success: (result) =>
          result.checkoutUrl
            ? "Opening secure checkout"
            : "You’re in. The organiser can see that you accepted.",
        report: (error) =>
          report(error, { event: "web.booking_invite.accept_failed" }),
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        if (outcome.result.checkoutUrl) {
          window.location.assign(outcome.result.checkoutUrl);
          return;
        }
        setJoined(true);
      });

  return (
    <div className="pp-form">
      <OfflineNotice />
      {cancelled ? (
        <Notice tone="info">
          Checkout was cancelled. Your share is still open while the court is
          held.
        </Notice>
      ) : null}
      {status ? (
        <Notice role="status" tone="positive">
          {status}
        </Notice>
      ) : null}
      <Card className="pp-plan">
        <div className="pp-plan__top">
          <Chip
            kind="status"
            tone={joined ? "positive" : ended ? "danger" : "warning"}
          >
            {joined ? "You’re in" : ended ? "No longer on" : "Waiting for you"}
          </Chip>
          <span className="pp-plan__kind">Court time</span>
        </div>
        <p className="pp-plan__title">
          {invite.venueName} · {invite.courtName}
        </p>
        <p className="pp-plan__when td-num">
          {when} · {minutes} minutes
        </p>
        <dl className="pp-plan__terms">
          <div>
            <dt>Price</dt>
            <dd>
              {hostPaid
                ? `Paid by ${invite.organizerName}. Nothing to pay.`
                : `Your share: ${share}`}
            </dd>
          </div>
          <div>
            <dt>Cancelling</dt>
            <dd>
              {invite.policy.refundBeforeHours
                ? `Refundable until ${invite.policy.refundBeforeHours} hours before the start`
                : "The venue’s terms apply"}
            </dd>
          </div>
        </dl>
      </Card>
      {joined ? (
        <Rise>
          <Notice title="You’re in" tone="positive">
            It’s in your plans with everything you need on the day.
            <div className="pp-row-actions">
              <Button href="/app/play" size="sm" variant="primary">
                Your plans
              </Button>
            </div>
          </Notice>
        </Rise>
      ) : ended || !invite.available ? (
        <Notice title="This invitation can’t be accepted" tone="warning">
          The court booking has ended or every place is taken. Ask{" "}
          {invite.organizerName} for a new link.
        </Notice>
      ) : (
        <>
          <section aria-labelledby="pp-policy" className="pp-step">
            <h2 className="pp-h2" id="pp-policy">
              {invite.policy.title}
            </h2>
            <div
              className="pp-policy"
              onScroll={(event) => {
                const element = event.currentTarget;
                if (
                  element.scrollTop + element.clientHeight >=
                  element.scrollHeight - 4
                )
                  setRead(true);
              }}
              ref={policy}
              tabIndex={0}
            >
              <p>{invite.policy.markdown}</p>
              {invite.policy.lateCancellation ? (
                <p>{invite.policy.lateCancellation}</p>
              ) : null}
            </div>
            <Checkbox
              checked={accepted}
              disabled={!read}
              label="I’ve read and accept this cancellation policy"
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            {!read ? (
              <p className="td-meta">Scroll to the end of the policy first.</p>
            ) : null}
          </section>
          <div className="pp-submit">
            <Button
              disabled={!accepted}
              onClick={accept}
              size="lg"
              variant="primary"
            >
              {hostPaid ? "Accept invitation" : `Pay my share: ${share}`}
            </Button>
          </div>
        </>
      )}
      {confirm.dialog}
    </div>
  );
}

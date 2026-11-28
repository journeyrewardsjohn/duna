"use client";

import { useState, useTransition } from "react";
import { changeOrganizationMembershipAction } from "./actions";

export function OrganizationMembershipActions({
  cancellationTiming,
  ending,
  membershipId,
  refundBehavior,
  refundWindowDays,
}: {
  readonly cancellationTiming: "period-end" | "immediate";
  readonly ending: boolean;
  readonly membershipId: string;
  readonly refundBehavior: "none" | "prorated" | "full-within-window";
  readonly refundWindowDays?: number;
}) {
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const action = ending ? "resume" : "cancel";
  const change = () => {
    if (
      action === "cancel" &&
      !window.confirm(
        cancellationTiming === "immediate"
          ? `Cancel immediately? ${
              refundBehavior === "prorated"
                ? "Stripe will refund the unused portion of this paid period."
                : refundBehavior === "full-within-window"
                  ? `The latest payment is refunded only if it is within ${refundWindowDays ?? 7} days.`
                  : "Payments already made are not refundable except where required by law."
            }`
          : "Schedule cancellation? Access continues through the paid period or accepted initial term, and future renewal stops.",
      )
    ) {
      return;
    }
    setNotice(undefined);
    startTransition(async () => {
      const response = await changeOrganizationMembershipAction({
        membershipId,
        action,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      const refund = response.result.refundAmountMinor
        ? ` ${new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(
            response.result.refundAmountMinor / 100,
          )} was submitted for refund.`
        : "";
      setNotice(
        action === "cancel"
          ? `Cancellation confirmed.${refund}`
          : "Automatic renewal resumed.",
      );
      window.location.reload();
    });
  };
  return (
    <div className="organization-membership-actions">
      <button disabled={pending} onClick={change} type="button">
        {pending
          ? "Updating…"
          : ending
            ? "Resume membership"
            : cancellationTiming === "immediate"
              ? "Cancel membership"
              : "Schedule cancellation"}
      </button>
      {notice && <small role="status">{notice}</small>}
    </div>
  );
}

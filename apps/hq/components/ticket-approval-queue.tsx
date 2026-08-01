"use client";

import type { TicketApprovalSummary } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, Clock3, TicketCheck } from "lucide-react";
import { useActionState } from "react";
import {
  approveTicketOrderAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = {
  status: "idle",
  message: "",
};

function ApprovalCard({
  approval,
}: {
  readonly approval: TicketApprovalSummary;
}) {
  const [state, action, pending] = useActionState(
    approveTicketOrderAction,
    initialState,
  );
  return (
    <article className="ticket-approval-card">
      <div className="ticket-approval-card__icon">
        <TicketCheck aria-hidden size={20} />
      </div>
      <div className="ticket-approval-card__copy">
        <span>
          <strong>{approval.buyerName}</strong>
          <Badge tone="warning">Approval required</Badge>
        </span>
        <h3>
          {approval.ticketName} · {approval.eventTitle}
        </h3>
        <p>
          {approval.quantity} ticket{approval.quantity === 1 ? "" : "s"} ·{" "}
          {formatMoney(approval.totalMinor, approval.currency)}
        </p>
        <small>
          <Clock3 aria-hidden size={13} />
          Purchased{" "}
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(approval.purchasedAt))}
        </small>
        {state.status !== "idle" && (
          <p
            className={`operator-action-notice operator-action-notice--${state.status}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "success" ? (
              <Check aria-hidden size={14} />
            ) : (
              <CircleAlert aria-hidden size={14} />
            )}
            {state.message}
          </p>
        )}
      </div>
      <form action={action}>
        <input name="orderId" type="hidden" value={approval.orderId} />
        <input
          name="ticketTypeId"
          type="hidden"
          value={approval.ticketTypeId}
        />
        <input name="confirmed" type="hidden" value="true" />
        <button
          className="hq-button hq-button--primary"
          disabled={pending || state.status === "success"}
          type="submit"
        >
          <Check aria-hidden size={15} />
          {pending
            ? "Approving…"
            : state.status === "success"
              ? "Approved"
              : "Approve"}
        </button>
      </form>
    </article>
  );
}

export function TicketApprovalQueue({
  approvals,
}: {
  readonly approvals: readonly TicketApprovalSummary[];
}) {
  if (approvals.length === 0) return null;
  return (
    <section className="hq-card ticket-approval-queue">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Paid + held</span>
          <h2>Ticket approvals</h2>
          <p>
            Payment is complete. Tickets remain unusable until an authorized
            operator approves them.
          </p>
        </div>
        <Badge tone="warning">{approvals.length} waiting</Badge>
      </header>
      <div className="ticket-approval-list">
        {approvals.map((approval) => (
          <ApprovalCard
            approval={approval}
            key={`${approval.orderId}:${approval.ticketTypeId}`}
          />
        ))}
      </div>
    </section>
  );
}

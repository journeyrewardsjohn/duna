"use client";

import { formatMoney } from "@duna/core";
import {
  Button,
  Chip,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  Field,
  MoneyInput,
  Notice,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  changeFeeAction,
  refundEntryAction,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { failed } from "./event-actions";
import type { EventCapabilities } from "./events-capabilities";
import type { TicketApprovalRow } from "./events-data";
import { TicketApprovals } from "./events-list";
import {
  feeChangePreview,
  type DivisionView,
  type EventPermissions,
  type EventView,
  type OrderView,
} from "./events-model";

/**
 * An event's money, for roles that may see it (the same rule as Schedule
 * and People): what was collected, refunded and kept, each order with what
 * a refund would return, and the entry fees. Refunding is the owner's
 * (payments:write) and restates who gets what before it happens.
 */
export function EventMoney({
  view,
  permissions,
  capabilities,
  approvals,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
  readonly capabilities: EventCapabilities;
  readonly approvals: readonly TicketApprovalRow[];
}) {
  const [refunding, setRefunding] = useState<OrderView | null>(null);
  const [changing, setChanging] = useState<DivisionView | null>(null);
  const money = view.money;
  if (!money) return null;
  return (
    <div className="ev-stack">
      <dl className="ev-figures">
        <div className="ev-figure">
          <dt>Collected</dt>
          <dd>{money.gross}</dd>
          <small>
            {money.paidOrders} paid{" "}
            {money.paidOrders === 1 ? "order" : "orders"}
          </small>
        </div>
        <div className="ev-figure">
          <dt>Refunded</dt>
          <dd>{money.refunded}</dd>
        </div>
        <div className="ev-figure">
          <dt>Net</dt>
          <dd>{money.net}</dd>
          <small>Before Duna Pay's fees</small>
        </div>
      </dl>
      {approvals.length ? <TicketApprovals approvals={approvals} /> : null}
      {money.fees.length ? (
        <PageSection flush id="fees" title="Entry fees">
          <ul className="ev-list">
            {money.fees.map((fee, index) => {
              const division = view.divisions[index];
              return (
                <li className="ev-item" key={fee.division}>
                  <span className="ev-item__main">
                    <span className="ev-item__title">{fee.division}</span>
                    <span className="ev-quiet">{fee.fee}</span>
                  </span>
                  {capabilities.changeFee &&
                  permissions.refund &&
                  division &&
                  view.status !== "cancelled" &&
                  view.segment !== "past" ? (
                    <span className="ev-item__side">
                      <Button
                        onClick={() => setChanging(division)}
                        size="sm"
                        variant="ghost"
                      >
                        Change fee
                      </Button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}
      <PageSection flush id="orders" title={`Orders · ${money.orders.length}`}>
        {money.orders.length === 0 ? (
          <p className="ev-quiet ev-pad">Nobody has paid for this event.</p>
        ) : (
          <ul className="ev-list">
            {money.orders.map((order) => (
              <li
                className="ev-item"
                data-dim={order.refunded || undefined}
                key={order.orderId}
              >
                <span className="ev-item__main">
                  <span className="ev-item__title">
                    {order.buyer}
                    <span className="ev-num">{order.total}</span>
                  </span>
                  <span className="ev-quiet">
                    {order.refunded
                      ? "Refunded"
                      : `A refund returns ${order.refundWords}.`}
                  </span>
                </span>
                <span className="ev-item__side">
                  {order.refunded ? (
                    <Chip tone="neutral">Refunded</Chip>
                  ) : permissions.refund && order.registrationId ? (
                    <Button
                      onClick={() => setRefunding(order)}
                      size="sm"
                      variant="secondary"
                    >
                      Refund
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
      {!permissions.refund ? (
        <Notice tone="info">Refunds are made by the club's owner.</Notice>
      ) : null}
      <RefundOrder
        eventId={view.id}
        onClose={() => setRefunding(null)}
        order={refunding}
        title={view.title}
      />
      <ChangeFee
        currency={money.currency}
        division={changing}
        eventId={view.id}
        onClose={() => setChanging(null)}
      />
    </div>
  );
}

function RefundOrder({
  order,
  eventId,
  title,
  onClose,
}: {
  readonly order: OrderView | null;
  readonly eventId: string;
  readonly title: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    onClose();
  };
  return (
    <Dialog
      {...inline.hostProps}
      onOpenChange={(open) => (open ? undefined : close())}
      open={order !== null}
    >
      {order ? (
        <DialogContent
          description={`${order.buyer} paid ${order.total} for ${title}.`}
          title={`Refund ${order.buyer}`}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <p className="ev-quiet">
                A refund returns {order.refundWords}. Their entry is checked
                again: an unpaid team can lose its place.
              </p>
              <Field
                error={
                  reason.length > 0 && reason.trim().length < 5
                    ? "At least 5 characters."
                    : undefined
                }
                hint="Kept with the order. The player doesn't see it."
                label="Reason"
              >
                <Textarea
                  maxLength={1_000}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  value={reason}
                />
              </Field>
            </div>
            <DialogActions>
              <DialogClose>Cancel</DialogClose>
              <Button
                disabled={reason.trim().length < 5}
                onClick={() =>
                  void inline
                    .run({
                      tier: "strong",
                      destructive: true,
                      title: `Refund ${order.buyer}?`,
                      description: `Their payment for ${title} comes back and their entry is checked again.`,
                      amount: order.refundWords,
                      recipients: order.buyer,
                      consequence:
                        "A refund can't be undone. The club's balance goes down by the refunded amount.",
                      reference: `Order ${order.orderId.slice(0, 8)}`,
                      verb: "Refund",
                      cancelLabel: "Keep payment",
                      agentConfirm: `Refunds ${order.buyer}: ${order.refundWords}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await refundEntryAction({
                            sessionId: eventId,
                            registrationId: order.registrationId!,
                            orderId: order.orderId,
                            reason,
                            idempotencyKey,
                          }),
                        ),
                      success: `${order.buyer} is refunded`,
                      report: failed("hq.events.refund_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        close();
                        router.refresh();
                      }
                    })
                }
                variant="danger"
              >
                Review refund
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** Change a division's fee after people entered: each entrant's difference, shown before it happens. */
function ChangeFee({
  division,
  currency,
  eventId,
  onClose,
}: {
  readonly division: DivisionView | null;
  readonly currency: string;
  readonly eventId: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [fee, setFee] = useState<number | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  if (division && seeded !== division.id) {
    setSeeded(division.id);
    setFee(division.entryFeeMinor);
  }
  const close = () => {
    setSeeded(null);
    onClose();
  };
  const preview =
    division && fee !== null ? feeChangePreview(division, fee) : undefined;
  const money = (minor: number) => formatMoney(minor, currency);
  return (
    <Dialog
      {...inline.hostProps}
      onOpenChange={(open) => (open ? undefined : close())}
      open={division !== null}
    >
      {division ? (
        <DialogContent
          description={`Now ${money(division.entryFeeMinor)} per team.`}
          title={`Change the ${division.name} fee`}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <Field label="New fee per team">
                <MoneyInput
                  currency={currency}
                  onValueChange={setFee}
                  value={fee}
                />
              </Field>
              {preview && preview.rows.length ? (
                <ul aria-label="Who gets what" className="ev-list">
                  {preview.rows.map((row) => (
                    <li className="ev-item" key={row.team}>
                      <span className="ev-item__title">{row.team}</span>
                      <span className="ev-item__side ev-num">
                        {row.deltaMinor < 0
                          ? `${money(-row.deltaMinor)} back`
                          : row.deltaMinor > 0
                            ? `owes ${money(row.deltaMinor)}`
                            : "No change"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ev-quiet">
                  Nobody has paid in this division yet: only new entries pay the
                  new fee.
                </p>
              )}
            </div>
            <DialogActions>
              <DialogClose>Cancel</DialogClose>
              <Button
                disabled={fee === null || fee === division.entryFeeMinor}
                onClick={() =>
                  void inline
                    .run({
                      tier: "strong",
                      title: `Change the fee to ${money(fee ?? 0)}?`,
                      description: `New entries to ${division.name} pay ${money(fee ?? 0)}.`,
                      amount: preview
                        ? [
                            preview.refundMinor
                              ? `${money(preview.refundMinor)} back to ${preview.refunded} ${preview.refunded === 1 ? "team" : "teams"}`
                              : undefined,
                            preview.owedMinor
                              ? `${money(preview.owedMinor)} owed by ${preview.owing} ${preview.owing === 1 ? "team" : "teams"}`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join("; ") || "No money moves"
                        : "No money moves",
                      recipients: preview?.rows.length
                        ? preview.rows.map((row) => row.team).join(", ")
                        : "Nobody yet",
                      consequence:
                        "Refunds can't be undone. Teams who owe more are asked to pay in Duna.",
                      verb: "Change fee",
                      cancelLabel: "Keep the fee",
                      agentConfirm: `Changes the ${division.name} fee to ${money(fee ?? 0)}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await changeFeeAction({
                            sessionId: eventId,
                            divisionId: division.id,
                            feeMinor: fee ?? 0,
                            idempotencyKey,
                          }),
                        ),
                      success: "Fee changed",
                      report: failed("hq.events.change_fee_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        close();
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Review
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

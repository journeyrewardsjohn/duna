/**
 * The visual part of an AI proposal (Ask Duna, Concierge): what would change,
 * before and after, and the person's answer. Plain markup. Wiring it to the
 * agent (the `propose_change` tool, applying through the same confirmation
 * tier as the person's own action) is work package S4's.
 */
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

export interface ProposalChange {
  /** What changes: "Court", "Start time", "Price". */
  label: string;
  /** The value now. Leave out for something new ("Not set" is shown). */
  before?: ReactNode;
  /** The proposed value. Leave out for a removal ("Removed" is shown). */
  after?: ReactNode;
}

export interface ProposalCardProps extends Omit<
  ComponentProps<"section">,
  "title"
> {
  /** One line naming the change: "Move Tuesday practice to Court 3". */
  title: ReactNode;
  /** Who proposes it. */
  source?: ReactNode;
  /** Why, in a sentence, when the proposal has a reason. */
  reason?: ReactNode;
  changes: ProposalChange[];
  /** Who it affects: "14 players are told by email if you apply it." */
  affected?: ReactNode;
  /** The reference of the object it acts on. */
  reference?: string;
  /** Proposed (answer it), applied or dismissed (read-only). */
  status?: "proposed" | "applied" | "dismissed";
  /** Apply / Edit / Dismiss buttons. Apply goes through `useConfirm` at the action's tier. */
  actions?: ReactNode;
}

const statusWords = {
  proposed: "Proposed",
  applied: "Applied",
  dismissed: "Dismissed",
} as const;

/**
 * A proposal as a before/after table. Nothing in it changes anything:
 * the person answers with `actions`, and applying passes through the same
 * confirmation as their own change.
 */
export function ProposalCard({
  title,
  source = "Ask Duna",
  reason,
  changes,
  affected,
  reference,
  status = "proposed",
  actions,
  className,
  ...props
}: ProposalCardProps) {
  return (
    <section
      className={cx("td-proposal", className)}
      data-status={status}
      {...props}
    >
      <header className="td-proposal__header">
        <p className="td-proposal__source">
          <span>{source}</span>
          <span className="td-proposal__status">{statusWords[status]}</span>
        </p>
        <h3 className="td-proposal__title">{title}</h3>
        {reason ? <p className="td-proposal__reason">{reason}</p> : null}
      </header>
      <table className="td-proposal__changes">
        <caption className="td-sr">Proposed changes</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="td-sr">What</span>
            </th>
            <th scope="col">Before</th>
            <th aria-hidden="true" className="td-proposal__arrowcell" />
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.label}>
              <th className="td-proposal__label" scope="row">
                {change.label}
              </th>
              <td className="td-proposal__before">
                {change.before ?? (
                  <span className="td-proposal__empty">Not set</span>
                )}
              </td>
              <td aria-hidden="true" className="td-proposal__arrowcell">
                <Icon name="chevron-right" size="sm" />
              </td>
              <td className="td-proposal__after">
                {change.after ?? (
                  <span className="td-proposal__empty">Removed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {affected || reference ? (
        <p className="td-proposal__meta">
          {affected}
          {reference ? (
            <span className="td-proposal__reference">
              Reference <span className="td-proposal__code">{reference}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      {actions && status === "proposed" ? (
        <div className="td-proposal__actions">{actions}</div>
      ) : null}
    </section>
  );
}

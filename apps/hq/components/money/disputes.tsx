import type { PayDisputeDetail } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse, Notice, ObjectHeader } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import { DisputeResponse } from "./dispute-response";
import { loadDisputes } from "./money-data";
import {
  deadlineLabel,
  disputeReason,
  disputeStatusCopy,
  formatAmount,
  formatClubDate,
  OPEN_DISPUTE_STATUSES,
  sortDisputes,
} from "./money-model";
import { Amount, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { renderLink } from "./money-link";

/** Every dispute: the ones needing a response first, earliest deadline first. */
export async function DisputesList({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const disputes = await loadDisputes();
  if (disputes.state !== "ok") {
    return (
      <PageSection flush id="disputes" title="Disputes">
        <BlockState
          canSetUp={context.canWrite}
          feature="Disputes"
          loaded={disputes}
          organization={context.organization}
          retryHref={hqHref("moneyDisputes")}
          what="disputes"
        />
      </PageSection>
    );
  }
  const now = new Date();
  const sorted = sortDisputes(disputes.data.items);
  const open = sorted.filter((item) =>
    OPEN_DISPUTE_STATUSES.includes(item.status),
  );
  const closed = sorted.filter(
    (item) => !OPEN_DISPUTE_STATUSES.includes(item.status),
  );
  const row = (item: (typeof sorted)[number]) => {
    const copy = disputeStatusCopy(item.status);
    const due = item.organizationEvidenceDueBy ?? item.evidenceDueBy;
    return (
      <MoneyRow
        amount={<Amount>{formatAmount(item.amount)}</Amount>}
        href={hqHref("moneyDispute", { disputeId: item.id })}
        key={item.id}
        meta={[
          item.buyer?.displayName,
          item.status === "needs-response" && due
            ? `${deadlineLabel(due, now)} (${formatClubDate(due, context.timeZone)})`
            : item.closedAt
              ? `Closed ${formatClubDate(item.closedAt, context.timeZone)}`
              : `Opened ${formatClubDate(item.openedAt, context.timeZone)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        state={<StateChip copy={copy} />}
        title={disputeReason(item.reason)}
      />
    );
  };
  if (sorted.length === 0) {
    return (
      <PageSection id="disputes" title="Disputes">
        <EmptyFirstUse
          action={
            <Button
              href={hqHref("moneyTransactions")}
              size="sm"
              variant="secondary"
            >
              See transactions
            </Button>
          }
          description="When a buyer questions a payment with their bank, it shows here with the deadline to respond. The amount is held until it's decided."
          icon="policy"
          title="No disputes"
        />
      </PageSection>
    );
  }
  return (
    <>
      <PageSection flush id="disputes-open" title="Open">
        {open.length === 0 ? (
          <Quiet>No open disputes.</Quiet>
        ) : (
          <ul aria-label="Open disputes" className="money-list">
            {open.map(row)}
          </ul>
        )}
      </PageSection>
      {closed.length > 0 ? (
        <PageSection flush id="disputes-closed" title="Decided">
          <ul aria-label="Decided disputes" className="money-list">
            {closed.map(row)}
          </ul>
        </PageSection>
      ) : null}
    </>
  );
}

/** One dispute as an open object: the timeline, what's held, the response, the outcome. */
export function DisputeDetail({
  dispute,
  saleTitle,
  context,
}: {
  readonly dispute: PayDisputeDetail;
  readonly saleTitle?: string;
  readonly context: MoneyContext;
}) {
  const copy = disputeStatusCopy(dispute.status);
  const now = new Date();
  const buyer = dispute.buyer?.displayName ?? "The buyer";
  const clubDue = dispute.organizationEvidenceDueBy;
  const bankDue = dispute.evidenceDueBy;
  const timeline = [
    { at: dispute.openedAt, label: `${buyer}'s bank opened the dispute` },
    ...(dispute.holdId
      ? [
          {
            at: dispute.openedAt,
            label: `${formatAmount(dispute.amount)} held from the sale`,
          },
        ]
      : []),
    ...(dispute.evidenceSubmittedAt
      ? [{ at: dispute.evidenceSubmittedAt, label: "Your response was sent" }]
      : []),
    ...(dispute.closedAt
      ? [
          {
            at: dispute.closedAt,
            label: `Decided: ${copy.label.toLowerCase()}`,
          },
        ]
      : []),
  ];
  return (
    <>
      <ObjectHeader
        back={{ href: hqHref("moneyDisputes"), label: "Disputes" }}
        description={`${disputeReason(dispute.reason)}.`}
        facts={[
          {
            label: "Disputed",
            value: formatAmount(dispute.amount),
            numeric: true,
          },
          {
            label: dispute.feeReturned
              ? "Dispute fee (returned)"
              : "Dispute fee",
            value: formatAmount(dispute.fee),
            numeric: true,
          },
          ...(clubDue && dispute.status === "needs-response"
            ? [
                {
                  label: "Respond by",
                  value: formatClubDate(clubDue, context.timeZone),
                },
              ]
            : []),
          {
            label: "Opened",
            value: formatClubDate(dispute.openedAt, context.timeZone),
          },
        ]}
        renderLink={renderLink}
        status={{ label: copy.label, tone: copy.tone }}
        title={`Dispute from ${buyer}`}
      />
      <p className="money-lead">{copy.sentence}</p>
      <div className="money-cols">
        <div className="money-col money-col--main">
          {dispute.status === "needs-response" ? (
            <PageSection id="dispute-respond" title="Your response">
              {clubDue ? (
                <Notice title={deadlineLabel(clubDue, now)} tone="attention">
                  {`Send your side by ${formatClubDate(clubDue, context.timeZone)}${bankDue ? `. The bank's own deadline is ${formatClubDate(bankDue, context.timeZone)}; Duna needs yours earlier to send it on time` : ""}.`}
                </Notice>
              ) : null}
              {context.canWrite ? (
                <DisputeResponse
                  amount={formatAmount(dispute.amount)}
                  buyer={buyer}
                  deadline={formatClubDate(
                    clubDue ?? bankDue,
                    context.timeZone,
                  )}
                  disputeCaseId={dispute.id}
                />
              ) : (
                <Quiet>Only an owner can respond to a dispute.</Quiet>
              )}
            </PageSection>
          ) : dispute.evidence.explanation ? (
            <PageSection id="dispute-sent" title="What you sent">
              <blockquote className="money-quote">
                {dispute.evidence.explanation}
              </blockquote>
              {dispute.evidence.files.length > 0 ? (
                <ul className="money-checklist">
                  {dispute.evidence.files.map((file) => (
                    <li key={file.storageKey}>
                      <span>{file.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </PageSection>
          ) : null}
          <PageSection id="dispute-timeline" title="Timeline">
            <ol className="money-timeline">
              {timeline.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className="money-timeline__what">{entry.label}</span>
                  <span className="td-meta">
                    {formatClubDate(entry.at, context.timeZone)}
                  </span>
                </li>
              ))}
            </ol>
          </PageSection>
        </div>
        <div className="money-col">
          <PageSection id="dispute-money" title="What's held">
            <p className="money-body">
              {dispute.holdId
                ? `${formatAmount(dispute.amount)} from this sale is held and won't be paid out until the bank decides. If you win, it's released and paid out as normal.`
                : dispute.status === "won"
                  ? "Nothing is held. The amount was released after you won."
                  : dispute.status === "warning-closed"
                    ? "Nothing was held for this inquiry."
                    : "Nothing is held for this dispute now."}
            </p>
            {dispute.obligationId ? (
              <Button
                href={hqHref("moneyTransaction", {
                  transactionId: dispute.obligationId,
                })}
                size="sm"
                variant="secondary"
              >
                {saleTitle ? `Open the sale: ${saleTitle}` : "Open the sale"}
              </Button>
            ) : null}
          </PageSection>
        </div>
      </div>
    </>
  );
}

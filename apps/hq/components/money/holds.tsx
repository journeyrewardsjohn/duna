import { Notice } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import { loadHolds, loadRecoveries, loadReserves } from "./money-data";
import {
  formatAmount,
  formatBps,
  formatClubDate,
  holdReason,
  holdStatusCopy,
  recoveryKind,
  recoveryStatusCopy,
  reserveStatusCopy,
  reserveTrigger,
} from "./money-model";
import { Amount, MoneyRow, Quiet, StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { ReserveReview } from "./reserve-review";

/** Where money is held and why, in plain words. */
export async function HoldsList({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const holds = await loadHolds();
  return (
    <PageSection flush id="holds" title="Held money">
      {holds.state !== "ok" ? (
        <BlockState
          loaded={holds}
          organization={context.organization}
          what="holds"
        />
      ) : holds.data.length === 0 ? (
        <Quiet>
          Nothing is held. If money is ever held, for a dispute or a reserve, it
          shows here with the reason and when it ends.
        </Quiet>
      ) : (
        <ul aria-label="Holds" className="money-list">
          {holds.data.map((hold) => {
            const copy = holdStatusCopy(hold.status);
            const when =
              hold.status === "released" && hold.releasedAt
                ? `Released ${formatClubDate(hold.releasedAt, context.timeZone)}`
                : hold.releaseAfter
                  ? `Until ${formatClubDate(hold.releaseAfter, context.timeZone)}`
                  : `Since ${formatClubDate(hold.startsAt, context.timeZone)}`;
            return (
              <MoneyRow
                amount={
                  <Amount tone={hold.status === "active" ? undefined : "muted"}>
                    {formatAmount(hold.amount)}
                  </Amount>
                }
                key={hold.id}
                meta={`${holdReason(hold.kind)} ${when}.`}
                state={<StateChip copy={copy} />}
                title={hold.reason}
              />
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}

/**
 * Reserves. A proposed rolling reserve is shown as a proposal: nothing is
 * held until a Duna person activates it after written notice. Clubs see it
 * and may ask for a review; they cannot activate it.
 */
export async function ReservesList({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const reserves = await loadReserves();
  if (reserves.state !== "ok") {
    return (
      <PageSection id="reserves" title="Reserves">
        <BlockState
          loaded={reserves}
          organization={context.organization}
          what="reserves"
        />
      </PageSection>
    );
  }
  const proposed = reserves.data.filter(
    (reserve) => reserve.status === "proposed",
  );
  const others = reserves.data.filter(
    (reserve) => reserve.status !== "proposed",
  );
  return (
    <PageSection id="reserves" title="Reserves">
      {reserves.data.length === 0 ? (
        <Quiet>
          No reserves. A reserve holds part of new sales for a while, and is
          only ever started by a Duna person after telling you in writing.
        </Quiet>
      ) : null}
      {proposed.map((reserve) => (
        <Notice
          action={
            context.canWrite ? (
              <ReserveReview reserveId={reserve.id} />
            ) : undefined
          }
          key={reserve.id}
          title={
            reserve.kind === "closure"
              ? "Proposed: a closure reserve"
              : `Proposed: hold ${formatBps(reserve.percentBps)} of new sales`
          }
          tone="info"
        >
          {`Why: ${reserveTrigger(reserve.trigger)}. ${reserveStatusCopy("proposed").sentence}`}
        </Notice>
      ))}
      {others.length > 0 ? (
        <ul aria-label="Reserves" className="money-list money-list--tight">
          {others.map((reserve) => {
            const copy = reserveStatusCopy(reserve.status);
            const dates = [
              reserve.startsAt
                ? `From ${formatClubDate(reserve.startsAt, context.timeZone)}`
                : undefined,
              reserve.endsAt
                ? `until ${formatClubDate(reserve.endsAt, context.timeZone)}`
                : undefined,
              reserve.reviewAt && reserve.status === "active"
                ? `reviewed ${formatClubDate(reserve.reviewAt, context.timeZone)}`
                : undefined,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <MoneyRow
                amount={<Amount>{formatAmount(reserve.held)}</Amount>}
                key={reserve.id}
                meta={[reserveTrigger(reserve.trigger), dates]
                  .filter(Boolean)
                  .join(" · ")}
                state={<StateChip copy={copy} />}
                title={
                  reserve.kind === "unredeemed-credit"
                    ? `Unused credit reserve, ${formatBps(reserve.percentBps)}`
                    : reserve.kind === "closure"
                      ? "Closure reserve"
                      : `Rolling reserve, ${formatBps(reserve.percentBps)} of new sales`
                }
                trailing={
                  reserve.status === "active" && context.canWrite ? (
                    <ReserveReview reserveId={reserve.id} />
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      ) : null}
    </PageSection>
  );
}

function owedFor(reason: string): string {
  const reasons: Record<string, string> = {
    "negative-balance": "A refund or dispute after a payout",
    "video-overage": "Video beyond your plan's allowance",
  };
  return (
    reasons[reason] ??
    reason.replaceAll("-", " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Money owed after a refund or dispute that came after a payout. */
export async function RecoveriesList({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const recoveries = await loadRecoveries();
  return (
    <PageSection id="recoveries" title="Owed to Duna">
      {recoveries.state !== "ok" ? (
        <BlockState
          loaded={recoveries}
          organization={context.organization}
          what="amounts owed"
        />
      ) : recoveries.data.length === 0 ? (
        <Quiet>
          Nothing is owed. If a refund or dispute ever comes after a payout,
          it's recovered from new sales and shows here.
        </Quiet>
      ) : (
        <ul aria-label="Amounts owed" className="money-list money-list--tight">
          {recoveries.data.map((recovery) => {
            const copy = recoveryStatusCopy(recovery.status);
            return (
              <MoneyRow
                amount={<Amount>{formatAmount(recovery.amount)}</Amount>}
                key={recovery.id}
                meta={[
                  copy.sentence,
                  recoveryKind(recovery.kind),
                  recovery.collectedAt
                    ? `Settled ${formatClubDate(recovery.collectedAt, context.timeZone)}`
                    : recovery.dueAt
                      ? `Due ${formatClubDate(recovery.dueAt, context.timeZone)}`
                      : undefined,
                  copy.next,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                state={<StateChip copy={copy} />}
                title={owedFor(recovery.owedFor)}
              />
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}

import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import {
  isFirstUse,
  OverviewAttention,
  OverviewBalance,
  OverviewFirstUse,
  OverviewHolds,
  OverviewMonth,
  OverviewPayouts,
  OverviewSales,
  OverviewStatus,
} from "@/components/money/overview";
import { MoneyRowsSkeleton } from "@/components/money/money-states";

export const metadata: Metadata = { title: "Money" };

/**
 * Money › Overview (MN-Home): what the club is owed and when, what is held
 * and why, what needs the owner, recent payouts and sales. Each block loads
 * on its own and has its own states.
 */
export default async function MoneyOverviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
  // The old return address from verification lands on Duna Pay setup.
  if (stripe === "return" || stripe === "refresh") {
    redirect(`${hqHref("moneyDunaPay")}?stripe=${stripe}`);
  }
  const context = await moneyContext();
  const firstUse =
    context.session.access === "operator" && (await isFirstUse());
  return (
    <MoneyScreen
      askLabel="Money overview"
      askStarters={[
        "When is my next payout and how much will it be?",
        "Why is some of my money held?",
        "Which disputes need a response this week?",
      ]}
      description={`What ${context.organization} is owed, and when it arrives`}
      tab="overview"
      title="Money"
    >
      <Suspense fallback={null}>
        <OverviewStatus context={context} />
      </Suspense>
      {firstUse ? (
        <OverviewFirstUse context={context} />
      ) : (
        <>
          <Suspense
            fallback={
              <MoneyRowsSkeleton label="Loading the balance" rows={1} />
            }
          >
            <OverviewBalance context={context} />
          </Suspense>
          <div className="money-cols">
            <div className="money-col money-col--main">
              <Suspense
                fallback={<MoneyRowsSkeleton label="Loading what needs you" />}
              >
                <OverviewAttention context={context} />
              </Suspense>
              <Suspense
                fallback={<MoneyRowsSkeleton label="Loading recent sales" />}
              >
                <OverviewSales context={context} />
              </Suspense>
            </div>
            <div className="money-col">
              <Suspense
                fallback={<MoneyRowsSkeleton label="Loading holds" rows={2} />}
              >
                <OverviewHolds context={context} />
              </Suspense>
              <Suspense
                fallback={
                  <MoneyRowsSkeleton label="Loading payouts" rows={3} />
                }
              >
                <OverviewPayouts context={context} />
              </Suspense>
              <Suspense
                fallback={
                  <MoneyRowsSkeleton label="Loading this month" rows={1} />
                }
              >
                <OverviewMonth context={context} />
              </Suspense>
            </div>
          </div>
        </>
      )}
    </MoneyScreen>
  );
}

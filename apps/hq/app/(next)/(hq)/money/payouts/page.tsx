import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { MoneyRowsSkeleton } from "@/components/money/money-states";
import { PayoutSchedule, PayoutsList } from "@/components/money/payouts";
import { OverviewBalance } from "@/components/money/overview";

export const metadata: Metadata = { title: "Payouts" };

/** Money › Payouts: every payout with its state, and the schedule as a sentence. */
export default async function MoneyPayoutsPage() {
  const context = await moneyContext();
  return (
    <MoneyScreen
      askLabel="Payouts"
      askStarters={[
        "When does my next payout arrive?",
        "Why did a payout fail?",
        "Which sales were in my last payout?",
      ]}
      description={`When ${context.organization}'s money reaches the bank`}
      tab="payouts"
      title="Payouts"
    >
      <Suspense
        fallback={<MoneyRowsSkeleton label="Loading the balance" rows={1} />}
      >
        <OverviewBalance context={context} scheduleLink={false} />
      </Suspense>
      <div className="money-cols">
        <div className="money-col money-col--main">
          <Suspense fallback={<MoneyRowsSkeleton label="Loading payouts" />}>
            <PayoutsList context={context} />
          </Suspense>
        </div>
        <div className="money-col">
          <Suspense
            fallback={
              <MoneyRowsSkeleton label="Loading the schedule" rows={2} />
            }
          >
            <PayoutSchedule context={context} />
          </Suspense>
        </div>
      </div>
    </MoneyScreen>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { MoneyRowsSkeleton } from "@/components/money/money-states";
import { RefundHistory, RefundPolicies } from "@/components/money/refunds";

export const metadata: Metadata = { title: "Refunds" };

/** Money › Refunds: refunds given, and the policies players agree to. */
export default async function MoneyRefundsPage() {
  const context = await moneyContext();
  return (
    <MoneyScreen
      askLabel="Refunds"
      askStarters={[
        "How much have we refunded this month?",
        "Draft a 24-hour refund policy for lessons",
        "Which refunds came out of our balance?",
      ]}
      description="Refunds given, and the policies players agree to before they pay"
      tab="refunds"
      title="Refunds"
    >
      <div className="money-cols">
        <div className="money-col money-col--main">
          <Suspense fallback={<MoneyRowsSkeleton label="Loading refunds" />}>
            <RefundHistory context={context} />
          </Suspense>
        </div>
        <div className="money-col">
          <Suspense
            fallback={
              <MoneyRowsSkeleton label="Loading refund policies" rows={2} />
            }
          >
            <RefundPolicies context={context} />
          </Suspense>
        </div>
      </div>
    </MoneyScreen>
  );
}

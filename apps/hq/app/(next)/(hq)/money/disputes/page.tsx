import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputesList } from "@/components/money/disputes";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { MoneyRowsSkeleton } from "@/components/money/money-states";

export const metadata: Metadata = { title: "Disputes" };

/** Money › Disputes: the ones needing a response first, by deadline. */
export default async function MoneyDisputesPage() {
  const context = await moneyContext();
  return (
    <MoneyScreen
      askLabel="Disputes"
      askStarters={[
        "Which disputes need a response first?",
        "Help me write a response to the open dispute",
        "How much is held for disputes?",
      ]}
      description="When a buyer questions a payment with their bank"
      tab="disputes"
      title="Disputes"
    >
      <Suspense fallback={<MoneyRowsSkeleton label="Loading disputes" />}>
        <DisputesList context={context} />
      </Suspense>
    </MoneyScreen>
  );
}

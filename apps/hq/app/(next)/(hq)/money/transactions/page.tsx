import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { MoneyRowsSkeleton } from "@/components/money/money-states";
import { TransactionsBlock } from "@/components/money/transactions";

export const metadata: Metadata = { title: "Transactions" };

/** Money › Transactions: every sale, searchable and filterable. */
export default async function MoneyTransactionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    filter?: string;
    q?: string;
    refund?: string;
  }>;
}) {
  const { filter, q, refund } = await searchParams;
  const context = await moneyContext();
  return (
    <MoneyScreen
      askLabel="Transactions"
      askStarters={[
        "Which sales are still waiting for their session?",
        "How much did we refund this month?",
        "Find Maya's last payment",
      ]}
      description="Every sale, what Duna took, what you receive and when"
      tab="transactions"
      title="Transactions"
    >
      <Suspense
        fallback={<MoneyRowsSkeleton label="Loading transactions" rows={6} />}
      >
        <TransactionsBlock
          context={context}
          filter={filter}
          query={q}
          refunding={refund === "1"}
        />
      </Suspense>
    </MoneyScreen>
  );
}

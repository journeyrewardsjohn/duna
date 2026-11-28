import type { Metadata } from "next";
import { Suspense } from "react";
import {
  HoldsList,
  RecoveriesList,
  ReservesList,
} from "@/components/money/holds";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { MoneyRowsSkeleton } from "@/components/money/money-states";

export const metadata: Metadata = { title: "Holds and reserves" };

/** Money › Holds and reserves: where money is held and why. */
export default async function MoneyHoldsPage() {
  const context = await moneyContext();
  return (
    <MoneyScreen
      askLabel="Holds and reserves"
      askStarters={[
        "Why is some of our money held?",
        "When does the reserve end?",
        "What does a rolling reserve mean for us?",
      ]}
      description="Where money is held, why, and until when"
      tab="holds"
      title="Holds and reserves"
    >
      <Suspense fallback={<MoneyRowsSkeleton label="Loading holds" />}>
        <HoldsList context={context} />
      </Suspense>
      <Suspense
        fallback={<MoneyRowsSkeleton label="Loading reserves" rows={2} />}
      >
        <ReservesList context={context} />
      </Suspense>
      <Suspense
        fallback={<MoneyRowsSkeleton label="Loading amounts owed" rows={1} />}
      >
        <RecoveriesList context={context} />
      </Suspense>
    </MoneyScreen>
  );
}

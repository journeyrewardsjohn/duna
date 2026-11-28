import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse, Notice } from "@duna/ui/tideline";
import { PageSection } from "../shell/page-header";
import { loadObligations, loadTransactions } from "./money-data";
import { saleFilters, type SaleFilter } from "./money-model";
import type { MoneyContext } from "./money-screen";
import { BlockState } from "./money-states";
import { saleRows } from "./sales";
import { SalesTable } from "./sales-table";

/** Money › Transactions: every sale, with fees all-in and what happened to the money. */
export async function TransactionsBlock({
  context,
  filter,
  query,
  refunding,
}: {
  readonly context: MoneyContext;
  readonly filter?: string;
  readonly query?: string;
  readonly refunding?: boolean;
}) {
  const [obligations, payments] = await Promise.all([
    loadObligations(),
    loadTransactions(),
  ]);
  if (obligations.state !== "ok" && payments.state !== "ok") {
    return (
      <PageSection flush id="transactions" title="Sales">
        <BlockState
          canSetUp={context.canWrite}
          feature="Transactions"
          loaded={obligations.state === "error" ? obligations : payments}
          organization={context.organization}
          retryHref={hqHref("moneyTransactions")}
          what="transactions"
        />
      </PageSection>
    );
  }
  const rows = saleRows({
    obligations: obligations.state === "ok" ? obligations.data.items : [],
    payments: payments.state === "ok" ? payments.data : [],
    timeZone: context.timeZone,
  });
  const initialFilter = saleFilters.some((option) => option.value === filter)
    ? (filter as SaleFilter)
    : "all";
  return (
    <>
      {refunding ? (
        <Notice title="Refund a sale" tone="info">
          Open the sale to refund, then choose Refund this sale. You'll see
          exactly what the player gets back before anything is sent.
        </Notice>
      ) : null}
      {obligations.state !== "ok" ? (
        <BlockState
          canSetUp={context.canWrite}
          feature="Delivery and payout tracking"
          loaded={obligations}
          organization={context.organization}
          what="delivery and payout tracking"
        />
      ) : obligations.data.nextCursor ? (
        <p className="money-quiet">Showing your latest 100 sales.</p>
      ) : null}
      <PageSection flush id="transactions" title="Sales">
        {rows.length === 0 ? (
          <EmptyFirstUse
            action={
              <Button
                href={hqHref("offeringCreate")}
                size="sm"
                variant="secondary"
              >
                Create something to sell
              </Button>
            }
            description="Every booking, lesson, program, membership and event players pay for shows here, with Duna's fees and when you're paid."
            icon="pay"
            title="No sales yet"
          />
        ) : (
          <SalesTable
            initialFilter={initialFilter}
            initialQuery={query}
            rows={rows}
          />
        )}
      </PageSection>
    </>
  );
}

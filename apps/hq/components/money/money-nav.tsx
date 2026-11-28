import { hqHref } from "@duna/core/hq-routes";
import type { SubNavItem } from "@duna/ui/tideline";
import { loadDisputes } from "./money-data";
import { MoneySubNav } from "./money-subnav";

export type MoneyTab =
  | "overview"
  | "transactions"
  | "payouts"
  | "disputes"
  | "refunds"
  | "holds"
  | "duna-pay"
  | "tax";

/**
 * Money's sub-navigation (S3 SubNav in the PageHeader slot). Tabs are
 * routes; past six the rest sit under "More" (the current one never does).
 * Disputes carries the count that needs a response.
 */
export async function MoneyNav({ current }: { readonly current: MoneyTab }) {
  const disputes = await loadDisputes();
  const needsResponse =
    disputes.state === "ok"
      ? disputes.data.items.filter((item) => item.status === "needs-response")
          .length
      : 0;
  const items: SubNavItem[] = [
    { id: "overview", label: "Overview", href: hqHref("money") },
    {
      id: "transactions",
      label: "Transactions",
      href: hqHref("moneyTransactions"),
    },
    { id: "payouts", label: "Payouts", href: hqHref("moneyPayouts") },
    { id: "refunds", label: "Refunds", href: hqHref("moneyRefundPolicies") },
    {
      id: "disputes",
      label: "Disputes",
      href: hqHref("moneyDisputes"),
      count: needsResponse > 0 ? needsResponse : undefined,
    },
    { id: "holds", label: "Holds and reserves", href: hqHref("moneyHolds") },
    { id: "duna-pay", label: "Duna Pay setup", href: hqHref("moneyDunaPay") },
    { id: "tax", label: "Tax", href: hqHref("moneyTax") },
  ];
  return <MoneySubNav current={current} items={items} />;
}

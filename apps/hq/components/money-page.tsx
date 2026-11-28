import { log } from "@duna/observability";
import Link from "next/link";
import type { ReactNode } from "react";
import { MoneyWorkspace, type MoneyView } from "@/components/money-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { orAccessDenied } from "@/lib/access";
import { getServerCaller } from "@/lib/api";

const moneyNavigation: readonly {
  view: MoneyView;
  href: string;
  label: string;
  description: string;
  tone: string;
}[] = [
  {
    view: "balance",
    href: "/money",
    label: "Balance",
    description: "Balances, earnings, and activity",
    tone: "aqua",
  },
  {
    view: "transactions",
    href: "/money/transactions",
    label: "Transactions",
    description: "Search payments and follow every event",
    tone: "violet",
  },
  {
    view: "disputes",
    href: "/money/disputes",
    label: "Disputes",
    description: "Review and respond in Stripe",
    tone: "coral",
  },
  {
    view: "payout-settings",
    href: "/money/payouts",
    label: "Payout Settings",
    description: "Schedule, minimums, and bank descriptors",
    tone: "gold",
  },
  {
    view: "refund-policies",
    href: "/money/refund-policies",
    label: "Refund Policies",
    description: "One default and clear purchase rules",
    tone: "green",
  },
];

const pageCopy: Record<MoneyView, { title: string; description: string }> = {
  balance: {
    title: "Balance",
    description: "Available funds, pending payments and payouts.",
  },
  transactions: {
    title: "Transactions",
    description: "Payments, fees, refunds and payment history.",
  },
  disputes: {
    title: "Disputes",
    description: "Review cases and respond in Stripe.",
  },
  "payout-settings": {
    title: "Payout settings",
    description:
      "Set a simple weekly or monthly rhythm, a minimum amount, and recognizable statement labels.",
  },
  "refund-policies": {
    title: "Refund policies",
    description:
      "Create clear policies, protect cancellable funds, and keep exactly one default for new purchases.",
  },
};

export async function MoneyPageContent({
  view,
  stripe,
  children,
}: {
  readonly view: MoneyView;
  readonly stripe?: string;
  readonly children?: ReactNode;
}) {
  const caller = await getServerCaller();
  if (stripe === "return") {
    try {
      await caller.operator.refreshStripeOnboarding({
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      log.warn("hq.money.onboardingRefreshFailed", { error });
    }
  }
  const loaded = await orAccessDenied("Money", () =>
    Promise.all([
      caller.operator.dashboard(),
      caller.operator.moneyWorkspace(),
    ]),
  );
  if ("denied" in loaded) return loaded.denied;
  const [dashboard, money] = loaded.value;
  const copy = pageCopy[view];
  return (
    <OperatorShell
      active="money"
      messageDraftCount={0}
      organization={dashboard.organization}
    >
      <main className="hq-page module-page">
        <header className="hq-page-heading money-page-heading">
          <div>
            <span className="hq-eyebrow">Money</span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
        </header>
        <nav aria-label="Money sections" className="money-subnav">
          {moneyNavigation.map((item) => {
            return (
              <Link
                aria-current={item.view === view ? "page" : undefined}
                className={item.view === view ? "active" : ""}
                data-tone={item.tone}
                href={item.href}
                key={item.href}
              >
                <span>
                  <strong>{item.label}</strong>
                </span>
              </Link>
            );
          })}
        </nav>
        {children ?? (
          <MoneyWorkspace
            money={money}
            organizationName={dashboard.organization.name}
            view={view}
          />
        )}
      </main>
    </OperatorShell>
  );
}

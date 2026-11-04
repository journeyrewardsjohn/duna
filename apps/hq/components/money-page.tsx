import Link from "next/link";
import type { ReactNode } from "react";
import { MoneyWorkspace, type MoneyView } from "@/components/money-workspace";
import { OperatorShell } from "@/components/operator-shell";
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
    href: "/payments",
    label: "Balance",
    description: "Balances, earnings, and activity",
    tone: "aqua",
  },
  {
    view: "transactions",
    href: "/payments/transactions",
    label: "Transactions",
    description: "Search payments and follow every event",
    tone: "violet",
  },
  {
    view: "disputes",
    href: "/payments/disputes",
    label: "Disputes",
    description: "Review and respond in Stripe",
    tone: "coral",
  },
  {
    view: "payout-settings",
    href: "/payments/payout-settings",
    label: "Payout Settings",
    description: "Schedule, minimums, and bank descriptors",
    tone: "gold",
  },
  {
    view: "refund-policies",
    href: "/payments/refund-policies",
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
      console.error("Stripe onboarding status refresh failed.", error);
    }
  }
  const [dashboard, money] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.moneyWorkspace(),
  ]);
  const copy = pageCopy[view];
  return (
    <OperatorShell
      active="payments"
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

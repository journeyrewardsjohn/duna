import {
  ArrowRight,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { MoneyWorkspace, type MoneyView } from "@/components/money-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

const moneyNavigation: readonly {
  view: MoneyView;
  href: string;
  label: string;
  description: string;
  icon: typeof WalletCards;
}[] = [
  {
    view: "balance",
    href: "/payments",
    label: "Balance",
    description: "Balances, earnings, and activity",
    icon: WalletCards,
  },
  {
    view: "disputes",
    href: "/payments/disputes",
    label: "Disputes",
    description: "Review and respond in Stripe",
    icon: Scale,
  },
  {
    view: "payout-settings",
    href: "/payments/payout-settings",
    label: "Payout Settings",
    description: "Schedule, minimum, and descriptors",
    icon: SlidersHorizontal,
  },
  {
    view: "refund-policies",
    href: "/payments/refund-policies",
    label: "Refund Policies",
    description: "One default and clear purchase rules",
    icon: ShieldCheck,
  },
];

const pageCopy: Record<MoneyView, { title: string; description: string }> = {
  balance: {
    title: "Know where every dollar is.",
    description:
      "See Duna eligibility beside Stripe’s available, pending, payout, and activity truth.",
  },
  disputes: {
    title: "Handle disputes before the deadline.",
    description:
      "Review connected-account cases here, then open the secure Stripe workflow with context intact.",
  },
  "payout-settings": {
    title: "Choose when money reaches your bank.",
    description:
      "Set a simple weekly or monthly rhythm, a minimum amount, and recognizable statement labels.",
  },
  "refund-policies": {
    title: "Make refund rules easy to choose.",
    description:
      "Create clear policies, protect cancellable funds, and keep exactly one default for new purchases.",
  },
};

export async function MoneyPageContent({
  view,
  stripe,
}: {
  readonly view: MoneyView;
  readonly stripe?: string;
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
            const Icon = item.icon;
            return (
              <Link
                aria-current={item.view === view ? "page" : undefined}
                className={item.view === view ? "active" : ""}
                href={item.href}
                key={item.view}
              >
                <Icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>
        <section className="module-context-strip">
          <span>
            <strong>{dashboard.organization.name}</strong>
            <small>
              {dashboard.organization.plan} · {dashboard.organization.timezone}
            </small>
          </span>
          <Link href="/">
            Overview <ArrowRight size={15} />
          </Link>
        </section>
        <MoneyWorkspace
          money={money}
          organizationName={dashboard.organization.name}
          view={view}
        />
      </main>
    </OperatorShell>
  );
}

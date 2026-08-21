import { ArrowRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { MoneyWorkspace } from "@/components/money-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Money" };

export default async function MoneyPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
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
  return (
    <OperatorShell
      active="payments"
      messageDraftCount={0}
      organization={dashboard.organization}
    >
      <main className="hq-page module-page">
        <header className="hq-page-heading">
          <div>
            <span className="hq-eyebrow">Money</span>
            <h1>Earned here. Ready when you are.</h1>
            <p>
              Your balance, refund-protected funds, bank payouts, transaction
              fees, disputes, and connected Stripe account in one place.
            </p>
          </div>
          <Link className="hq-button hq-button--primary" href="/payments/setup">
            <Settings2 size={17} /> Money setup
          </Link>
        </header>
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
        />
      </main>
    </OperatorShell>
  );
}

import { OperatorShell } from "@/components/operator-shell";
import { PromoCodeWorkspaceView } from "@/components/promo-code-workspace";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Promo codes" };

export default async function PromoCodesPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.promoCodeWorkspace(),
  ]);
  return (
    <OperatorShell
      active="promo-codes"
      messageDraftCount={0}
      organization={dashboard.organization}
    >
      <main className="hq-page module-page">
        <header className="hq-page-heading">
          <div>
            <span className="hq-eyebrow">Grow · Promo codes</span>
            <h1>A better reason to join now.</h1>
            <p>
              Shape a targeted offer, keep every eligibility rule explicit, and
              see the revenue and discount it creates.
            </p>
          </div>
        </header>
        <PromoCodeWorkspaceView workspace={workspace} />
      </main>
    </OperatorShell>
  );
}

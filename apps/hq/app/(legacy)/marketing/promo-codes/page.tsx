import { OperatorShell } from "@/components/operator-shell";
import { PromoCodeWorkspaceView } from "@/components/promo-code-workspace";
import { PaneErrorBoundary } from "@/components/observability/pane-error-boundary";
import { orAccessDenied } from "@/lib/access";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Promo codes" };

export default async function PromoCodesPage() {
  const caller = await getServerCaller();
  const loaded = await orAccessDenied("Promo codes", () =>
    Promise.all([
      caller.operator.dashboard(),
      caller.operator.promoCodeWorkspace(),
    ]),
  );
  if ("denied" in loaded) return loaded.denied;
  const [dashboard, workspace] = loaded.value;
  return (
    <OperatorShell
      active="marketing"
      messageDraftCount={0}
      organization={dashboard.organization}
    >
      <main className="hq-page module-page promo-page">
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
        <PaneErrorBoundary label="Promo codes" name="hq.promoCodes.workspace">
          <PromoCodeWorkspaceView workspace={workspace} />
        </PaneErrorBoundary>
      </main>
    </OperatorShell>
  );
}

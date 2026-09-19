import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ThemeKitEditor } from "@/components/commerce-controls";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Theme Kit + Brand Knowledge",
};

export default async function ThemeKitPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);

  return (
    <OperatorShell
      active="settings"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page operator-create-page theme-kit-page">
        <header className="hq-page-heading operator-create-page__heading">
          <Link
            aria-label="Back to settings"
            className="operator-create-page__back"
            href="/settings?section=brand"
          >
            <ArrowLeft aria-hidden size={18} />
          </Link>
          <div className="operator-create-page__copy">
            <span className="hq-eyebrow">Brand & storefront</span>
            <h1>Theme Kit</h1>
            <p>
              Give every player-facing surface one clear identity, then teach
              Duna AI only the business knowledge you approve.
            </p>
          </div>
        </header>
        <section className="operator-control-surface">
          <ThemeKitEditor workspace={workspace} />
        </section>
      </main>
    </OperatorShell>
  );
}

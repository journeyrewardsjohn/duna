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
          <div>
            <Link href="/settings">
              <ArrowLeft aria-hidden size={16} /> Back to settings
            </Link>
            <span className="hq-eyebrow">Brand system + AI context</span>
            <h1>Theme Kit.</h1>
            <p>
              Shape every player-facing surface and give Duna AI approved
              knowledge about how your organization works.
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

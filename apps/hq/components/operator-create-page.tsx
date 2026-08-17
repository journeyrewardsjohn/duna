import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";
import type { OperatorModule } from "./navigation";
import { OperatorControls } from "./operator-controls";
import { OperatorShell } from "./operator-shell";

export async function OperatorCreatePage({
  module,
  eyebrow,
  title,
  description,
}: {
  readonly module: OperatorModule;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  const caller = await getServerCaller();
  const [dashboard, workspace, waivers] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    module === "products"
      ? caller.operator.waiverWorkspace()
      : Promise.resolve(undefined),
  ]);
  const moduleLabel = module === "members" ? "people" : module;
  return (
    <OperatorShell
      active={module}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page operator-create-page">
        <header className="hq-page-heading operator-create-page__heading">
          <Link
            aria-label={`Back to ${moduleLabel}`}
            className="operator-create-page__back"
            href={`/${module}`}
            title={`Back to ${moduleLabel}`}
          >
            <ArrowLeft aria-hidden size={20} />
          </Link>
          <div className="operator-create-page__copy">
            <span className="hq-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        <section className="operator-control-surface">
          <OperatorControls
            focusedCreate
            module={module}
            waivers={waivers}
            workspace={workspace}
          />
        </section>
      </main>
    </OperatorShell>
  );
}

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
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active={module}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page operator-create-page">
        <header className="hq-page-heading operator-create-page__heading">
          <div>
            <Link href={`/${module}`}>
              <ArrowLeft aria-hidden size={16} /> Back to{" "}
              {module === "members"
                ? "people"
                : module === "messages"
                  ? "marketing"
                  : module}
            </Link>
            <span className="hq-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        <section className="operator-control-surface">
          <OperatorControls module={module} workspace={workspace} />
        </section>
      </main>
    </OperatorShell>
  );
}

import { PageHeader, buttonClassName } from "@duna/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import { AudienceEditor, type AudienceReference } from "../audience-editor";

export const metadata = { title: "Create audience" };

export default async function CreateAudiencePage() {
  const caller = await getServerCaller();
  const [dashboard, builder, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.audienceBuilder(),
    caller.operator.workspace(),
  ]);
  const references: AudienceReference[] = [
    ...workspace.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      detail: new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
      }).format(new Date(session.startsAt)),
      kind: "event" as const,
    })),
    ...workspace.catalog.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.type.replaceAll("-", " "),
      kind: "product" as const,
    })),
  ];
  return (
    <OperatorShell active="audiences" organization={dashboard.organization}>
      <main className="hq-page module-page audience-page">
        <PageHeader
          actions={
            <Link
              className={buttonClassName({ tone: "secondary" })}
              href="/audiences"
            >
              <ArrowLeft aria-hidden size={17} /> Back to audiences
            </Link>
          }
          description="Choose saved people, live rules, or both. Duna shows the projected audience as you build and saves a reusable, immutable definition."
          eyebrow="Audiences · guided setup"
          title="Create an audience"
        />
        <AudienceEditor people={builder.people} references={references} />
      </main>
    </OperatorShell>
  );
}

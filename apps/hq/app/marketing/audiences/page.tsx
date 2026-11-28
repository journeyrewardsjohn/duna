import { PageHeader, buttonClassName } from "@duna/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import { AudienceOverview } from "./audience-overview";

export const metadata = { title: "Audiences" };

export default async function AudiencesPage() {
  const caller = await getServerCaller();
  const [dashboard, audiences, builder] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.audiences(),
    caller.operator.audienceBuilder(),
  ]);
  return (
    <OperatorShell active="audiences" organization={dashboard.organization}>
      <main className="hq-page module-page audience-page">
        <PageHeader
          actions={
            <Link
              className={buttonClassName({ size: "large" })}
              href="/audiences/create"
            >
              <Plus aria-hidden size={18} /> Create audience
            </Link>
          }
          description="Build reusable groups from live activity, family relationships, payments, memberships, and hand-picked people—then use the same audience everywhere in Duna."
          eyebrow="People · reusable groups"
          title="Audiences"
        />
        <AudienceOverview
          audiences={audiences}
          candidateCount={builder.candidateCount}
        />
      </main>
    </OperatorShell>
  );
}

import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import { AudienceEditor } from "../audience-editor";

export const metadata = { title: "Create audience" };

export default async function CreateAudiencePage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell active="audiences" organization={dashboard.organization}>
      <main className="hq-page module-page">
        <header className="hq-page-heading">
          <div>
            <span className="hq-eyebrow">Audiences · guided setup</span>
            <h1>Start with the people.</h1>
            <p>
              Choose a saved roster, a rule, or both. Every save creates an
              immutable revision for future drafts.
            </p>
          </div>
        </header>
        <AudienceEditor
          people={[
            ...new Map(
              workspace.participants
                .filter((person) => person.status === "active")
                .map((person) => [
                  person.personId,
                  {
                    id: person.personId,
                    displayName: person.displayName,
                    initials: person.displayName
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase(),
                  },
                ]),
            ).values(),
          ]}
        />
        <Link className="button" href="/audiences">
          Back to audiences
        </Link>
      </main>
    </OperatorShell>
  );
}

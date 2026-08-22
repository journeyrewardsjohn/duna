import { notFound } from "next/navigation";
import { Badge } from "@duna/ui";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import { AudienceEditor } from "../audience-editor";
import { ArchiveAudience } from "./archive-audience";

export default async function AudienceDetailPage({
  params,
}: {
  readonly params: Promise<{ audienceId: string }>;
}) {
  const { audienceId } = await params;
  const caller = await getServerCaller();
  try {
    const [dashboard, audience, workspace] = await Promise.all([
      caller.operator.dashboard(),
      caller.operator.audienceDetail({ audienceId }),
      caller.operator.workspace(),
    ]);
    const people = [
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
    ];
    return (
      <OperatorShell active="audiences" organization={dashboard.organization}>
        <main className="hq-page module-page">
          <header className="hq-page-heading">
            <div>
              <span className="hq-eyebrow">
                {audience.mode} · current revision {audience.revision}
              </span>
              <h1>{audience.name}</h1>
              <p>
                {audience.estimatedSize} people in the current projection. A
                save creates a successor; prior revisions remain evidence.
                {audience.unavailableFactKeys.length > 0 &&
                  ` This projection is partial because ${audience.unavailableFactKeys.join(", ")} is not available yet.`}
              </p>
            </div>
          </header>
          <section className="module-context-strip">
            <span>
              <strong>{audience.status}</strong>
              <small>audience lifecycle</small>
            </span>
            <span>
              <strong>{audience.estimatedSize}</strong>
              <small>projected inclusions</small>
            </span>
            <span>
              <Badge
                tone={
                  audience.projectionStatus === "complete"
                    ? "positive"
                    : "warning"
                }
              >
                {audience.projectionStatus}
              </Badge>
              <small>projection confidence</small>
            </span>
            <span>
              <strong>r{audience.revision}</strong>
              <small>immutable revision</small>
            </span>
          </section>
          <section className="module-card">
            <h2>Revision history</h2>
            <ol>
              {audience.history.map((version) => (
                <li key={version.revision}>
                  Revision {version.revision} ·{" "}
                  {new Date(version.createdAt).toLocaleString()}{" "}
                  {version.current ? "· Current" : ""}
                </li>
              ))}
            </ol>
          </section>
          {audience.status === "active" && (
            <AudienceEditor
              audienceId={audience.id}
              initialExcludePersonIds={audience.excludePersonIds}
              initialIncludePersonIds={audience.includePersonIds}
              initialMode={audience.mode}
              initialName={audience.name}
              initialRuleAst={audience.ruleAst}
              people={people}
            />
          )}{" "}
          {audience.status === "active" && (
            <ArchiveAudience audienceId={audience.id} />
          )}
        </main>
      </OperatorShell>
    );
  } catch {
    notFound();
  }
}

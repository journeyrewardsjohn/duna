import { notFound } from "next/navigation";
import { Badge, PageHeader, buttonClassName } from "@duna/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
    const [dashboard, audience, builder, workspace] = await Promise.all([
      caller.operator.dashboard(),
      caller.operator.audienceDetail({ audienceId }),
      caller.operator.audienceBuilder(),
      caller.operator.workspace(),
    ]);
    const references = [
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
            description={
              <>
                {audience.estimatedSize} people in the current projection. A
                save creates a successor; prior revisions remain evidence.
                {audience.unavailableFactKeys.length > 0 &&
                  ` This projection is partial because ${audience.unavailableFactKeys.join(", ")} is not available yet.`}
              </>
            }
            eyebrow={`${audience.mode} · current revision ${audience.revision}`}
            title={audience.name}
          />
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
          <section className="audience-detail-card">
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
              people={builder.people}
              references={references}
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

import { Plus, UsersRound } from "lucide-react";
import { Badge } from "@duna/ui";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Audiences" };

export default async function AudiencesPage() {
  const caller = await getServerCaller();
  const [dashboard, audiences] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.audiences(),
  ]);
  return (
    <OperatorShell active="audiences" organization={dashboard.organization}>
      <main className="hq-page module-page">
        <header className="hq-page-heading">
          <div>
            <span className="hq-eyebrow">People · reusable groups</span>
            <h1>Audiences</h1>
            <p>
              Save the people you reach often. Duna keeps each revision and
              shows the latest projected size and whether every rule fact was
              available.
            </p>
          </div>
          <Link className="button button--primary" href="/audiences/create">
            <Plus size={17} /> Create audience
          </Link>
        </header>
        <section className="module-context-strip">
          <span>
            <strong>
              {audiences.reduce(
                (total, audience) => total + audience.estimatedSize,
                0,
              )}
            </strong>
            <small>people across saved audiences</small>
          </span>
          <span>
            <strong>{audiences.length}</strong>
            <small>audiences</small>
          </span>
        </section>
        <div className="module-grid">
          {audiences.map((audience) => (
            <Link
              className="module-card"
              href={`/audiences/${audience.id}`}
              key={audience.id}
            >
              <UsersRound aria-hidden size={20} />
              <span className="hq-eyebrow">
                {audience.mode} · revision {audience.revision} ·{" "}
                <Badge
                  tone={
                    audience.projectionStatus === "complete"
                      ? "positive"
                      : "warning"
                  }
                >
                  {audience.projectionStatus}
                </Badge>
              </span>
              <h2>{audience.name}</h2>
              <p>
                <strong>{audience.estimatedSize}</strong> people ·{" "}
                {audience.status}
              </p>
              {audience.unavailableFactKeys.length > 0 && (
                <small>
                  Awaiting: {audience.unavailableFactKeys.join(", ")}
                </small>
              )}
              <div
                aria-label={`${audience.members.length} member previews`}
                className="audience-avatars"
              >
                {audience.members.slice(0, 3).map((member) => (
                  <i key={member.id} title={member.displayName}>
                    {member.initials}
                  </i>
                ))}
                {audience.estimatedSize > 3 && (
                  <i>+{audience.estimatedSize - 3}</i>
                )}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </OperatorShell>
  );
}

import { hqHref } from "@duna/core/hq-routes";
import { Chip, PartialData } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { settle } from "@/components/team/team-data";
import {
  coverageReasonWords,
  coverageStatusCopy,
  firstName,
} from "@/components/team/team-model";
import {
  MemberScreen,
  memberPage,
  TeamBlockState,
} from "@/components/team/team-screen";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = { title: "Sessions" };

function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * A team member › Sessions: how many they ran and have coming up, and every
 * session where cover was needed for them or they covered for someone.
 */
export default async function TeamMemberSessionsPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await memberPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { member, context } = page;
  const first = firstName(member.displayName);
  const caller = await getServerCaller();
  const coverage = await settle(
    () => caller.operator.teamAvailability.coverageRequests({}),
    "memberCoverage",
  );
  const mine =
    coverage.state === "ok"
      ? coverage.data.requests.filter(
          (request) =>
            request.originalStaff?.staffProfileId === member.id ||
            request.coveredBy?.staffProfileId === member.id,
        )
      : [];
  return (
    <MemberScreen
      askStarters={[`Who covered ${first}'s sessions this month?`]}
      page={page}
      tab="sessions"
    >
      <dl aria-label={`${first}'s sessions`} className="team-figures">
        <div className="team-figure">
          <dt>Ran in the last 30 days</dt>
          <dd className="team-num">{member.sessionsRun30d}</dd>
        </div>
        <div className="team-figure">
          <dt>Coming up</dt>
          <dd className="team-num">{member.upcomingSessions}</dd>
        </div>
      </dl>
      <PartialData missing={[`the list of each session ${first} runs`]} />
      <PageSection flush id="member-cover" title="Cover">
        {coverage.state !== "ok" ? (
          <TeamBlockState
            loaded={coverage}
            organization={context.organization}
            what="cover for these sessions"
          />
        ) : mine.length === 0 ? (
          <p className="team-quiet">{`No session has needed cover for ${first}, and ${first} hasn't covered one.`}</p>
        ) : (
          <ul aria-label="Cover" className="team-list">
            {mine.map((request) => {
              const status = coverageStatusCopy(request.status);
              const coveredFor =
                request.coveredBy?.staffProfileId === member.id;
              return (
                <li className="team-schedule" key={request.id}>
                  <div className="team-row__who">
                    <span className="team-row__name">{request.title}</span>
                    <span className="team-quiet">
                      {when(request.startsAt, context.timeZone)}
                    </span>
                    <span className="team-quiet">
                      {coveredFor
                        ? `${first} covered${request.originalStaff ? ` for ${request.originalStaff.displayName}` : ""}`
                        : coverageReasonWords(request.reason, first)}
                    </span>
                  </div>
                  <Chip tone={status.tone}>{status.label}</Chip>
                  {request.status === "open" || request.status === "asking" ? (
                    <Link className="team-link" href={hqHref("teamCoverage")}>
                      Arrange cover
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>
    </MemberScreen>
  );
}

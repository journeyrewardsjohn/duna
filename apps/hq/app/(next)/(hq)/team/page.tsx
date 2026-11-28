import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { PageSection } from "@/components/shell/page-header";
import { Roster, type RosterRow } from "@/components/team/roster";
import {
  loadRosterAvailability,
  loadTeamWorkspace,
  teamContext,
} from "@/components/team/team-data";
import {
  classificationLabel,
  missingForMember,
} from "@/components/team/team-model";
import { TeamBlockState, TeamScreen } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Team" };

/**
 * Team › Members (TM-List): every coach, manager and front-desk member
 * with what they do, how busy they are, when they are free (the shared
 * availability rule, in words), their state and what is missing; pending
 * invitations; "Invite someone".
 */
export default async function TeamPage() {
  const context = await teamContext();
  const workspace = await loadTeamWorkspace();
  const staff = workspace.state === "ok" ? workspace.data.staff : [];
  const glances =
    context.canSeeTeam && staff.length > 0
      ? await loadRosterAvailability(staff, context)
      : {};
  const rows: RosterRow[] = staff.map((member) => {
    const glance = glances[member.id];
    return {
      staffProfileId: member.id,
      personId: member.personId,
      displayName: member.displayName,
      ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
      role: member.role,
      isOwner: member.isOwner,
      isSelf: member.personId === context.personId,
      state: member.active ? "active" : "paused",
      classification: classificationLabel(member.workerClassification),
      sessionsRun30d: member.sessionsRun30d,
      upcomingSessions: member.upcomingSessions,
      ...(glance?.summary ? { availability: glance.summary } : {}),
      needsCover: glance?.needsCover ?? 0,
      timeOffAsked: glance?.timeOffAsked ?? 0,
      missing: missingForMember(
        member,
        glance?.loaded ? { hasSchedule: glance.hasSchedule } : undefined,
      ),
      ...(member.email || member.phoneE164
        ? { contact: member.email ?? member.phoneE164 }
        : {}),
    };
  });
  const coaches = staff.filter((member) => member.role === "coach").length;
  const needCover = rows.reduce((sum, row) => sum + row.needsCover, 0);
  return (
    <TeamScreen
      actions={
        context.canManage ? (
          <Button href={hqHref("teamInvite")} variant="primary">
            Invite someone
          </Button>
        ) : undefined
      }
      askLabel="Team"
      askStarters={[
        "Who is free Thursday at 6?",
        "Which sessions need a coach this week?",
        "Who hasn't set their availability yet?",
      ]}
      description={`Who coaches and works at ${context.organization}: roles, hours and pay.`}
      tab="members"
      title="Team"
    >
      {workspace.state === "ok" && staff.length > 0 ? (
        <dl aria-label="The team at a glance" className="team-figures">
          <div className="team-figure">
            <dt>On the team</dt>
            <dd className="team-num">{staff.length}</dd>
          </div>
          <div className="team-figure">
            <dt>Coaches</dt>
            <dd className="team-num">{coaches}</dd>
          </div>
          <div className="team-figure">
            <dt>Sessions, last 30 days</dt>
            <dd className="team-num">
              {staff.reduce((sum, member) => sum + member.sessionsRun30d, 0)}
            </dd>
          </div>
          <div className="team-figure">
            <dt>Sessions needing cover</dt>
            <dd className="team-num">{needCover}</dd>
          </div>
        </dl>
      ) : null}
      <PageSection flush id="team-members" title="Members">
        {workspace.state !== "ok" ? (
          <TeamBlockState
            loaded={workspace}
            organization={context.organization}
            what="the team"
          />
        ) : (
          <Roster
            canManage={context.canManage}
            invitations={workspace.data.invitations}
            rows={rows}
            timeZone={context.timeZone}
          />
        )}
      </PageSection>
      {workspace.state === "ok" && workspace.data.demo ? (
        <p className="team-quiet">
          Demo club: the team shown is Duna&apos;s demo coaches.
        </p>
      ) : null}
    </TeamScreen>
  );
}

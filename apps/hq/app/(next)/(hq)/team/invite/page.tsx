import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { PageSection } from "@/components/shell/page-header";
import { InviteForm } from "@/components/team/invite-form";
import { loadTeamWorkspace, teamContext } from "@/components/team/team-data";
import { TeamBlockState, TeamScreen } from "@/components/team/team-screen";
import { AccessDeniedState } from "@/lib/access-state";

export const metadata: Metadata = { title: "Invite someone" };

/**
 * Team › Invite someone (TM-Add, CO-6): one short form and a review before
 * anything is sent. Managers, directors and the owner invite; everyone else
 * sees who can.
 */
export default async function InviteTeamMemberPage() {
  const context = await teamContext();
  const workspace = await loadTeamWorkspace();
  return (
    <TeamScreen
      askLabel="Invite someone to the team"
      askStarters={[
        "Invite a coach who will run junior clinics",
        "What's the difference between a manager and a director?",
      ]}
      crumb="Invite someone"
      description="They get a link to join. You check everything before it's sent."
      parentHref={hqHref("team")}
      tab="members"
      title="Invite someone"
    >
      <PageSection id="team-invite" title="Who are you inviting?">
        {!context.canManage ? (
          <AccessDeniedState
            area="Inviting people to the team"
            compact
            grantedBy={`an owner or manager of ${context.organization}`}
          />
        ) : workspace.state !== "ok" ? (
          <TeamBlockState
            loaded={workspace}
            organization={context.organization}
            what="the team"
          />
        ) : (
          <InviteForm
            canInviteDirector={workspace.data.canInviteDirector}
            organization={context.organization}
          />
        )}
      </PageSection>
    </TeamScreen>
  );
}

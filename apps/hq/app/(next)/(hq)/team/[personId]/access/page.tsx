import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { MemberAccess } from "@/components/team/member-access";
import { loadTeamWorkspace, roleScopes } from "@/components/team/team-data";
import { firstName, staffRoles } from "@/components/team/team-model";
import { MemberScreen, memberPage } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Access" };

/**
 * A team member › Access: their role in plain words, exactly what it lets
 * them see and do, the permission list behind a disclosure, and (for a
 * director) handing them the club.
 */
export default async function TeamMemberAccessPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await memberPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { member, context, isSelf } = page;
  const workspace = await loadTeamWorkspace();
  const team = workspace.state === "ok" ? workspace.data : undefined;
  const first = firstName(member.displayName);
  return (
    <MemberScreen
      askStarters={[
        `What can ${first} see in Duna HQ?`,
        "What's the difference between a manager and a director?",
      ]}
      page={page}
      tab="access"
    >
      <PageSection
        id="member-access"
        title={isSelf ? "What you can do" : `What ${first} can do`}
      >
        <MemberAccess
          active={member.active}
          canChange={context.canManage && !isSelf}
          canInviteDirector={team?.canInviteDirector ?? false}
          canTransferOwnership={team?.canTransferOwnership ?? false}
          displayName={member.displayName}
          isOwner={member.isOwner}
          personId={member.personId}
          presets={staffRoles.map((role) => ({
            role,
            scopes: roleScopes(role),
          }))}
          role={member.role}
        />
      </PageSection>
    </MemberScreen>
  );
}

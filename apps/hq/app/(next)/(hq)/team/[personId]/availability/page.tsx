import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvailabilityEditor } from "@/components/team/availability-editor";
import { loadAvailability } from "@/components/team/team-data";
import { firstName } from "@/components/team/team-model";
import {
  MemberScreen,
  memberPage,
  TeamBlockState,
} from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Availability" };

/**
 * A team member › Availability (TM-Availability, CH-1): schedules, the
 * weekly grid, time away, and the shared rule's verdict in words. The member
 * edits their own; managers edit anyone's and decide time off.
 */
export default async function TeamMemberAvailabilityPage({
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
  const availability = await loadAvailability(member.id);
  const first = firstName(member.displayName);
  const isOwnerViewer = context.session.roles.includes("owner");
  return (
    <MemberScreen
      askStarters={[
        `Is ${first} free Thursday at 6?`,
        `What does ${first}'s time off uncover?`,
      ]}
      page={page}
      tab="availability"
    >
      {availability.state !== "ok" ? (
        <TeamBlockState
          loaded={availability}
          organization={context.organization}
          what={`${first}'s availability`}
        />
      ) : (
        <AvailabilityEditor
          canDecide={context.canManage && (!isSelf || isOwnerViewer)}
          canEdit={isSelf || context.canManage}
          displayName={member.displayName}
          initial={availability.data}
          isSelf={isSelf}
          now={context.now}
          staffProfileId={member.id}
          timeZone={context.timeZone}
        />
      )}
    </MemberScreen>
  );
}

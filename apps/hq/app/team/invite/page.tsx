import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Invite a team member" };

export default function InviteTeamMemberPage() {
  return (
    <OperatorCreatePage
      description="Set their role and worker classification. They claim their own identity and complete their address, availability, compensation goals, and calendar preferences."
      eyebrow="Team · focused workspace"
      module="team"
      title="Invite the right teammate."
    />
  );
}

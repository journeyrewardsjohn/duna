import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Invite a person" };

export default function InvitePersonPage() {
  return (
    <OperatorCreatePage
      description="Invite a player, member, parent, coach, or operator without taking ownership of their identity."
      eyebrow="People · focused workspace"
      module="members"
      title="Invite the right person, safely."
    />
  );
}

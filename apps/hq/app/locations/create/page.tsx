import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Add a venue" };

export default function CreateLocationPage() {
  return (
    <OperatorCreatePage
      description="Connect the place first, then add courts, bookable hours, rates, and the public venue story."
      eyebrow="Venues · focused workspace"
      module="locations"
      title="Bring a venue into Duna."
    />
  );
}

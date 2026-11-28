import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Create marketing" };

export default function CreateMarketingPage() {
  return (
    <OperatorCreatePage
      description="Select an audience, choose the reason, and let Duna route each consented message through the right channel."
      eyebrow="Marketing · focused workspace"
      module="marketing"
      title="Start with the audience."
    />
  );
}

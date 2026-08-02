import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Configure money" };

export default function ConfigureMoneyPage() {
  return (
    <OperatorCreatePage
      description="Connect payouts, taxes, booking rates, and accepted payment methods before publishing anything paid."
      eyebrow="Money · focused workspace"
      module="payments"
      title="Configure money once."
    />
  );
}

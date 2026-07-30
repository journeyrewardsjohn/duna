import { OperatorOverview } from "@/components/operator-overview";
import { OperatorShell } from "@/components/operator-shell";

export default function HqPage() {
  return (
    <OperatorShell active="overview">
      <OperatorOverview />
    </OperatorShell>
  );
}

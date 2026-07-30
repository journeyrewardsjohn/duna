import { AdminOverview } from "@/components/admin-panels";
import { AdminShell } from "@/components/admin-shell";

export default function AdminPage() {
  return (
    <AdminShell active="overview">
      <AdminOverview />
    </AdminShell>
  );
}

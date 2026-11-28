import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminOverview } from "@/components/admin-panels";
import { AdminShell } from "@/components/admin-shell";
import { getServerCaller } from "@/lib/api";

export default async function AdminPage() {
  const caller = await getServerCaller();
  const result = await Promise.all([
    caller.admin.overview(),
    caller.admin.organizations(),
  ])
    .then(([overview, organizations]) => ({ overview, organizations }))
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "Platform administration access required"
      ) {
        return undefined;
      }
      throw error;
    });
  if (!result) return <AdminAccessDenied />;
  return (
    <AdminShell active="overview">
      <AdminOverview
        organizations={result.organizations}
        overview={result.overview}
      />
    </AdminShell>
  );
}

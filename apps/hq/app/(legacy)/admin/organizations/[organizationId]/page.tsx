import { notFound } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminOrganizationDetailView } from "@/components/admin-panels";
import { AdminShell } from "@/components/admin-shell";
import { getServerCaller } from "@/lib/api";

export default async function AdminOrganizationPage({
  params,
}: {
  readonly params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const caller = await getServerCaller();
  const detail = await caller.admin
    .organization({ organizationId })
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "Platform administration access required"
      ) {
        return "access-denied" as const;
      }
      throw error;
    });

  if (detail === "access-denied") return <AdminAccessDenied />;
  if (!detail) notFound();

  return (
    <AdminShell active="organizations">
      <AdminOrganizationDetailView detail={detail} />
    </AdminShell>
  );
}

import { switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { canAccessWorkspace } from "@/lib/workspace-options";

function returnTo(result: string | undefined): string {
  return result === "refresh"
    ? "/payments?stripe=refresh"
    : "/payments?stripe=return";
}

export default async function StripeOrganizationReturnPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    organizationId?: string;
    result?: string;
  }>;
}) {
  const { organizationId, result } = await searchParams;
  const destination = returnTo(result);
  const { user } = await withAuth();
  if (!user) {
    const recoveryPath = `/stripe/return?organizationId=${encodeURIComponent(organizationId ?? "")}&result=${encodeURIComponent(result ?? "return")}`;
    redirect(`/sign-in?returnTo=${encodeURIComponent(recoveryPath)}`);
  }
  if (!organizationId || !(await canAccessWorkspace(organizationId))) {
    redirect("/onboarding?error=workspace");
  }

  await switchToOrganization(organizationId, { returnTo: destination });
}

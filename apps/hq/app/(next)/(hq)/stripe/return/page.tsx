import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { hqHref } from "@duna/core/hq-routes";
import { switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { canAccessWorkspace } from "@/lib/workspace-options";

/** Back from verification (or its refresh link): Duna Pay setup, in the right club. */
function returnTo(result: string | undefined): string {
  return `${hqHref("moneyDunaPay")}?stripe=${result === "refresh" ? "refresh" : "return"}`;
}

/**
 * The Duna Pay return and refresh address (never renamed: the payment
 * partner stores it). It renders nothing: it switches to the club the
 * verification was for and lands on Duna Pay setup, which reads the latest
 * status. Without sign-in (demo, local development) it goes straight there.
 */
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
  if (!isWorkOSAuthKitConfigured()) redirect(destination);
  const { user } = await withAuth();
  if (!user) {
    const recoveryPath = `${hqHref("stripeReturn")}?organizationId=${encodeURIComponent(organizationId ?? "")}&result=${encodeURIComponent(result ?? "return")}`;
    redirect(`/sign-in?returnTo=${encodeURIComponent(recoveryPath)}`);
  }
  if (!organizationId || !(await canAccessWorkspace(organizationId))) {
    redirect("/setup/start?error=workspace");
  }
  await switchToOrganization(organizationId, { returnTo: destination });
}

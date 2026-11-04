import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller, getServerContext } from "@/lib/api";
import { WebsiteStudio } from "./website-studio";
export const metadata = { title: "Website" };
export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const [caller, context, query] = await Promise.all([
    getServerCaller(),
    getServerContext(),
    searchParams,
  ]);
  const dashboard = await caller.operator.dashboard();
  return (
    <OperatorShell active="website" organization={dashboard.organization}>
      <WebsiteStudio
        clubName={dashboard.organization.name}
        initialSiteId={query.site}
        demo={Boolean(context.actor?.isDemo)}
        canManageBilling={Boolean(
          context.actor?.roles.some(
            (role) => role === "owner" || role === "super-admin",
          ),
        )}
      />
    </OperatorShell>
  );
}

import { notFound } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminPanel } from "@/components/admin-panels";
import { adminModules, type AdminModule } from "@/components/navigation";
import { AdminShell } from "@/components/admin-shell";
import type { ProfessionalTourTool } from "@/components/pro-tour-admin-controls";
import { getServerCaller } from "@/lib/api";

const professionalTourTools = new Set<ProfessionalTourTool>([
  "overview",
  "events",
  "editorial",
  "research",
  "schedule",
  "broadcasts",
  "rosters",
  "mappings",
  "sources",
]);

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = adminModules.find((entry) => entry.slug === module);
  return { title: item?.label ?? "Admin" };
}

export default async function AdminModulePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ module: string }>;
  readonly searchParams: Promise<{
    q?: string;
    tool?: string;
    event?: string;
  }>;
}) {
  const { module } = await params;
  const { event, q, tool } = await searchParams;
  const proTourTool = professionalTourTools.has(tool as ProfessionalTourTool)
    ? (tool as ProfessionalTourTool)
    : undefined;
  const item = adminModules.find((entry) => entry.slug === module);
  if (!item || module === "overview") notFound();
  const caller = await getServerCaller();
  const needsSandData = [
    "sand-data",
    "pro-tour",
    "player-mapping",
    "ratings-lab",
    "profile-merge",
  ].includes(module);
  const result = await Promise.all([
    caller.admin.overview(),
    caller.admin.organizations(),
    module === "trust" ? caller.admin.guardianships() : Promise.resolve([]),
    module === "flags"
      ? caller.admin.featureFlags()
      : Promise.resolve({ flags: [], canManage: false }),
    needsSandData ? caller.admin.sandData() : Promise.resolve(undefined),
    module === "player-mapping" || module === "pro-tour"
      ? caller.admin.players({ query: q, limit: 40 })
      : Promise.resolve([]),
    module === "video"
      ? caller.admin.videoOverview()
      : Promise.resolve(undefined),
  ])
    .then(
      ([
        overview,
        organizations,
        guardianReviews,
        featureFlags,
        sandData,
        players,
        video,
      ]) => ({
        overview,
        organizations,
        guardianReviews,
        featureFlags,
        sandData,
        players,
        video,
      }),
    )
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
    <AdminShell active={module as AdminModule}>
      <AdminPanel
        module={module as AdminModule}
        organizations={result.organizations}
        overview={result.overview}
        guardianReviews={result.guardianReviews}
        featureFlags={result.featureFlags}
        video={result.video}
        sandData={result.sandData}
        playerDirectory={result.players}
        playerSearchQuery={q}
        proEventId={event}
        proTourTool={proTourTool}
      />
    </AdminShell>
  );
}

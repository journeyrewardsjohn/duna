import { notFound, redirect } from "next/navigation";
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
  if (module === "profile-merge") return { title: "Player mapping" };
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
    page?: string;
    gender?: string;
    status?: string;
    player?: string;
    person?: string;
  }>;
}) {
  const { module } = await params;
  if (module === "profile-merge")
    redirect("/admin/player-mapping#profile-merge");
  const {
    event,
    gender: rawGender,
    page: rawPage,
    player: rawPlayer,
    person: rawPerson,
    q,
    status: rawStatus,
    tool,
  } = await searchParams;
  const gender = ["men", "women"].includes(rawGender ?? "")
    ? (rawGender as "men" | "women")
    : undefined;
  const status = [
    "all",
    "not-started",
    "review",
    "published",
    "failed",
  ].includes(rawStatus ?? "all")
    ? (rawStatus as "all" | "not-started" | "review" | "published" | "failed")
    : "all";
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const player =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawPlayer ?? "",
    )
      ? rawPlayer
      : undefined;
  const person =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawPerson ?? "",
    )
      ? rawPerson
      : undefined;
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
  ].includes(module);
  const result = await Promise.all([
    caller.admin.overview(),
    caller.admin.organizations(),
    module === "trust" ? caller.admin.guardianships() : Promise.resolve([]),
    module === "flags"
      ? caller.admin.featureFlags()
      : Promise.resolve({ flags: [], canManage: false }),
    module === "flags"
      ? caller.admin.demoData()
      : Promise.resolve({
          enabled: false,
          recordCount: 0,
          canManage: false,
        }),
    needsSandData ? caller.admin.sandData() : Promise.resolve(undefined),
    module === "player-mapping" || module === "pro-tour"
      ? caller.admin.players({ query: q, limit: 40 })
      : Promise.resolve([]),
    module === "video"
      ? caller.admin.videoOverview()
      : Promise.resolve(undefined),
    module === "vision"
      ? caller.admin.visionOverview()
      : Promise.resolve(undefined),
    module === "people"
      ? caller.admin.people({ query: q, page })
      : Promise.resolve(undefined),
    module === "people" && person
      ? caller.admin.person({ personId: person })
      : Promise.resolve(undefined),
    module === "player-intelligence"
      ? caller.admin.playerIntelligence({
          page,
          pageSize: 25,
          query: q,
          gender,
          status,
        })
      : Promise.resolve(undefined),
    module === "player-intelligence" && player
      ? caller.admin.playerIntelligenceDetail({ personId: player })
      : Promise.resolve(undefined),
    module === "predictions"
      ? caller.admin.predictionMarkets()
      : Promise.resolve(undefined),
  ])
    .then(
      ([
        overview,
        organizations,
        guardianReviews,
        featureFlags,
        demoData,
        sandData,
        players,
        video,
        vision,
        people,
        personProfile,
        playerIntelligence,
        playerIntelligenceDetail,
        predictions,
      ]) => ({
        overview,
        organizations,
        guardianReviews,
        featureFlags,
        demoData,
        sandData,
        players,
        video,
        vision,
        people,
        personProfile,
        playerIntelligence,
        playerIntelligenceDetail,
        predictions,
      }),
    )
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        [
          "Platform administration access required",
          "Super Admin access required",
        ].includes(error.message)
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
        demoData={result.demoData}
        video={result.video}
        vision={result.vision}
        people={result.people}
        personProfile={result.personProfile}
        sandData={result.sandData}
        playerDirectory={result.players}
        playerSearchQuery={q}
        proEventId={event}
        proTourTool={proTourTool}
        playerIntelligence={result.playerIntelligence}
        playerIntelligenceDetail={result.playerIntelligenceDetail}
        playerIntelligenceGender={gender}
        playerIntelligenceStatus={status}
        predictions={result.predictions}
      />
    </AdminShell>
  );
}

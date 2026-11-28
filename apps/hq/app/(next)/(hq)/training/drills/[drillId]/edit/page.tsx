import { hqHref } from "@duna/core/hq-routes";
import { Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrillForm } from "@/components/training/drill-form";
import {
  loadDrill,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Edit drill" };

/** Edit a drill as a new version (plans keep the version they use). */
export default async function EditDrillPage({
  params,
}: {
  readonly params: Promise<{ drillId: string }>;
}) {
  const { drillId } = await params;
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  const drill = context.canWrite ? await loadDrill(drillId) : undefined;
  if (drill?.state === "not-found") notFound();
  const data = drill?.state === "ok" ? drill.data : undefined;
  const readOnly = data && (data.scope === "duna" || data.purchased);
  return (
    <TrainingScreen
      askLabel={data ? `Editing ${data.title} (drill)` : "Edit drill"}
      askStarters={[]}
      back={{
        href: hqHref("trainingDrill", { drillId }),
        label: data?.title ?? "Drill",
      }}
      crumb="Edit"
      description={
        data
          ? `Saving makes version ${data.version + 1}. Plans keep the version they use.`
          : undefined
      }
      needsWrite
      parentHref={hqHref("trainingDrill", { drillId })}
      tab="drills"
      title={data ? `Edit ${data.title}` : "Edit drill"}
    >
      {drill === undefined ? null : drill.state !== "ok" ? (
        <TrainingBlockState
          loaded={drill}
          organization={context.organization}
          what="this drill"
        />
      ) : readOnly ? (
        <Notice tone="info">Duna and purchased drills are read-only.</Notice>
      ) : (
        <DrillForm drill={drill.data} />
      )}
    </TrainingScreen>
  );
}

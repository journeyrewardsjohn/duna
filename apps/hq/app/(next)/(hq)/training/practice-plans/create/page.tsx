import { hqHref } from "@duna/core/hq-routes";
import { deriveTrainingSceneEstimates } from "@duna/core/training-scene";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanBuilder } from "@/components/training/plan-builder";
import { builderSession } from "@/components/training/plan-page";
import {
  loadDrill,
  loadPlanLibrary,
  trainingContext,
} from "@/components/training/training-data";
import { TrainingScreen } from "@/components/training/training-screen";

export const metadata: Metadata = { title: "New practice plan" };

/**
 * A new practice plan (PP-Builder). `?session=` plans one practice (and
 * offers to attach the plan); `?drill=` starts with a library drill; the
 * old `?from=` editing address opens that plan.
 */
export default async function NewPracticePlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    session?: string;
    drill?: string;
    from?: string;
  }>;
}) {
  const { session: sessionId, drill: drillId, from } = await searchParams;
  if (from) redirect(hqHref("trainingPracticePlan", { planId: from }));
  const context = await trainingContext();
  const [library, session, drill] = await Promise.all([
    context.canWrite ? loadPlanLibrary() : undefined,
    context.canWrite ? builderSession(context, sessionId) : undefined,
    context.canWrite && drillId ? loadDrill(drillId) : undefined,
  ]);
  const perRep =
    drill?.state === "ok" && drill.data.scene
      ? deriveTrainingSceneEstimates(drill.data.scene.document)
      : undefined;
  return (
    <TrainingScreen
      askLabel="New practice plan"
      askStarters={[
        "Draft a 90-minute practice on serve-receive",
        "Add a side-out game for 12 players",
      ]}
      back={{ href: hqHref("trainingPracticePlans"), label: "Practice plans" }}
      crumb="New plan"
      description={
        session
          ? `For ${session.when}. Quick blocks, drills from the library, or a draft from Duna to edit.`
          : "Quick blocks, drills from the library, or a draft from Duna to edit. Nothing is saved until you save."
      }
      needsWrite
      parentHref={hqHref("trainingPracticePlans")}
      tab="plans"
      title="New practice plan"
    >
      <PlanBuilder
        canEdit={context.canWrite}
        library={library?.items ?? []}
        prefill={
          drill?.state === "ok"
            ? {
                id: drill.data.id,
                title: drill.data.title,
                focus: drill.data.focus,
                durationMinutes: drill.data.durationMinutes,
                load: drill.data.load,
                touches: drill.data.touches,
                jumps: drill.data.jumps,
                version: drill.data.version,
                currentVersionId: drill.data.currentVersionId,
                ...(perRep?.touchesPerRep !== undefined
                  ? {
                      perRep: {
                        touches: perRep.touchesPerRep,
                        jumps: perRep.jumpsPerRep ?? 0,
                      },
                    }
                  : {}),
              }
            : undefined
        }
        session={session}
      />
    </TrainingScreen>
  );
}

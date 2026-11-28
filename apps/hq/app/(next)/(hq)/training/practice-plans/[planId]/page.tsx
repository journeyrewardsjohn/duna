import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  ArchiveControls,
  VersionHistory,
} from "@/components/training/history-actions";
import { PlanBuilder } from "@/components/training/plan-builder";
import { planStatusCopy, versionLine } from "@/components/training/plan-model";
import { builderSession } from "@/components/training/plan-page";
import {
  loadDrill,
  loadPlanLibrary,
  loadPlanVersions,
  loadPracticePlan,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Practice plan" };

/**
 * One practice plan in the builder: edit and save a new version (practices
 * keep the version they were given); drill blocks show the version they
 * are pinned to and say when a newer one exists.
 */
export default async function PracticePlanPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ planId: string }>;
  readonly searchParams: Promise<{ session?: string }>;
}) {
  const { planId } = await params;
  const { session: sessionId } = await searchParams;
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  const plan = context.canWrite ? await loadPracticePlan(planId) : undefined;
  if (plan?.state === "not-found") notFound();
  const [library, session, pins, versions] = await Promise.all([
    context.canWrite ? loadPlanLibrary() : undefined,
    context.canWrite ? builderSession(context, sessionId) : undefined,
    plan?.state === "ok" ? drillPins(plan.data.blocks) : undefined,
    plan?.state === "ok" ? loadPlanVersions(planId) : undefined,
  ]);
  const state =
    plan?.state === "ok" ? planStatusCopy[plan.data.status] : undefined;
  return (
    <TrainingScreen
      actions={
        plan?.state === "ok" ? (
          <Button
            href={hqHref("trainingPracticePlanPrint", { planId })}
            size="sm"
            variant="secondary"
          >
            Print
          </Button>
        ) : undefined
      }
      askLabel={
        plan?.state === "ok"
          ? `${plan.data.title} (practice plan)`
          : "Practice plan"
      }
      askStarters={["Make this plan 15 minutes shorter", "Add more serving"]}
      back={{ href: hqHref("trainingPracticePlans"), label: "Practice plans" }}
      crumb={plan?.state === "ok" ? plan.data.title : "Practice plan"}
      description={
        plan?.state === "ok" ? (
          <>
            {`${versionLine(plan.data.version, plan.data.updatedAt)} · ${plan.data.durationMinutes} min `}
            {state ? <Chip tone={state.tone}>{state.label}</Chip> : null}
          </>
        ) : undefined
      }
      needsWrite
      parentHref={hqHref("trainingPracticePlans")}
      tab="plans"
      title={plan?.state === "ok" ? plan.data.title : "Practice plan"}
    >
      {plan === undefined ? null : plan.state !== "ok" ? (
        <TrainingBlockState
          loaded={plan}
          organization={context.organization}
          what="this practice plan"
        />
      ) : (
        <>
          <PlanBuilder
            canEdit={context.canWrite}
            key={plan.data.versionId}
            library={library?.items ?? []}
            pins={pins}
            plan={plan.data}
            session={session}
          />
          <PageSection
            aside={
              <ArchiveControls
                archived={plan.data.status === "archived"}
                id={plan.data.id}
                kind="plan"
                title={plan.data.title}
              />
            }
            id="history"
            title="History and archive"
          >
            {versions?.state === "ok" ? (
              <VersionHistory
                canRestore={plan.data.status !== "archived"}
                id={plan.data.id}
                kind="plan"
                versions={versions.data}
              />
            ) : versions ? (
              <TrainingBlockState
                loaded={versions}
                organization={context.organization}
                what="this plan's history"
              />
            ) : null}
            <p className="tr-quiet">
              Practices keep the version they were given.
            </p>
          </PageSection>
        </>
      )}
    </TrainingScreen>
  );
}

/** Pinned and current version numbers for each drill block. */
async function drillPins(
  blocks: readonly { id: string; drillId?: string; drillVersionId?: string }[],
): Promise<
  Record<string, { pinned?: number; current?: number; scene?: unknown }>
> {
  const drillIds = [
    ...new Set(
      blocks.flatMap((block) => (block.drillId ? [block.drillId] : [])),
    ),
  ];
  const drills = await Promise.all(
    drillIds.slice(0, 20).map((id) => loadDrill(id)),
  );
  const byId = new Map(
    drills.flatMap((drill) =>
      drill.state === "ok" ? [[drill.data.id, drill.data] as const] : [],
    ),
  );
  const pins: Record<
    string,
    { pinned?: number; current?: number; scene?: unknown }
  > = {};
  for (const block of blocks) {
    const drill = block.drillId ? byId.get(block.drillId) : undefined;
    if (!drill) continue;
    const pinned = drill.versions.find(
      (version) => version.id === block.drillVersionId,
    );
    pins[block.id] = {
      ...(pinned ? { pinned: pinned.version } : {}),
      current: drill.version,
      ...(drill.scene ? { scene: drill.scene.document } : {}),
    };
  }
  return pins;
}

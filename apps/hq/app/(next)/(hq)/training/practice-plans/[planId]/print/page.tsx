import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  blockKindLabels,
  minuteLabel,
  versionLine,
} from "@/components/training/plan-model";
import { PrintButton } from "@/components/training/print-button";
import { SceneSlot } from "@/components/training/scene-slot";
import {
  loadDrill,
  loadPracticePlan,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Practice run sheet" };

/**
 * The plan on one sheet for the clipboard on court: each block's time,
 * minutes, focus, estimated load, contacts and jumps, and room for notes.
 * The shell is hidden when printing.
 */
export default async function PracticePlanPrintPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ planId: string }>;
  readonly searchParams: Promise<{ start?: string }>;
}) {
  const { planId } = await params;
  const { start } = await searchParams;
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  const plan = context.canWrite ? await loadPracticePlan(planId) : undefined;
  if (plan?.state === "not-found") notFound();
  const drillIds =
    plan?.state === "ok"
      ? [
          ...new Set(
            plan.data.blocks.flatMap((block) =>
              block.drillId ? [block.drillId] : [],
            ),
          ),
        ].slice(0, 20)
      : [];
  const drills = await Promise.all(drillIds.map((id) => loadDrill(id)));
  const sceneOf = new Map(
    drills.flatMap((drill) =>
      drill.state === "ok" && drill.data.scene
        ? [[drill.data.id, drill.data.scene.document] as const]
        : [],
    ),
  );
  const startsAt = start && /^\d{2}:\d{2}$/.test(start) ? start : undefined;
  return (
    <TrainingScreen
      actions={
        <span className="tr-print__tools">
          <Button
            href={hqHref("trainingPracticePlan", { planId })}
            size="sm"
            variant="ghost"
          >
            Back to the plan
          </Button>
          <PrintButton />
        </span>
      }
      askLabel="Practice run sheet"
      askStarters={[]}
      back={{ href: hqHref("trainingPracticePlan", { planId }), label: "Plan" }}
      crumb="Run sheet"
      description={
        plan?.state === "ok"
          ? `${versionLine(plan.data.version, plan.data.updatedAt)} · ${plan.data.durationMinutes} min · ${plan.data.assumptions.athletes} athletes · ${plan.data.assumptions.courts} courts`
          : undefined
      }
      needsWrite
      parentHref={hqHref("trainingPracticePlan", { planId })}
      tab="plans"
      title={plan?.state === "ok" ? plan.data.title : "Run sheet"}
    >
      {plan === undefined ? null : plan.state !== "ok" ? (
        <TrainingBlockState
          loaded={plan}
          organization={context.organization}
          what="this plan"
        />
      ) : (
        <article aria-label="Run sheet" className="tr-print">
          <table className="tr-print__table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Block</th>
                <th scope="col" className="tr-num">
                  Min
                </th>
                <th scope="col" className="tr-num">
                  Load*
                </th>
                <th scope="col" className="tr-num">
                  Contacts*
                </th>
                <th scope="col" className="tr-num">
                  Jumps*
                </th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {[...plan.data.blocks]
                .sort(
                  (a, b) =>
                    a.startsAtMinute - b.startsAtMinute ||
                    a.lane.localeCompare(b.lane),
                )
                .map((block) => (
                  <tr key={block.id}>
                    <td className="tr-num">
                      {minuteLabel(block.startsAtMinute, startsAt)}
                    </td>
                    <td>
                      <b>{block.title}</b>
                      <span className="tr-print__meta">
                        {[
                          blockKindLabels[block.kind],
                          block.lane !== "all" ? block.lane : undefined,
                          block.focus,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {block.instructionsMarkdown ? (
                        <span className="tr-print__meta">
                          {block.instructionsMarkdown}
                        </span>
                      ) : null}
                      {block.drillId && sceneOf.has(block.drillId) ? (
                        <SceneSlot
                          compact
                          label={`${block.title}: the drawing`}
                          mode="diagram"
                          scene={sceneOf.get(block.drillId)}
                        />
                      ) : null}
                    </td>
                    <td className="tr-num">{block.durationMinutes}</td>
                    <td className="tr-num">{block.plannedLoad}</td>
                    <td className="tr-num">{block.estimatedTouches ?? "–"}</td>
                    <td className="tr-num">{block.estimatedJumps ?? "–"}</td>
                    <td className="tr-print__notes" />
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Totals
                </th>
                <td className="tr-num">{plan.data.totals.minutes}</td>
                <td className="tr-num">{plan.data.totals.load}</td>
                <td className="tr-num">{plan.data.totals.touches}</td>
                <td className="tr-num">{plan.data.totals.jumps}</td>
                <td>{`Work to rest ${plan.data.totals.workRestRatio}`}</td>
              </tr>
            </tfoot>
          </table>
          <p className="tr-quiet">
            * Estimates per player for planning, not medical or injury advice.
          </p>
          <div className="tr-print__lines" aria-label="Notes">
            <span>Attendance</span>
            <span>How it went</span>
          </div>
        </article>
      )}
    </TrainingScreen>
  );
}

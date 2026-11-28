import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Chip,
  EmptyState,
  rallyStyle,
  riseClassName,
} from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { PageSection } from "@/components/shell/page-header";
import { planStatusCopy, versionLine } from "@/components/training/plan-model";
import {
  loadPracticePlans,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Practice plans" };

/** Training › Practice plans: every plan with its length, estimated load and version. */
export default async function PracticePlansPage() {
  const context = await trainingContext();
  const plans = context.canWrite ? await loadPracticePlans() : undefined;
  const items =
    plans?.state === "ok"
      ? [...plans.data.items].sort(
          (a, b) =>
            Number(a.status === "archived") - Number(b.status === "archived") ||
            b.updatedAt.localeCompare(a.updatedAt),
        )
      : [];
  return (
    <TrainingScreen
      actions={
        <Button
          href={hqHref("trainingPracticePlanCreate")}
          size="sm"
          variant="primary"
        >
          New plan
        </Button>
      }
      askLabel="Practice plans"
      askStarters={[
        "Plan Thursday's practice",
        "Draft a 90-minute serve-receive practice",
      ]}
      description="What a coach runs on the day: blocks on a timeline, with estimated load, contacts and jumps."
      needsWrite
      tab="plans"
      title="Practice plans"
    >
      <PageSection flush id="plans" title="Plans">
        {plans === undefined ? null : plans.state !== "ok" ? (
          <TrainingBlockState
            loaded={plans}
            organization={context.organization}
            what="the practice plans"
          />
        ) : items.length === 0 ? (
          <EmptyState
            actions={
              <Button
                href={hqHref("trainingPracticePlanCreate")}
                variant="primary"
              >
                Build the first plan
              </Button>
            }
            description="Start from quick blocks and drills, or let Duna draft one from a focus."
            icon="session"
            title="No practice plans yet"
          />
        ) : (
          <ul aria-label="Practice plans" className="tr-rows">
            {items.map((plan, index) => {
              const state = planStatusCopy[plan.status];
              return (
                <li
                  className={`tr-row ${riseClassName()}`}
                  key={plan.id}
                  style={rallyStyle(index)}
                >
                  <div className="tr-row__main">
                    <Link
                      className="tr-row__name"
                      href={hqHref("trainingPracticePlan", { planId: plan.id })}
                    >
                      {plan.title}
                    </Link>
                    <span className="tr-quiet">
                      {`${plan.durationMinutes} min · load ${plan.plannedLoad} (estimate) · ${versionLine(plan.version, plan.updatedAt)}`}
                    </span>
                  </div>
                  <Chip tone={state.tone}>{state.label}</Chip>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>
    </TrainingScreen>
  );
}

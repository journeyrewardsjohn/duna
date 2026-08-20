import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingPracticeBuilder } from "@/components/training-practice-builder";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Build a practice" };

export default async function CreatePracticePlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ drill?: string; from?: string }>;
}) {
  const { drill, from } = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
  const initialPlan = from
    ? trainingWorkspace.practicePlans.find((plan) => plan.id === from)
    : undefined;
  return (
    <OperatorShell
      active="training"
      immersive
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main
        className="hq-page training-studio-page training-practice-page"
        data-zone="editorial"
      >
        <header className="training-studio-page__heading training-practice-page__heading">
          <Link aria-label="Back to Training" href="/training">
            <ArrowLeft aria-hidden size={20} />
          </Link>
          <div>
            <span className="hq-eyebrow">Training · Practice Builder</span>
            <h1>
              {initialPlan ? "Refine the practice." : "Compose the practice."}
            </h1>
            <p>
              {initialPlan
                ? `You are editing v${initialPlan.version}. Saving creates a new recoverable version and leaves the current plan intact.`
                : "Balance time, load, focus, contact opportunity, transitions, and parallel courts while the run sheet takes shape."}
            </p>
          </div>
        </header>
        <TrainingPracticeBuilder
          initialDrillId={drill}
          editingPlanId={initialPlan?.id}
          drills={trainingWorkspace.drills}
          focusAreas={trainingWorkspace.focusAreas}
          initialPlan={initialPlan}
        />
      </main>
    </OperatorShell>
  );
}

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingPracticeBuilder } from "@/components/training-practice-builder";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Build a practice" };

export default async function CreatePracticePlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ drill?: string }>;
}) {
  const { drill } = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
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
            <h1>Compose the practice.</h1>
            <p>
              Balance time, load, focus, contact opportunity, transitions, and
              parallel courts while the run sheet takes shape.
            </p>
          </div>
        </header>
        <TrainingPracticeBuilder
          initialDrillId={drill}
          drills={trainingWorkspace.drills}
          focusAreas={trainingWorkspace.focusAreas}
        />
      </main>
    </OperatorShell>
  );
}

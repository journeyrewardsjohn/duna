import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingDrillStudio } from "@/components/training-drill-studio";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Create a drill" };

export default async function CreateTrainingDrillPage() {
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active="training"
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page training-studio-page" data-zone="editorial">
        <header className="training-studio-page__heading">
          <Link aria-label="Back to Training" href="/training">
            <ArrowLeft aria-hidden size={20} />
          </Link>
          <div>
            <span className="hq-eyebrow">Training · Drill Studio</span>
            <h1>
              Describe the drill.
              <br />
              <em>Duna makes it teachable.</em>
            </h1>
            <p>
              Start in your own coaching language. Duna structures the setup,
              movement, scoring, tags, opportunity estimate, and animated
              court—then waits for your review.
            </p>
          </div>
        </header>
        <TrainingDrillStudio />
      </main>
    </OperatorShell>
  );
}

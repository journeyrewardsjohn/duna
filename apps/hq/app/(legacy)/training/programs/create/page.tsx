import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingProgramDesigner } from "@/components/training-program-designer";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Program Designer" };

export default async function CreateTrainingProgramPage() {
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const offers = operatorWorkspace.catalog
    .filter((item) => item.type === "service" && item.subtype === "program")
    .map((item) => ({ id: item.id, title: item.title, status: item.status }));
  return (
    <OperatorShell
      active="training"
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main
        className="hq-page training-studio-page training-program-page"
        data-zone="editorial"
      >
        <header className="training-studio-page__heading">
          <Link aria-label="Back to Training" href="/training">
            <ArrowLeft aria-hidden size={20} />
          </Link>
          <div>
            <span className="hq-eyebrow">Training · Program Designer</span>
            <h1>
              Set the destination.
              <br />
              <em>Duna maps the work.</em>
            </h1>
            <p>
              Give Duna the dates, competition, travel, practice rhythm,
              objectives, and coaching approach. It will propose a phase-aware
              calendar—without taking the final decision away from your staff.
            </p>
          </div>
        </header>
        <TrainingProgramDesigner
          offers={offers}
          timezone={dashboard.organization.timezone}
          today={new Date().toISOString().slice(0, 10)}
        />
      </main>
    </OperatorShell>
  );
}

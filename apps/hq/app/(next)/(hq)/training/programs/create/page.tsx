import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { NewProgram } from "@/components/training/new-program";
import {
  loadCoaches,
  loadVenues,
  trainingContext,
} from "@/components/training/training-data";
import {
  deniedScreen,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "New program" };

/**
 * New program (TR-New, CO-5.3): one sentence → an editable summary → a
 * draft. Owners and managers create programs (members:write).
 */
export default async function NewProgramPage() {
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  if (!context.canManage) {
    return deniedScreen(context, "creating programs", "New program");
  }
  const [coaches, venues] = await Promise.all([loadCoaches(), loadVenues()]);
  return (
    <TrainingScreen
      askLabel="New training program"
      askStarters={[
        "Draft a U14 program, Mondays and Wednesdays 4 to 6",
        "Which coaches are free on Saturday mornings?",
      ]}
      back={{ href: hqHref("training"), label: "Programs" }}
      crumb="New program"
      description="Describe the season; Duna drafts it on the real form. Nothing is scheduled until you activate it."
      parentHref={hqHref("training")}
      tab="programs"
      title="New program"
    >
      <NewProgram coaches={coaches} venues={venues} />
    </TrainingScreen>
  );
}

import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { DrillForm } from "@/components/training/drill-form";
import { TrainingScreen } from "@/components/training/training-screen";

export const metadata: Metadata = { title: "New drill" };

/** A new drill: the words a coach needs and a drawing from an example or a pasted scene. */
export default function NewDrillPage() {
  return (
    <TrainingScreen
      askLabel="New drill"
      askStarters={["Describe a serve-receive drill for 4 players"]}
      back={{ href: hqHref("trainingDrills"), label: "Drill library" }}
      crumb="New drill"
      description="Private to you until you share it with your club or list it in the store."
      needsWrite
      parentHref={hqHref("trainingDrills")}
      tab="drills"
      title="New drill"
    >
      <DrillForm />
    </TrainingScreen>
  );
}

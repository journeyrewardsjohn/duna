import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { PlaceRows } from "@/components/setup/places";
import { loadWorkspace } from "@/components/setup/setup-data";
import { SetupScreen, setupContext } from "@/components/setup/setup-screen";
import { SetupBlockState } from "@/components/setup/setup-states";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Places and courts" };

/** Club setup › Places and courts: every place, Draft or Live, its courts and what it still needs. */
export default async function PlacesPage() {
  const context = await setupContext();
  const workspace = await loadWorkspace();
  const venues = workspace.state === "ok" ? workspace.data.venues : [];
  return (
    <SetupScreen
      actions={
        <Button href={hqHref("placeCreate")} variant="primary">
          Add a place
        </Button>
      }
      askLabel="Places and courts"
      askStarters={[
        "Add a venue with four outdoor sand courts",
        "Which courts have no price yet?",
        "What does each place still need before it goes live?",
      ]}
      description="Where you play, and the courts people book"
      tab="places"
      title="Places and courts"
    >
      <PageSection
        flush
        id="places"
        title={`${venues.length} place${venues.length === 1 ? "" : "s"}`}
      >
        {workspace.state !== "ok" ? (
          <SetupBlockState
            loaded={workspace}
            organization={context.organization}
            retryHref={hqHref("places")}
            what="your places"
          />
        ) : venues.length === 0 ? (
          <EmptyFirstUse
            action={
              <Button href={hqHref("placeCreate")} variant="secondary">
                Add your first place
              </Button>
            }
            description="A place is where you play: a beach, a park or a hall. Add it, then its courts. It stays a draft until you publish it."
            icon="venue"
            title="No places yet"
          />
        ) : (
          <PlaceRows venues={venues} />
        )}
      </PageSection>
    </SetupScreen>
  );
}

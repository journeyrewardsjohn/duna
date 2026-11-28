import { hqHref } from "@duna/core/hq-routes";
import { Button, type SubNavItem } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { PageSection } from "@/components/shell/page-header";
import { DrillLibrary } from "@/components/training/drill-library";
import {
  isLibraryTab,
  type LibraryTab,
  libraryTabs,
} from "@/components/training/drill-model";
import {
  loadLibrary,
  loadPurchases,
  loadStore,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";
import { TrainingSubNav } from "@/components/training/training-subnav";

export const metadata: Metadata = { title: "Drill library" };

/**
 * Training › Drill library (DL-Library, DL-Store): a coach's own drills,
 * the club's, Duna's, purchased ones and the store of drills other clubs
 * list, free or for sale. Drills made on the old Training page and new
 * ones both come through the backend's library read.
 */
export default async function DrillLibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: raw } = await searchParams;
  const tab: LibraryTab = isLibraryTab(raw) ? raw : "club";
  const context = await trainingContext();
  const [library, store, purchases] = context.canWrite
    ? await Promise.all([
        tab === "store" ? undefined : loadLibrary(tab),
        tab === "store" ? loadStore() : undefined,
        tab === "purchased" ? loadPurchases() : undefined,
      ])
    : [undefined, undefined, undefined];
  const tabs: SubNavItem[] = libraryTabs.map((row) => ({
    id: row.id,
    label: row.label,
    href: `${hqHref("trainingDrills")}?tab=${row.id}`,
  }));
  const loaded = tab === "store" ? store : library;
  return (
    <TrainingScreen
      actions={
        <Button
          href={hqHref("trainingDrillCreate")}
          size="sm"
          variant="primary"
        >
          New drill
        </Button>
      }
      askLabel="Drill library"
      askStarters={[
        "Find a serve-receive drill for 6 players",
        "Which drills use the most jumps?",
      ]}
      description="Drills you share with your club, Duna's library, and the store where clubs list drills free or for sale."
      needsWrite
      tab="drills"
      title="Drill library"
    >
      <PageSection id="library" title="Drills">
        <TrainingSubNav current={tab} items={tabs} label="Library" />
        {loaded === undefined ? null : loaded.state !== "ok" ? (
          <TrainingBlockState
            loaded={loaded}
            organization={context.organization}
            what={tab === "store" ? "the store" : "the drills"}
          />
        ) : (
          <DrillLibrary
            canBuyForClub={context.canManage}
            initial={library?.state === "ok" ? library.data.items : []}
            key={tab}
            purchases={purchases?.state === "ok" ? purchases.data.items : []}
            store={store?.state === "ok" ? store.data : undefined}
            tab={tab}
          />
        )}
      </PageSection>
    </TrainingScreen>
  );
}

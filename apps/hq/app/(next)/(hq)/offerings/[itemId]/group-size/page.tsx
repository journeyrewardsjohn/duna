import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GroupSizeEditor } from "@/components/offerings/group-size-editor";
import {
  creditPrice,
  mediaDisplayUrl,
  offeringCapacity,
  priceSummary,
} from "@/components/offerings/offering-model";
import {
  loadOfferingPage,
  loadSessions,
  OfferingScreen,
  OfferingUnavailable,
  SectionDenied,
} from "@/components/offerings/offerings-screen";
import { sessionIsOpen } from "@/components/participation/session-model";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Group size" };

/** Group size (PART-6): the rule as a sentence, presets, the ladder and the live preview. */
export default async function OfferingGroupSizePage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context, defaults } = result.page;
  if (item.type !== "service") redirect(hqHref("offering", { itemId }));
  if (!context.access.money) {
    return (
      <OfferingScreen page={result.page} tab="group-size">
        <SectionDenied area="Group rules" context={context} />
      </OfferingScreen>
    );
  }
  const sessions = await loadSessions(
    item.id,
    item.configuration.participation,
  );
  const booked =
    sessions.state === "ok"
      ? sessions.data.filter(
          (session) => session.booked > 0 && sessionIsOpen(session),
        ).length
      : 0;
  const cover = item.media.find((media) => media.kind === "image");
  return (
    <OfferingScreen
      askStarters={[
        "Make this a clinic that needs 4 players",
        "What happens to people already booked if I raise the minimum?",
        "Is my price ladder fair to players?",
      ]}
      page={result.page}
      tab="group-size"
    >
      <PageSection id="group" title="Group size">
        <GroupSizeEditor
          allowCredits={item.allowCredits}
          bookedSessions={booked}
          canWrite={context.access.write}
          capacity={offeringCapacity(item)}
          clubDefault={defaults?.rules ?? undefined}
          clubDefaultApplies={
            Boolean(defaults?.rules) &&
            (defaults?.appliesTo ?? []).includes("service") &&
            offeringCapacity(item) > 1
          }
          clubName={context.organization}
          coverAlt={cover?.alt}
          coverUrl={cover ? mediaDisplayUrl(cover.url) : undefined}
          creditCost={creditPrice(item)}
          currency={context.currency}
          itemId={item.id}
          live={item.status === "active"}
          now={context.now}
          ownRule={item.configuration.participation ?? undefined}
          price={priceSummary(item, context.currency)}
          summary={item.shortSummary}
          timeZone={context.timeZone}
          title={item.title}
        />
      </PageSection>
    </OfferingScreen>
  );
}

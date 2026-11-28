import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import {
  ClubDefaultsForm,
  RulesToReview,
} from "@/components/offerings/club-defaults";
import {
  loadDefaults,
  loadRulesToReview,
  offeringsContext,
} from "@/components/offerings/offerings-data";
import {
  AreaScreen,
  LoadedState,
  SectionDenied,
} from "@/components/offerings/offerings-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Booking rules" };

/** Booking rules: the club's rule every offering inherits, and older rules to review. */
export default async function OfferingsSettingsPage() {
  const context = await offeringsContext();
  if (context.session.access !== "operator") return null;
  if (!context.access.money) {
    return (
      <AreaScreen
        askLabel="Booking rules"
        askStarters={[]}
        context={context}
        tab="settings"
        title="Booking rules"
      >
        <SectionDenied area="Booking rules" context={context} />
      </AreaScreen>
    );
  }
  const [defaults, review] = await Promise.all([
    loadDefaults(),
    loadRulesToReview(),
  ]);
  return (
    <AreaScreen
      askLabel="The club's booking rule"
      askStarters={[
        "Make every clinic need 4 players",
        "Should we decide 24 or 48 hours before?",
      ]}
      context={context}
      description="One rule every lesson and group uses unless it has its own"
      tab="settings"
      title="Booking rules"
    >
      <PageSection id="default" title="The club's rule">
        {defaults.state === "ok" ? (
          <ClubDefaultsForm
            appliesTo={defaults.data.appliesTo}
            canWrite={context.access.sessions}
            inheritedBy={defaults.data.inheritedBy}
            proposed={defaults.data.proposed === true}
            rules={defaults.data.rules}
          />
        ) : (
          <LoadedState
            context={context}
            loaded={defaults}
            retryHref={hqHref("offeringsSettings")}
            what="the club's booking rule"
          />
        )}
      </PageSection>
      <PageSection id="review" title="Rules to review">
        {review.state === "ok" ? (
          <RulesToReview
            canWrite={context.access.sessions}
            rules={review.data}
            timeZone={context.timeZone}
          />
        ) : (
          <LoadedState
            context={context}
            loaded={review}
            retryHref={hqHref("offeringsSettings")}
            what="rules to review"
          />
        )}
      </PageSection>
    </AreaScreen>
  );
}

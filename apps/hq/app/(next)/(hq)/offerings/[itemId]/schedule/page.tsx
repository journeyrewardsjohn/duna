import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScheduleForm } from "@/components/offerings/schedule-form";
import { scheduleMode } from "@/components/offerings/offering-model";
import {
  loadWorkspace,
  offeringShareUrls,
} from "@/components/offerings/offerings-data";
import {
  LoadedState,
  loadOfferingPage,
  loadSessions,
  OfferingScreen,
  OfferingUnavailable,
  type OfferingPage,
} from "@/components/offerings/offerings-screen";
import { SessionList } from "@/components/participation/session-list";
import { PageSection } from "@/components/shell/page-header";
import { SkeletonListRow } from "@duna/ui/tideline";

export const metadata: Metadata = { title: "Schedule and sessions" };

async function Sessions({ page }: { readonly page: OfferingPage }) {
  const { item, context, rule } = page;
  const [sessions, shareUrls] = await Promise.all([
    loadSessions(item.id, item.configuration.participation ?? rule.rule),
    offeringShareUrls(),
  ]);
  if (sessions.state !== "ok") {
    return (
      <LoadedState
        context={context}
        loaded={sessions}
        retryHref={hqHref("offeringSchedule", { itemId: item.id })}
        what="this offering's sessions"
      />
    );
  }
  if (sessions.data.length === 0) {
    return (
      <p className="pt-quiet">
        {scheduleMode(item) === "flexible"
          ? "Players book a time with a coach, so sessions appear as they book."
          : "No sessions in the next two months yet. They appear here once the schedule is saved and published."}
      </p>
    );
  }
  return (
    <SessionList
      currency={context.currency}
      label={`Sessions of ${item.title}`}
      now={context.now}
      permissions={{
        money: context.access.money,
        sessions: context.access.sessions,
      }}
      sessions={sessions.data}
      shareUrls={shareUrls}
    />
  );
}

/** Schedule and sessions: when it runs, and each session with its state and actions. */
export default async function OfferingSchedulePage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context, rule } = result.page;
  if (item.type !== "service") redirect(hqHref("offering", { itemId }));
  const workspace = await loadWorkspace();
  const venues =
    workspace.state === "ok"
      ? workspace.data.venues.map((venue) => ({
          id: venue.id,
          name: venue.name,
        }))
      : [];
  const needsDates =
    rule.source === "own" &&
    rule.rule !== undefined &&
    (rule.rule.minParticipants > 1 || rule.rule.tiers.length > 0);
  return (
    <OfferingScreen page={result.page} tab="schedule">
      <PageSection id="sessions" title="Sessions" flush>
        <Suspense
          fallback={
            <div aria-label="Loading sessions" role="status">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonListRow avatar={false} key={index} lines={2} />
              ))}
            </div>
          }
        >
          <Sessions page={result.page} />
        </Suspense>
      </PageSection>
      <PageSection id="when" title="When it runs">
        <ScheduleForm
          canWrite={context.access.write}
          configuration={item.configuration}
          isProgram={item.subtype === "program"}
          itemId={item.id}
          live={item.status === "active"}
          needsDates={needsDates}
          timeZone={context.timeZone}
          title={item.title}
          venues={venues}
        />
      </PageSection>
    </OfferingScreen>
  );
}

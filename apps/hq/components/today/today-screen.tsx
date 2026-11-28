import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, PageSection } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import type { ShellSession } from "../shell/session-types";
import { TodayAsk } from "./today-ask";
import {
  AskBlock,
  AttentionBlock,
  ComingUpBlock,
  GlanceBlock,
  MoneyBlock,
  ScheduleBlock,
  SetupBlock,
} from "./today-blocks";
import { todayLabel } from "./today-model";
import { BlockSkeleton, GlanceSkeleton } from "./today-states";

/**
 * HQ Today (board W-Today): the day's schedule, what needs the owner, the
 * numbers at a glance, setup progress for a new club, Duna Pay's state, and
 * Ask Duna's next steps. Each block streams in on its own and has its own
 * loading, empty, error and permission states.
 */
export function TodayScreen({ session }: { readonly session: ShellSession }) {
  const organization = session.organization;
  return (
    <div className="today">
      <ShellPage
        askLabel="Today"
        askStarters={[
          "What needs my attention today?",
          "Summarise today's schedule and who is coming",
          "What is missing from our club setup?",
        ]}
      />
      <PageHeader
        actions={
          <>
            <Button href={hqHref("schedule")} variant="secondary">
              Open schedule
            </Button>
            <Button href={hqHref("eventCreate")} variant="primary">
              Create event
            </Button>
          </>
        }
        description={
          organization
            ? `${todayLabel(organization.timezone)} · ${organization.name}`
            : todayLabel("UTC")
        }
        title="Today"
      />
      <Suspense fallback={<TodayAsk suggestions={[]} />}>
        <AskBlock />
      </Suspense>
      <Suspense fallback={<GlanceSkeleton />}>
        <GlanceBlock session={session} />
      </Suspense>
      <div className="today-cols">
        <div className="today-col today-col--main">
          <PageSection
            aside={
              <Link className="today-link" href={hqHref("schedule")}>
                Full schedule
              </Link>
            }
            flush
            id="today-schedule"
            title="Schedule"
          >
            <Suspense
              fallback={<BlockSkeleton label="Loading the schedule" rows={4} />}
            >
              <ScheduleBlock session={session} />
            </Suspense>
          </PageSection>
          <PageSection
            aside={
              <Link className="today-link" href={hqHref("events")}>
                All events
              </Link>
            }
            flush
            id="today-coming"
            title="Coming up"
          >
            <Suspense
              fallback={<BlockSkeleton label="Loading upcoming events" />}
            >
              <ComingUpBlock />
            </Suspense>
          </PageSection>
        </div>
        <div className="today-col">
          <PageSection flush id="today-attention" title="Needs you">
            <Suspense
              fallback={<BlockSkeleton label="Loading what needs you" />}
            >
              <AttentionBlock session={session} />
            </Suspense>
          </PageSection>
          <PageSection id="today-setup" title="Club setup">
            <Suspense
              fallback={
                <BlockSkeleton avatar={false} label="Loading setup" rows={2} />
              }
            >
              <SetupBlock session={session} />
            </Suspense>
          </PageSection>
          <PageSection id="today-money" title="Payments">
            <Suspense
              fallback={
                <BlockSkeleton
                  avatar={false}
                  label="Loading payments"
                  rows={1}
                />
              }
            >
              <MoneyBlock session={session} />
            </Suspense>
          </PageSection>
        </div>
      </div>
    </div>
  );
}

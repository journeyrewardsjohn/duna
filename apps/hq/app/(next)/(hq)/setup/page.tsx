import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AiStartBlock,
  ClubSummary,
  PrerequisiteList,
} from "@/components/setup/setup-home";
import { SetupScreen, setupContext } from "@/components/setup/setup-screen";
import { SetupRowsSkeleton } from "@/components/setup/setup-states";
import { SetupWelcome } from "@/components/setup/setup-welcome";

export const metadata: Metadata = { title: "Club setup" };

/**
 * Club setup › Overview (CS-Home): what the club is, Duna as the faster
 * way to fill it in, and what is left, in order, each with one next action.
 * Each block loads on its own and has its own states.
 */
export default async function SetupHomePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const context = await setupContext();
  return (
    <SetupScreen
      askLabel="Club setup"
      askStarters={[
        "What is left before bookings open?",
        "Read our website and set up the club",
        "Which offerings are still drafts?",
      ]}
      description={`What ${context.organization} is, and what is left before people can book`}
      tab="overview"
      title="Club setup"
    >
      {welcome ? <SetupWelcome kind={welcome} /> : null}
      <Suspense
        fallback={<SetupRowsSkeleton label="Loading your club" rows={1} />}
      >
        <ClubSummary context={context} />
      </Suspense>
      <Suspense fallback={null}>
        <AiStartBlock context={context} />
      </Suspense>
      <Suspense
        fallback={<SetupRowsSkeleton label="Loading what's left" rows={6} />}
      >
        <PrerequisiteList context={context} />
      </Suspense>
      <p className="setup-quiet setup-foot">
        Changed your mind about something Duna added?{" "}
        <Link className="setup-link" href={hqHref("setupReview")}>
          See the last website read
        </Link>
        .
      </p>
    </SetupScreen>
  );
}

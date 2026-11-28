import type { OperatorWorkspace, SetupRun } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Chip,
  ClubMark,
  Icon,
  Notice,
  rallyStyle,
  riseClassName,
} from "@duna/ui/tideline";
import Link from "next/link";
import { PageSection } from "../shell/page-header";
import {
  loadLatestRun,
  loadProfile,
  loadReadiness,
  loadWorkspace,
  websiteReaderStatus,
} from "./setup-data";
import {
  hoursSummary,
  isRunActive,
  nextPrerequisite,
  type Prerequisite,
  prerequisites,
  prerequisiteStateLabels,
  runCopy,
  siteName,
} from "./setup-model";
import type { SetupContext } from "./setup-screen";
import { SetupBlockState } from "./setup-states";

const sportWords = { beach: "Beach", indoor: "Indoor" } as const;

function markFor(workspace: OperatorWorkspace) {
  const theme = workspace.theme;
  return {
    name: theme.brandDisplayName ?? workspace.organization.name,
    color: theme.palette.primary,
    logo: theme.logoUrl ?? null,
    logoLight: theme.logoLightUrl ?? null,
    logoDark: theme.logoDarkUrl ?? null,
    tile: theme.markUrl ?? null,
  };
}

/** What the club IS: its mark, name, line, places and what it offers. */
export async function ClubSummary({
  context,
}: {
  readonly context: SetupContext;
}) {
  const [workspace, profile] = await Promise.all([
    loadWorkspace(),
    loadProfile(),
  ]);
  if (workspace.state !== "ok") {
    return (
      <PageSection id="club" title="Your club">
        <SetupBlockState
          loaded={workspace}
          organization={context.organization}
          retryHref={hqHref("setup")}
          what="your club"
        />
      </PageSection>
    );
  }
  const data = workspace.data;
  const venues = data.venues;
  const courts = venues.reduce(
    (total, venue) => total + venue.courts.length,
    0,
  );
  const live = data.catalog.filter((item) => item.status === "active").length;
  const drafts = data.catalog.filter((item) => item.status === "draft").length;
  const tagline =
    profile.state === "ok"
      ? (profile.data.tagline ?? data.theme.tagline)
      : data.theme.tagline;
  const hours =
    profile.state === "ok" && profile.data.hours.weekly.length > 0
      ? hoursSummary(profile.data.hours.weekly)
      : undefined;
  return (
    <section
      aria-labelledby="club-title"
      className={`setup-club ${riseClassName()}`}
    >
      <ClubMark {...markFor(data)} decorative size="xl" />
      <div className="setup-club__text">
        <h2 className="setup-club__name" id="club-title">
          {data.theme.brandDisplayName ?? data.organization.name}
        </h2>
        <p className="setup-club__line">
          {tagline ??
            "No tagline yet. Add one in Identity, or let Duna read it from your website."}
        </p>
        <ul className="setup-club__facts">
          <li>
            <Chip kind="taxonomy">
              {data.organization.volleyballTypes
                .map((sport) => sportWords[sport])
                .join(" and ")}
            </Chip>
          </li>
          <li>
            <Icon name="venue" size="inline" />
            {venues.length === 0
              ? "No places yet"
              : `${venues.length} place${venues.length === 1 ? "" : "s"} · ${courts} court${courts === 1 ? "" : "s"}`}
          </li>
          <li>
            <Icon name="lesson" size="inline" />
            {live + drafts === 0
              ? "Nothing on offer yet"
              : `${live} on sale${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}`}
          </li>
          {hours ? (
            <li>
              <Icon name="clock" size="inline" />
              {hours}
            </li>
          ) : null}
        </ul>
      </div>
      <Button href={hqHref("setupIdentity")} size="sm" variant="secondary">
        Edit club identity
      </Button>
    </section>
  );
}

/** Ask Duna as the faster path, without hiding the manual one. */
export async function AiStartBlock({
  context,
}: {
  readonly context: SetupContext;
}) {
  const [reader, latest, profile] = await Promise.all([
    websiteReaderStatus(),
    loadLatestRun(),
    loadProfile(),
  ]);
  const run: SetupRun | null = latest.state === "ok" ? latest.data : null;
  const website = profile.state === "ok" ? profile.data.websiteUrl : undefined;
  if (run && isRunActive(run)) {
    const copy = runCopy(run);
    return (
      <Notice
        action={
          <Button
            href={`${hqHref("setupReview")}?run=${run.id}`}
            size="sm"
            variant="secondary"
          >
            Watch the read
          </Button>
        }
        className="setup-ai"
        title={copy.title}
        tone="info"
      >
        {copy.body}
      </Notice>
    );
  }
  if (run && run.status === "review") {
    const copy = runCopy(run);
    return (
      <Notice
        action={
          <Button
            href={`${hqHref("setupReview")}?run=${run.id}`}
            size="sm"
            variant="primary"
          >
            Review what Duna found
          </Button>
        }
        className="setup-ai"
        title={copy.title}
        tone="info"
      >
        Nothing is added to {context.organization} until you keep it and apply.
      </Notice>
    );
  }
  return (
    <section
      aria-labelledby="setup-ai-title"
      className={`setup-ai-card ${riseClassName()}`}
    >
      <div className="setup-ai-card__text">
        <h2 className="setup-ai-card__title" id="setup-ai-title">
          Let Duna set up the rest
        </h2>
        <p>
          {website
            ? `Duna can read ${siteName(website)} again and propose anything that changed: places, hours, prices and people. You keep or skip each one.`
            : "Give Duna your website, or tell it about your club in a few sentences. It proposes your places, hours, offerings and team; you keep or skip each one."}
        </p>
        {reader === "not-configured" ? (
          <p className="setup-quiet">
            Duna&apos;s website reader isn&apos;t set up here yet. Everything
            can still be filled in by hand.
          </p>
        ) : null}
      </div>
      <div className="setup-ai-card__actions">
        {reader === "ready" ? (
          <>
            <Button
              href={`${hqHref("setupStart")}?path=describe`}
              variant="secondary"
            >
              Tell Duna about your club
            </Button>
            <Button
              href={`${hqHref("setupStart")}${website ? "?path=website" : ""}`}
              variant="primary"
            >
              {website ? "Read my website again" : "Read my website"}
            </Button>
          </>
        ) : (
          <Button
            href={`${hqHref("setupStart")}?path=hand`}
            variant="secondary"
          >
            Fill it in by hand
          </Button>
        )}
      </div>
    </section>
  );
}

function StateMark({ item }: { readonly item: Prerequisite }) {
  const icon =
    item.state === "done"
      ? "success"
      : item.state === "needs-you"
        ? "alert"
        : "minus";
  return (
    <span className="setup-step__mark" data-state={item.state}>
      <Icon name={icon} size="inline" />
      <span>{prerequisiteStateLabels[item.state]}</span>
    </span>
  );
}

/** The ordered list of real prerequisites, each with its state and one next action. */
export async function PrerequisiteList({
  context,
}: {
  readonly context: SetupContext;
}) {
  const [readiness, workspace] = await Promise.all([
    loadReadiness(),
    loadWorkspace(),
  ]);
  if (readiness.state !== "ok") {
    return (
      <PageSection id="steps" title="What's left">
        <SetupBlockState
          loaded={readiness}
          organization={context.organization}
          retryHref={hqHref("setup")}
          what="your setup steps"
        />
      </PageSection>
    );
  }
  const data = workspace.state === "ok" ? workspace.data : undefined;
  const list = prerequisites(readiness.data, {
    venues: data?.venues.length ?? 0,
    courts: data?.venues.reduce((t, v) => t + v.courts.length, 0) ?? 0,
    offerings:
      data?.catalog.filter((item) => item.status !== "archived").length ?? 0,
    liveOfferings:
      data?.catalog.filter((item) => item.status === "active").length ?? 0,
  });
  const next = nextPrerequisite(list);
  const required = list.filter((item) => item.state !== "optional");
  const doneCount = required.filter((item) => item.state === "done").length;
  return (
    <PageSection
      aside={
        <span className="setup-progress td-num">
          {doneCount} of {required.length} essentials done
        </span>
      }
      flush
      id="steps"
      title="What's left"
    >
      {readiness.data.bookingsOpen ? (
        <p className="setup-section-lead">
          Bookings are open. The rest can wait until you need it.
        </p>
      ) : (
        <p className="setup-section-lead">
          Bookings open once your places, hours, a first offering and Duna Pay
          are ready.
        </p>
      )}
      <ol className="setup-steps">
        {list.map((item, index) => (
          <li
            className={`setup-step ${riseClassName()}`}
            data-next={item.key === next?.key || undefined}
            data-state={item.state}
            key={item.key}
            style={rallyStyle(index)}
          >
            <StateMark item={item} />
            <div className="setup-step__text">
              <h3 className="setup-step__label">{item.label}</h3>
              <p className="setup-step__detail">{item.detail}</p>
              {item.blockedBy ? (
                <p className="setup-step__blocked">
                  <Icon name="info" size="inline" />
                  {item.blockedBy.label}.{" "}
                  <Link className="setup-link" href={item.blockedBy.href}>
                    Set up Duna Pay
                  </Link>
                </p>
              ) : null}
            </div>
            <Button href={item.action.href} size="sm" variant="secondary">
              {item.action.label}
            </Button>
          </li>
        ))}
      </ol>
    </PageSection>
  );
}

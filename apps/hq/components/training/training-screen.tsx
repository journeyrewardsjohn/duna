import type { TrainingProgramsProgram } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  buttonClassName,
  ErrorState,
  NotConfigured,
  ObjectHeader,
  OfflineBanner,
  Skeleton,
  SkeletonListRow,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { renderLink } from "../money/money-link";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import {
  dateRangeWords,
  patternSentence,
  programStateCopy,
  weekWords,
} from "./program-model";
import {
  type Loaded,
  type TrainingContext,
  trainingContext,
} from "./training-data";
import { TrainingSubNav } from "./training-subnav";

export type TrainingTab = "programs" | "plans" | "drills";
export type ProgramTab =
  "overview" | "calendar" | "athletes" | "plans" | "settings";

/** The honest states a Training block can be in. A block in one shows no figure. */
export function TrainingBlockState({
  loaded,
  what,
  organization,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** "the programs", "this drill" */
  readonly what: string;
  readonly organization: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner or manager of ${organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          compact
          feature={what.replace(/^\w/, (c) => c.toUpperCase())}
          needs="Duna Database"
          owner={`an owner of ${organization}`}
        />
      );
    case "not-found":
      return (
        <p className="tr-quiet">{`Duna has no record of ${what} for ${organization}.`}</p>
      );
    case "error":
      return (
        <ErrorState
          compact
          message="Something went wrong on our side. Reload to try again; the rest of Training still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

export function TrainingRowsSkeleton({
  label,
  rows = 4,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="tr-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow key={index} lines={2} />
      ))}
    </div>
  );
}

/** A Training screen while it loads (route `loading.tsx`). */
export function TrainingLoading() {
  return (
    <div aria-busy="true" className="tr">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Training" lines={2} />
          </div>
        </div>
      </div>
      <div className="hqs-section">
        <TrainingRowsSkeleton label="Loading" rows={5} />
      </div>
    </div>
  );
}

export function deniedScreen(
  context: TrainingContext,
  area: string,
  title = "Training",
) {
  return (
    <div className="tr">
      <ShellPage askLabel="Training" askStarters={[]} />
      <PageHeader title={title} />
      <div className="hqs-state">
        <AccessDeniedState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/"
            >
              Back to HQ
            </Link>
          }
          area={area}
          grantedBy={`an owner or manager of ${context.organization}`}
        />
      </div>
    </div>
  );
}

export function trainingTabs(): SubNavItem[] {
  return [
    { id: "programs", label: "Programs", href: hqHref("training") },
    {
      id: "plans",
      label: "Practice plans",
      href: hqHref("trainingPracticePlans"),
    },
    { id: "drills", label: "Drill library", href: hqHref("trainingDrills") },
  ];
}

/**
 * A Training area screen: the one title, its line, the area's tabs
 * (Programs, Practice plans, Drill library), Ask Duna's page context and
 * the offline banner. Practice plans and drills need training:write
 * (coaches and up); someone without it gets "You need access".
 */
export async function TrainingScreen({
  tab,
  title,
  description,
  actions,
  askLabel,
  askStarters,
  crumb,
  parentHref,
  back,
  needsWrite = false,
  children,
}: {
  readonly tab: TrainingTab;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly crumb?: string;
  readonly parentHref?: string;
  readonly back?: { readonly href: string; readonly label: string };
  readonly needsWrite?: boolean;
  readonly children: ReactNode;
}) {
  const context = await trainingContext();
  if (context.session.access !== "operator") return null; // the shell says why
  if (!context.canRead) return deniedScreen(context, "Training");
  if (needsWrite && !context.canWrite) {
    return deniedScreen(
      context,
      tab === "drills" ? "the drill library" : "practice plans",
      tab === "drills" ? "Drill library" : "Practice plans",
    );
  }
  return (
    <div className="tr">
      <ShellPage
        askLabel={askLabel}
        askStarters={askStarters}
        crumb={crumb}
        parentHref={parentHref}
      />
      <PageHeader
        actions={actions}
        back={back}
        description={description}
        subnav={
          back ? undefined : (
            <TrainingSubNav
              current={tab}
              items={trainingTabs()}
              label="Training"
            />
          )
        }
        title={title}
      />
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}

/**
 * An open program (S3): ObjectHeader with the one title, its state, the
 * dates and weekly pattern, and its SubNav (Overview, Calendar, Athletes,
 * Plans, Settings).
 */
export function ProgramScreen({
  program,
  tab,
  actions,
  askStarters,
  counts,
  children,
}: {
  readonly program: TrainingProgramsProgram;
  readonly tab: ProgramTab;
  readonly actions?: ReactNode;
  readonly askStarters: readonly string[];
  readonly counts?: { readonly calendar?: number; readonly plans?: number };
  readonly children: ReactNode;
}) {
  const params = { programId: program.id };
  const state = programStateCopy(program.status);
  const items: SubNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: hqHref("trainingProgram", params),
    },
    {
      id: "calendar",
      label: "Calendar",
      href: hqHref("trainingProgramCalendar", params),
      ...(counts?.calendar ? { count: counts.calendar } : {}),
    },
    {
      id: "athletes",
      label: "Athletes",
      href: hqHref("trainingProgramAthletes", params),
      ...(program.counts.athletes > 0
        ? { count: program.counts.athletes }
        : {}),
    },
    {
      id: "plans",
      label: "Plans",
      href: hqHref("trainingProgramPlans", params),
      ...(program.counts.plansAttached > 0
        ? { count: program.counts.plansAttached }
        : {}),
    },
    {
      id: "settings",
      label: "Settings",
      href: hqHref("trainingProgramSettings", params),
    },
  ];
  const tabWords: Record<ProgramTab, string> = {
    overview: "",
    calendar: " calendar",
    athletes: " athletes",
    plans: " plans",
    settings: " settings",
  };
  return (
    <div className="tr">
      <ShellPage
        askLabel={`${program.title}${tabWords[tab]} (training program)`}
        askStarters={askStarters}
        crumb={program.title}
        parentHref={hqHref("training")}
      />
      <ObjectHeader
        actions={actions}
        back={{ href: hqHref("training"), label: "Programs" }}
        description={patternSentence(program.weeklySlots)}
        facts={[
          {
            label: "Dates",
            value: dateRangeWords(program.startDate, program.endDate),
          },
          { label: "Season", value: weekWords(program) },
          ...(program.leadCoach
            ? [{ label: "Lead coach", value: program.leadCoach.displayName }]
            : []),
          {
            label: "Athletes",
            value: String(program.counts.athletes),
            numeric: true,
          },
        ]}
        renderLink={renderLink}
        status={state}
        subnav={
          <TrainingSubNav current={tab} items={items} label={program.title} />
        }
        title={program.title}
      />
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}

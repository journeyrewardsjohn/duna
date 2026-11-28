import type { TeamAvailabilityCoverageGrid } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { buttonClassName, Notice, PartialData } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { PageSection } from "@/components/shell/page-header";
import { CoverageBoard } from "@/components/team/coverage-board";
import { loadCoverage, teamContext } from "@/components/team/team-data";
import {
  dayMonth,
  weekdayLong,
  weekdayShort,
  weekOrder,
} from "@/components/team/team-model";
import { TeamBlockState, TeamScreen } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Coverage" };

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "thu-18" → Thursday, 18:00 (the palette's "Who is free Thursday at 6?"). */
function parseAt(value: string | undefined) {
  const match = value?.match(/^(sun|mon|tue|wed|thu|fri|sat)-(\d{1,2})$/);
  if (!match) return undefined;
  const hour = Number(match[2]);
  if (hour < 0 || hour > 23) return undefined;
  return {
    weekday: dayKeys.indexOf(match[1] as (typeof dayKeys)[number]),
    hour,
  };
}

function hourWords(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${hour < 12 ? "AM" : "PM"}`;
}

function Grid({ grid }: { readonly grid: TeamAvailabilityCoverageGrid }) {
  const hours = [...new Set(grid.cells.map((cell) => cell.hour))].sort(
    (a, b) => a - b,
  );
  const cell = (weekday: number, hour: number) =>
    grid.cells.find((item) => item.weekday === weekday && item.hour === hour);
  if (hours.length === 0) {
    return <p className="team-quiet">Nothing is scheduled this week.</p>;
  }
  return (
    <div
      aria-label={`Week of ${dayMonth(grid.weekStartsOn)}`}
      className="team-grid-scroll"
      role="region"
      tabIndex={0}
    >
      <table className="team-grid">
        <caption className="team-quiet">
          {`Week of ${dayMonth(grid.weekStartsOn)}: sessions running, then coaches free.`}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="team-sr">Hour</span>
            </th>
            {weekOrder.map((weekday) => (
              <th key={weekday} scope="col">
                <abbr title={weekdayLong[weekday]}>
                  {weekdayShort[weekday]}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th className="team-num" scope="row">
                {hourWords(hour)}
              </th>
              {weekOrder.map((weekday) => {
                const value = cell(weekday, hour);
                if (
                  !value ||
                  (value.sessions === 0 && value.coachesFree === 0)
                ) {
                  return <td key={weekday} />;
                }
                return (
                  <td data-short={value.short || undefined} key={weekday}>
                    <span className="team-num">
                      {`${value.sessions} / ${value.coachesFree}`}
                    </span>
                    {value.short ? (
                      <span className="team-grid__short">
                        <Icon name="alert" size="chip" />
                        Short
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Team › Coverage (TM-Coverage): the next two weeks. Sessions that need
 * cover, with who the shared rule says is free and the fix in place; the
 * hour-by-hour grid of sessions against coaches free; and "Who is free…"
 * from the command palette. Honest when everything is covered.
 */
export default async function TeamCoveragePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ at?: string }>;
}) {
  const { at } = await searchParams;
  const context = await teamContext();
  const coverage = context.canSeeTeam ? await loadCoverage(context) : undefined;
  const asked = parseAt(at);
  const thisWeek =
    coverage?.state === "ok" ? coverage.data.weeks[0] : undefined;
  const askedCell =
    asked && thisWeek?.state === "ok"
      ? thisWeek.data.cells.find(
          (cell) => cell.weekday === asked.weekday && cell.hour === asked.hour,
        )
      : undefined;
  return (
    <TeamScreen
      askLabel="Team coverage, the next two weeks"
      askStarters={[
        "Who is free Thursday at 6?",
        "Which sessions still need a coach?",
        "Draft a message asking Noa to cover Saturday",
      ]}
      description="The next two weeks: sessions without a coach, and who is free to take them."
      tab="coverage"
      title="Coverage"
    >
      {asked ? (
        <Notice
          action={
            <Link
              className={buttonClassName({ size: "sm", variant: "ghost" })}
              href={hqHref("teamCoverage")}
            >
              Done
            </Link>
          }
          role="status"
          title={`Who is free ${weekdayLong[asked.weekday]} at ${hourWords(asked.hour)}?`}
          tone="info"
        >
          {thisWeek?.state !== "ok"
            ? "The week's coverage can't be read right now."
            : askedCell
              ? `${askedCell.coachesFree} ${askedCell.coachesFree === 1 ? "coach is" : "coaches are"} free then this week, with ${askedCell.sessions} ${askedCell.sessions === 1 ? "session" : "sessions"} running.`
              : "Nobody on the team has hours then this week, and nothing is scheduled."}{" "}
          Names come from each person&apos;s Availability page.
        </Notice>
      ) : null}
      <PageSection flush id="team-cover" title="Needs cover">
        {!coverage ? null : coverage.state !== "ok" ? (
          <TeamBlockState
            loaded={coverage}
            organization={context.organization}
            what="coverage"
          />
        ) : (
          <CoverageBoard
            canManage={context.canManage}
            initial={coverage.data.requests}
            timeZone={context.timeZone}
          />
        )}
      </PageSection>
      <PartialData
        missing={[
          "coaches booked twice at the same time",
          "sessions booked outside a coach's hours that no one has flagged",
        ]}
      />
      {coverage?.state === "ok"
        ? coverage.data.weeks.map((week, index) => (
            <PageSection
              id={`team-grid-${index}`}
              key={index}
              title={
                index === 0 ? "This week by the hour" : "Next week by the hour"
              }
            >
              {week.state === "ok" ? (
                <Grid grid={week.data} />
              ) : (
                <TeamBlockState
                  loaded={week}
                  organization={context.organization}
                  what="the week's coverage"
                />
              )}
            </PageSection>
          ))
        : null}
    </TeamScreen>
  );
}

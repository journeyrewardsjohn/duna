import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDeniedState } from "@/lib/access-state";
import { PageSection } from "@/components/shell/page-header";
import { loadHealthHistory } from "@/components/people/people-data";
import {
  firstName,
  HEALTH_DISCLAIMER,
  shortDate,
} from "@/components/people/people-model";
import {
  PeopleBlockState,
  PersonScreen,
  personPage,
} from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Health" };

function value(input: number | undefined, suffix = "", digits = 0): string {
  if (input === undefined) return "Not shared";
  const factor = 10 ** digits;
  return `${Math.round(input * factor) / factor}${suffix}`;
}

/** A small trend with its words: the chart never carries meaning alone. */
function Trend({
  label,
  values,
  suffix = "",
}: {
  readonly label: string;
  readonly values: readonly number[];
  readonly suffix?: string;
}) {
  if (values.length < 2) {
    return (
      <div className="people-trend">
        <p className="people-trend__label">{label}</p>
        <p className="people-quiet">Not enough shared days yet</p>
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const points = values
    .map((entry, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - (entry / max) * 30;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = Math.round(values[0]!);
  const last = Math.round(values.at(-1)!);
  const words = `${label}: from ${first}${suffix} to ${last}${suffix} over the last ${values.length} shared days`;
  return (
    <div className="people-trend">
      <p className="people-trend__label">{label}</p>
      <p className="people-num">{`${last}${suffix}`}</p>
      <svg
        aria-label={words}
        className="people-trend__chart"
        role="img"
        viewBox="0 0 100 40"
      >
        <path d="M0 36H100" />
        <polyline fill="none" points={points} />
      </svg>
    </div>
  );
}

/**
 * A person › Health: the read-only summary the person chose to share, for
 * exactly the viewers the Health service allows for this person (see
 * `healthAccess` in people-data.ts); never in a list or an export, under the
 * product's standing "not medical advice" wording. For anyone else this tab
 * does not exist; reaching the address says "You need access" and nothing
 * about the person's health.
 */
export default async function PersonHealthPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await personPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { record, context } = page;
  const { row, profile } = record;
  if (!record.canSeeHealth) {
    return (
      <PersonScreen askStarters={[]} page={page} tab="health">
        <div className="hqs-state">
          <AccessDeniedState
            area="Health"
            grantedBy="the person, who chooses in their Duna app who sees their health"
          />
        </div>
      </PersonScreen>
    );
  }
  const first = firstName(row.name);
  const now = new Date(context.now);
  const snapshot = profile.health;
  // With Duna Database this is the service's own answer for this viewer.
  const history = await loadHealthHistory(row.id);
  const detail = history.state === "ok" ? history.data : undefined;
  const metrics = {
    readinessScore:
      snapshot?.metrics?.readinessScore ?? detail?.intelligence.readiness.score,
    strainScore:
      snapshot?.metrics?.strainScore ?? detail?.intelligence.strain.score,
    restingHeartRate:
      snapshot?.metrics?.restingHeartRate ?? detail?.summary.restingHeartRate,
    heartRateVariabilityMs:
      snapshot?.metrics?.heartRateVariabilityMs ??
      detail?.summary.heartRateVariabilityMs,
    sleepHours: snapshot?.metrics?.sleepHours ?? detail?.summary.lastSleepHours,
    exerciseMinutes: snapshot?.metrics?.exerciseMinutes,
  };
  const daily = detail ? detail.daily.slice(0, 14).toReversed() : [];
  const pick = (key: "steps" | "activeEnergyKcal" | "sleepHours") =>
    daily.flatMap((day) => (day[key] === undefined ? [] : [day[key]!]));
  const figures: readonly [string, number | undefined, string, number][] = [
    ["Readiness", metrics.readinessScore, " / 10", 1],
    ["Strain", metrics.strainScore, " / 10", 1],
    ["Resting heart rate", metrics.restingHeartRate, " bpm", 0],
    ["Heart rate variability", metrics.heartRateVariabilityMs, " ms", 0],
    ["Sleep", metrics.sleepHours, " h", 1],
    ["Exercise", metrics.exerciseMinutes, " min", 0],
  ];
  const factors =
    detail?.intelligence.readiness.factors.filter(
      (factor) => factor.score !== undefined,
    ) ?? [];
  const scopes = snapshot?.scopes ?? detail?.access.scopes ?? [];
  return (
    <PersonScreen
      askStarters={[`How has ${first}'s training load changed this month?`]}
      page={page}
      tab="health"
    >
      <dl
        aria-label={`${first}'s shared health summary`}
        className="people-figures"
      >
        {figures.map(([label, figure, suffix, digits]) => (
          <div className="people-figure" key={label}>
            <dt>{label}</dt>
            <dd
              className={
                typeof figure === "number" ? "people-num" : "people-dd-quiet"
              }
            >
              {value(figure, suffix, digits)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="people-disclaimer">{HEALTH_DISCLAIMER}</p>
      <PageSection id="sharing" title="What is shared">
        <p className="people-body">
          {`${first} chose to share ${scopes.join(", ").replaceAll("-", " ")}${
            snapshot?.observedAt
              ? `. Last updated ${shortDate(snapshot.observedAt, context.timeZone, now)}`
              : ""
          }. ${first} can stop sharing at any time.`}
        </p>
        {(snapshot?.metrics?.readinessSummary ??
        detail?.intelligence.readiness.summary) ? (
          <p className="people-body">
            {snapshot?.metrics?.readinessSummary ??
              detail?.intelligence.readiness.summary}
          </p>
        ) : null}
        {factors.length > 0 ? (
          <ul className="people-facts-list">
            {factors.map((factor) => (
              <li key={factor.id}>
                <strong>{factor.label}</strong>
                <span>{factor.summary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </PageSection>
      <PageSection id="trends" title="Recent days">
        {history.state !== "ok" ? (
          history.state === "denied" ? (
            <p className="people-quiet">
              {`${first} shares a summary only, not the day-by-day history.`}
            </p>
          ) : (
            <PeopleBlockState
              loaded={history}
              organization={context.organization}
              what="the day-by-day history"
            />
          )
        ) : (
          <>
            <div className="people-trends">
              <Trend label="Steps" values={pick("steps")} />
              <Trend
                label="Active energy"
                suffix=" kcal"
                values={pick("activeEnergyKcal")}
              />
              <Trend label="Sleep" suffix=" h" values={pick("sleepHours")} />
            </div>
            {history.data.timeline.length > 0 ? (
              <ul className="people-timeline" aria-label="Shared timeline">
                {history.data.timeline.slice(0, 24).map((entry) => (
                  <li key={entry.id}>
                    <span className="people-timeline__what">
                      <strong>{entry.metric.replaceAll("-", " ")}</strong>
                      <span>
                        {entry.value === undefined
                          ? (entry.categoryValue ?? "Recorded")
                          : `${Math.round(entry.value * 10) / 10}${entry.unit ? ` ${entry.unit}` : ""}`}
                      </span>
                    </span>
                    <time dateTime={entry.startedAt}>
                      {shortDate(entry.startedAt, context.timeZone, now)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="people-disclaimer">{history.data.disclaimer}</p>
          </>
        )}
      </PageSection>
    </PersonScreen>
  );
}

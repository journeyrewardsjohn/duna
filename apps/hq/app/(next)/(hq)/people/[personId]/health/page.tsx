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
 * A person › Health: the read-only summary the person chose to share with
 * the club, for owners and managers only (never a junior's, never in a
 * list or an export), under the product's standing "not medical advice"
 * wording. For any other role this tab does not exist; reaching the address
 * says "You need access" and nothing about the person's health.
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
            grantedBy={`an owner or manager of ${context.organization}`}
          />
        </div>
      </PersonScreen>
    );
  }
  const first = firstName(row.name);
  const now = new Date(context.now);
  const snapshot = profile.health;
  const history = snapshot ? await loadHealthHistory(row.id) : undefined;
  const daily =
    history?.state === "ok" ? history.data.daily.slice(0, 14).toReversed() : [];
  const pick = (key: "steps" | "activeEnergyKcal" | "sleepHours") =>
    daily.flatMap((day) => (day[key] === undefined ? [] : [day[key]!]));
  return (
    <PersonScreen
      askStarters={[`How has ${first}'s training load changed this month?`]}
      page={page}
      tab="health"
    >
      {!snapshot ? (
        <PageSection id="health" title="Health summary">
          <p className="people-body">
            {`${first} doesn't share health with ${context.organization}. Only ${first} can choose to, from their Duna app, and can stop at any time.`}
          </p>
        </PageSection>
      ) : (
        <>
          <dl
            aria-label={`${first}'s shared health summary`}
            className="people-figures"
          >
            <div className="people-figure">
              <dt>Readiness</dt>
              <dd
                className={
                  typeof snapshot.metrics?.readinessScore === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.readinessScore, " / 10", 1)}
              </dd>
            </div>
            <div className="people-figure">
              <dt>Strain</dt>
              <dd
                className={
                  typeof snapshot.metrics?.strainScore === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.strainScore, " / 10", 1)}
              </dd>
            </div>
            <div className="people-figure">
              <dt>Resting heart rate</dt>
              <dd
                className={
                  typeof snapshot.metrics?.restingHeartRate === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.restingHeartRate, " bpm")}
              </dd>
            </div>
            <div className="people-figure">
              <dt>Heart rate variability</dt>
              <dd
                className={
                  typeof snapshot.metrics?.heartRateVariabilityMs === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.heartRateVariabilityMs, " ms")}
              </dd>
            </div>
            <div className="people-figure">
              <dt>Sleep</dt>
              <dd
                className={
                  typeof snapshot.metrics?.sleepHours === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.sleepHours, " h", 1)}
              </dd>
            </div>
            <div className="people-figure">
              <dt>Exercise</dt>
              <dd
                className={
                  typeof snapshot.metrics?.exerciseMinutes === "number"
                    ? "people-num"
                    : "people-dd-quiet"
                }
              >
                {value(snapshot.metrics?.exerciseMinutes, " min")}
              </dd>
            </div>
          </dl>
          <p className="people-disclaimer">{HEALTH_DISCLAIMER}</p>
          <PageSection id="sharing" title="What is shared">
            <p className="people-body">
              {`${first} chose to share ${snapshot.scopes.join(", ").replaceAll("-", " ")} with the club${
                snapshot.observedAt
                  ? `. Last updated ${shortDate(snapshot.observedAt, context.timeZone, now)}`
                  : ""
              }. ${first} can stop sharing at any time.`}
            </p>
            {snapshot.metrics?.readinessSummary ? (
              <p className="people-body">{snapshot.metrics.readinessSummary}</p>
            ) : null}
          </PageSection>
          <PageSection id="trends" title="Recent days">
            {history && history.state !== "ok" ? (
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
              <div className="people-trends">
                <Trend label="Steps" values={pick("steps")} />
                <Trend
                  label="Active energy"
                  suffix=" kcal"
                  values={pick("activeEnergyKcal")}
                />
                <Trend label="Sleep" suffix=" h" values={pick("sleepHours")} />
              </div>
            )}
            {history?.state === "ok" ? (
              <p className="people-disclaimer">{history.data.disclaimer}</p>
            ) : null}
          </PageSection>
        </>
      )}
    </PersonScreen>
  );
}

import type { HealthProfile } from "@duna/api";
import {
  Activity,
  ArrowLeft,
  HeartPulse,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

function metric(value: number | undefined, suffix = "") {
  return value === undefined ? "—" : `${Math.round(value)}${suffix}`;
}

function Trend({
  label,
  values,
  suffix = "",
}: {
  readonly label: string;
  readonly values: readonly number[];
  readonly suffix?: string;
}) {
  const maximum = Math.max(...values, 1);
  const points = values.length
    ? values
        .map((value, index) => {
          const x =
            values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
          const y = 36 - (value / maximum) * 30;
          return `${x},${y}`;
        })
        .join(" ")
    : "";
  return (
    <article className="member-health-trend">
      <header>
        <span>{label}</span>
        <strong>
          {values.length ? `${Math.round(values.at(-1) ?? 0)}${suffix}` : "—"}
        </strong>
      </header>
      <svg
        aria-label={`${label} over the selected health history`}
        role="img"
        viewBox="0 0 100 40"
      >
        <path d="M0 36H100" />
        {points && <polyline fill="none" points={points} />}
      </svg>
    </article>
  );
}

export function MemberHealthDetails({
  profile,
}: {
  readonly profile: HealthProfile;
}) {
  const daily = profile.daily.slice(0, 14).toReversed();
  return (
    <main className="hq-page member-health-details">
      <Link
        className="member-profile-back"
        href={`/members/${profile.subject.id}`}
      >
        <ArrowLeft aria-hidden size={16} /> Back to player profile
      </Link>
      <header className="member-health-details__hero hq-card">
        <span>
          <HeartPulse aria-hidden size={24} />
        </span>
        <div>
          <span className="hq-eyebrow">Health details</span>
          <h1>{profile.subject.displayName}</h1>
          <p>
            Complete view of the health categories and scopes this player chose
            to share with your organization.
          </p>
        </div>
        <span className="member-health-details__access">
          <ShieldCheck aria-hidden size={15} />{" "}
          {profile.access.scopes.join(" · ")}
        </span>
      </header>

      <section
        className="member-health-details__metrics"
        aria-label="Latest health metrics"
      >
        <article>
          <small>Readiness</small>
          <strong>
            {metric(profile.intelligence.readiness.score, " / 10")}
          </strong>
          <span>
            {profile.intelligence.readiness.label.replaceAll("-", " ")}
          </span>
        </article>
        <article>
          <small>Strain</small>
          <strong>{metric(profile.intelligence.strain.score, " / 10")}</strong>
          <span>{profile.intelligence.strain.label.replaceAll("-", " ")}</span>
        </article>
        <article>
          <small>Resting heart rate</small>
          <strong>{metric(profile.summary.restingHeartRate, " bpm")}</strong>
          <span>latest shared value</span>
        </article>
        <article>
          <small>HRV</small>
          <strong>
            {metric(profile.summary.heartRateVariabilityMs, " ms")}
          </strong>
          <span>latest shared value</span>
        </article>
      </section>

      <section className="hq-card member-health-details__insights">
        <header>
          <span>
            <Sparkles aria-hidden size={18} />
          </span>
          <div>
            <span className="hq-eyebrow">Duna AI insights</span>
            <h2>
              {profile.intelligence.readiness.summary ??
                "Duna is building a personal baseline from the shared history."}
            </h2>
          </div>
        </header>
        <div>
          {profile.intelligence.readiness.factors
            .filter((factor) => factor.score !== undefined)
            .map((factor) => (
              <article key={factor.id}>
                <strong>{factor.label}</strong>
                <p>{factor.summary}</p>
              </article>
            ))}
        </div>
        <p className="member-health-consent">{profile.disclaimer}</p>
      </section>

      <section
        className="member-health-details__trends"
        aria-label="Health trends"
      >
        <Trend
          label="Steps"
          values={daily.flatMap((day) =>
            day.steps === undefined ? [] : [day.steps],
          )}
        />
        <Trend
          label="Active energy"
          suffix=" kcal"
          values={daily.flatMap((day) =>
            day.activeEnergyKcal === undefined ? [] : [day.activeEnergyKcal],
          )}
        />
        <Trend
          label="Strain"
          values={
            profile.intelligence.trends
              .find((trend) => trend.metric === "strain")
              ?.points.map((point) => point.value) ?? []
          }
        />
        <Trend
          label="Sleep"
          suffix=" h"
          values={daily.flatMap((day) =>
            day.sleepHours === undefined ? [] : [day.sleepHours],
          )}
        />
      </section>

      <section className="hq-card member-health-details__timeline">
        <header>
          <Activity aria-hidden size={19} />
          <span>
            <span className="hq-eyebrow">Shared timeline</span>
            <h2>Recent health activity</h2>
          </span>
        </header>
        {profile.timeline.length ? (
          <div>
            {profile.timeline.slice(0, 24).map((entry) => (
              <article key={entry.id}>
                <time>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(entry.startedAt))}
                </time>
                <strong>{entry.metric.replaceAll("-", " ")}</strong>
                <span>
                  {entry.value === undefined
                    ? (entry.categoryValue ?? "Recorded")
                    : `${Math.round(entry.value * 10) / 10}${entry.unit ? ` ${entry.unit}` : ""}`}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p>
            No detailed timeline is shared. The player has chosen summary-only
            access.
          </p>
        )}
      </section>
    </main>
  );
}

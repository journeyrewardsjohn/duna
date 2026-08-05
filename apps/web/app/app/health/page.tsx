import { buildHealthIntelligence, type HealthDashboard } from "@duna/api";
import {
  ArrowUpRight,
  BrainCircuit,
  HeartPulse,
  LockKeyhole,
  MoonStar,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";
import { HealthCheckInForm } from "./health-check-in";

type Intelligence = HealthDashboard["intelligence"];
type Trend = Intelligence["trends"][number];

function baselineDashboard(now: Date): HealthDashboard {
  return {
    subject: {
      id: "41a181e8-8103-49f4-bdeb-a71e693295f2",
      displayName: "Duna player",
    },
    access: {
      owner: true,
      categories: ["heart", "recovery", "activity", "body"],
      scopes: ["summary", "timeline", "video-overlay"],
    },
    summary: {},
    daily: [],
    timeline: [],
    matches: [],
    correlations: [],
    intelligence: buildHealthIntelligence({
      samples: [],
      timezone: "UTC",
      now,
    }),
    disclaimer:
      "Duna Readiness and Strain are individualized performance context—not medical advice, diagnosis, injury prediction, or a direction to train. Wearable sleep stages are estimates. Correlations do not establish cause.",
    grants: [],
    candidates: [],
  };
}

function readinessTitle(label: Intelligence["readiness"]["label"]): string {
  if (label === "primed") return "Your signals are strongly aligned.";
  if (label === "balanced") return "Your body is in balance.";
  if (label === "recovery-favored") return "Recovery deserves the lead today.";
  if (label === "building") return "A mixed day—worth observing.";
  return "Your personal baseline is taking shape.";
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function TrendChart({ trend }: { readonly trend: Trend }) {
  const width = 640;
  const height = 220;
  const insetX = 18;
  const insetY = 18;
  const rangeValues = [
    ...trend.points.map((point) => point.value),
    ...(trend.typicalLow === undefined ? [] : [trend.typicalLow]),
    ...(trend.typicalHigh === undefined ? [] : [trend.typicalHigh]),
  ];
  const minimum = Math.min(...rangeValues, 0);
  const maximum = Math.max(...rangeValues, 1);
  const padding = Math.max((maximum - minimum) * 0.14, 0.5);
  const floor = minimum - padding;
  const ceiling = maximum + padding;
  const x = (index: number) =>
    insetX +
    (index / Math.max(1, trend.points.length - 1)) * (width - insetX * 2);
  const y = (value: number) =>
    insetY +
    ((ceiling - value) / Math.max(0.001, ceiling - floor)) *
      (height - insetY * 2);
  const path = trend.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`,
    )
    .join(" ");
  const area = path
    ? `${path} L ${x(trend.points.length - 1).toFixed(1)} ${height - insetY} L ${insetX} ${height - insetY} Z`
    : "";
  const bandTop =
    trend.typicalHigh === undefined ? undefined : y(trend.typicalHigh);
  const bandBottom =
    trend.typicalLow === undefined ? undefined : y(trend.typicalLow);
  return (
    <div
      className="health-chart"
      role="img"
      aria-label={`${trend.label} trend`}
    >
      {trend.points.length > 1 ? (
        <svg viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient
              id={`web-${trend.metric}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0" stopColor="#49d7ca" stopOpacity=".38" />
              <stop offset="1" stopColor="#dffb83" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {bandTop !== undefined && bandBottom !== undefined && (
            <rect
              className="health-chart__band"
              height={Math.max(3, bandBottom - bandTop)}
              rx="7"
              width={width - insetX * 2}
              x={insetX}
              y={bandTop}
            />
          )}
          <path d={area} fill={`url(#web-${trend.metric})`} />
          <path className="health-chart__line" d={path} fill="none" />
          {trend.points.map((point, index) => (
            <circle
              className={point.anomaly ? "anomaly" : undefined}
              cx={x(index)}
              cy={y(point.value)}
              key={`${point.date}-${index}`}
              r={point.anomaly ? 5 : 3.5}
            />
          ))}
        </svg>
      ) : (
        <p className="health-chart__empty">
          More days will reveal your personal band.
        </p>
      )}
    </div>
  );
}

function TrendCard({ trend }: { readonly trend: Trend }) {
  return (
    <article className="health-trend-card">
      <header>
        <div>
          <span className="health-kicker">Personal trend</span>
          <h3>{trend.label}</h3>
          <p>{trend.description}</p>
        </div>
        <div className="health-trend-card__latest">
          <strong>
            {trend.latest?.toFixed(trend.unit === "score" ? 1 : 0) ?? "—"}
          </strong>
          <small>{trend.unit}</small>
        </div>
      </header>
      <TrendChart trend={trend} />
      <footer>
        <span>
          <i /> Typical band
        </span>
        <strong>
          Avg {trend.average?.toFixed(1) ?? "—"} ·{" "}
          {trend.typicalLow?.toFixed(1) ?? "—"}–
          {trend.typicalHigh?.toFixed(1) ?? "—"} {trend.unit}
        </strong>
      </footer>
    </article>
  );
}

function SleepCard({
  sleep,
}: {
  readonly sleep: NonNullable<Intelligence["sleep"]>;
}) {
  const stages = [
    { label: "Awake", minutes: sleep.awakeMinutes, className: "awake" },
    { label: "Core", minutes: sleep.coreMinutes, className: "core" },
    { label: "Deep", minutes: sleep.deepMinutes, className: "deep" },
    { label: "REM", minutes: sleep.remMinutes, className: "rem" },
  ];
  const total = stages.reduce((sum, stage) => sum + (stage.minutes ?? 0), 0);
  return (
    <article className="health-sleep-card">
      <header>
        <div>
          <span className="health-kicker">Sleep · wearable estimate</span>
          <h2>{sleep.durationHours.toFixed(1)} hours asleep</h2>
        </div>
        <span>{sleep.label.replace("-", " ")}</span>
      </header>
      {total > 0 && (
        <div
          className="health-sleep-stages"
          aria-label="Estimated sleep stages"
        >
          {stages.map((stage) =>
            !stage.minutes ? null : (
              <i
                className={stage.className}
                key={stage.label}
                style={{ width: `${(stage.minutes / total) * 100}%` }}
              />
            ),
          )}
        </div>
      )}
      <div className="health-sleep-legend">
        {stages.map((stage) => (
          <span className={stage.className} key={stage.label}>
            <i /> {stage.label}{" "}
            <strong>
              {stage.minutes ? `${Math.round(stage.minutes)}m` : "—"}
            </strong>
          </span>
        ))}
      </div>
      <div className="health-sleep-stats">
        <span>
          <strong>{sleep.efficiencyPercent ?? "—"}%</strong>
          continuity
        </span>
        <span>
          <strong>{sleep.interruptions ?? "—"}</strong>
          interruptions
        </span>
        <span>
          <strong>{sleep.regularityMinutes ?? "—"}m</strong>
          from usual
        </span>
      </div>
      <p>{sleep.summary}</p>
      <small>{sleep.estimateNote}</small>
    </article>
  );
}

export default async function HealthPage() {
  const now = new Date();
  const caller = await getServerCaller();
  const dashboard = process.env.DATABASE_URL
    ? await caller.player.healthDashboard()
    : baselineDashboard(now);
  const { intelligence } = dashboard;
  const readiness = intelligence.readiness;
  const timezone = dashboard.connection?.timezone ?? "UTC";
  const today = localDate(now, timezone);
  const sleep = intelligence.sleep;
  const strain = intelligence.strain;
  const historyCount = dashboard.connection?.importedSampleCount ?? 0;
  return (
    <main className="health-page">
      <header className="health-page__heading">
        <div>
          <span className="health-kicker">
            Duna Health · private by default
          </span>
          <h1>Your body, interpreted around your game.</h1>
          <p>
            Personal trends, match context, and explainable readiness—without
            pretending one population target fits every athlete.
          </p>
        </div>
        <div className="health-page__status">
          <span
            className={
              dashboard.connection?.status === "active" ? "active" : undefined
            }
          />
          {dashboard.connection?.status === "active"
            ? "Apple Health connected"
            : "Connect in the Duna iPhone app"}
        </div>
      </header>

      {dashboard.connection?.status === "active" && (
        <section className="health-history-banner">
          <ShieldCheck aria-hidden />
          <div>
            <strong>
              {historyCount.toLocaleString()} encrypted records securely stored
            </strong>
            <span>
              {dashboard.connection.earliestSampleAt
                ? `History reaches ${new Date(dashboard.connection.earliestSampleAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}. `
                : ""}
              Apple Watch, WHOOP, and other HealthKit writers retain source
              attribution.
            </span>
          </div>
        </section>
      )}

      <section className="health-hero-grid">
        <article className="health-readiness-hero">
          <div className="health-orb health-orb--a" />
          <div className="health-orb health-orb--b" />
          <span className="health-kicker">
            Readiness ·{" "}
            {readiness.date === today
              ? "today"
              : `as of ${new Date(`${readiness.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </span>
          <div className="health-readiness-hero__score">
            <strong>{readiness.score?.toFixed(1) ?? "—"}</strong>
            <span>/ 10.0</span>
          </div>
          <div className="health-readiness-hero__state">
            <i /> {readiness.label.replace("-", " ")}
          </div>
          <h2>{readinessTitle(readiness.label)}</h2>
          <p>{readiness.summary}</p>
          <small>
            {readiness.dataDays} personal data days · {readiness.confidence}{" "}
            confidence · {intelligence.modelVersion}
          </small>
        </article>

        <article className="health-factors">
          <header>
            <div>
              <span className="health-kicker">Your signals</span>
              <h2>Why today feels this way.</h2>
            </div>
            <BrainCircuit aria-hidden />
          </header>
          {readiness.factors.map((factor) => (
            <div className="health-factor" key={factor.id}>
              <div>
                <strong>{factor.label}</strong>
                <span>{factor.score?.toFixed(1) ?? "—"}</span>
              </div>
              <i>
                <b
                  className={factor.status === "watch" ? "watch" : undefined}
                  style={{
                    width: `${Math.max(0, Math.min(100, (factor.score ?? 0) * 10))}%`,
                  }}
                />
              </i>
              <p>{factor.summary}</p>
            </div>
          ))}
        </article>
      </section>

      {readiness.recommendation && (
        <section className="health-experiment">
          <Sparkles aria-hidden />
          <div>
            <span className="health-kicker">One small experiment</span>
            <strong>{readiness.recommendation}</strong>
          </div>
          <span>Observe · don’t overreact</span>
        </section>
      )}

      <section className="health-section-heading">
        <div>
          <span className="health-kicker">Personal bands</span>
          <h2>Trend, range, anomaly.</h2>
        </div>
        <p>
          Shading is learned from you. Coral points sit outside your recent
          typical band.
        </p>
      </section>
      <section className="health-trends">
        {intelligence.trends.slice(0, 6).map((trend) => (
          <TrendCard key={trend.metric} trend={trend} />
        ))}
      </section>

      <section className="health-depth-grid">
        {sleep ? (
          <SleepCard sleep={sleep} />
        ) : (
          <article className="health-empty-depth">
            <MoonStar aria-hidden />
            <h2>Sleep detail is still forming.</h2>
            <p>
              Duna will never invent Deep or REM stages when a source only
              provides time asleep.
            </p>
          </article>
        )}
        <article className="health-strain-card">
          <header>
            <div>
              <span className="health-kicker">Duna Strain</span>
              <div>
                <strong>{strain.score?.toFixed(1) ?? "—"}</strong>
                <span>/ 10.0</span>
              </div>
            </div>
            <Waves aria-hidden />
          </header>
          <i className="health-strain-meter">
            <b style={{ width: `${(strain.score ?? 0) * 10}%` }} />
          </i>
          <p>{strain.summary}</p>
          <div className="health-strain-compare">
            <span>
              <strong>{strain.recentThreeDayAverage ?? "—"}</strong>
              3-day load
            </span>
            <i>vs</i>
            <span>
              <strong>{strain.baselineTwentyEightDayAverage ?? "—"}</strong>
              28-day average
            </span>
          </div>
          <small>
            Uses workout heart-rate zones when available, with session effort as
            a beach-volleyball-specific fallback. It is not an injury-risk
            score.
          </small>
        </article>
      </section>

      <section className="health-match-impact">
        <header>
          <div>
            <span className="health-kicker">Performance context</span>
            <h2>What surrounded your matches.</h2>
          </div>
          <p>
            Associations need repeated matches. Duna waits for at least five
            outcomes and never labels a correlation as cause.
          </p>
        </header>
        <div className="health-match-impact__layout">
          <div className="health-match-list">
            {dashboard.matches.length > 0 ? (
              dashboard.matches.slice(0, 6).map((match) => (
                <article key={match.matchId}>
                  <div>
                    <time>
                      {new Date(match.occurredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <span className={match.result}>{match.result}</span>
                  </div>
                  <h3>{match.label}</h3>
                  <dl>
                    <div>
                      <dt>Sleep</dt>
                      <dd>{match.sleepHours?.toFixed(1) ?? "—"}h</dd>
                    </div>
                    <div>
                      <dt>HRV</dt>
                      <dd>{match.heartRateVariabilityMs ?? "—"} ms</dd>
                    </div>
                    <div>
                      <dt>Match HR</dt>
                      <dd>{match.averageMatchHeartRate ?? "—"} bpm</dd>
                    </div>
                    <div>
                      <dt>Pre energy</dt>
                      <dd>{match.activeEnergyKcalBefore ?? "—"} kcal</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <article className="health-match-empty">
                <HeartPulse aria-hidden />
                <h3>Connect completed matches to unlock context.</h3>
                <p>
                  Duna will align the preceding sleep, HRV, load, and in-match
                  heart-rate window when the timestamps overlap.
                </p>
              </article>
            )}
          </div>
          <aside className="health-patterns">
            <span className="health-kicker">Early patterns</span>
            <h3>Insight only when the sample earns it.</h3>
            {dashboard.correlations.length > 0 ? (
              dashboard.correlations.map((correlation) => (
                <div key={correlation.metric}>
                  <strong>{correlation.metric.replaceAll("-", " ")}</strong>
                  <span>
                    {correlation.sampleSize} matches · r{" "}
                    {correlation.coefficient.toFixed(2)}
                  </span>
                  <p>{correlation.interpretation}</p>
                </div>
              ))
            ) : (
              <p>
                There is not enough repeated match data for a responsible
                performance association yet. Your readiness score does not use
                wins and losses as proof of recovery.
              </p>
            )}
          </aside>
        </div>
      </section>

      <HealthCheckInForm date={today} latest={dashboard.latestCheckIn} />

      <section className="health-method-grid">
        <article className="health-method">
          <header>
            <HeartPulse aria-hidden />
            <div>
              <span className="health-kicker">Method</span>
              <h2>Explainable by design.</h2>
            </div>
          </header>
          <p>{intelligence.sourceNote}</p>
          <ul>
            <li>Apple Health HRV stays correctly labeled as SDNN.</li>
            <li>
              Stage detail is shown only when a wearable actually supplies it.
            </li>
            <li>
              No fixed eight-hour sleep rule and no acute-to-chronic injury
              prediction.
            </li>
            <li>
              Recommendations appear only when a supported personal anomaly
              exists.
            </li>
          </ul>
        </article>
        <article className="health-sharing-summary">
          <header>
            <LockKeyhole aria-hidden />
            <div>
              <span className="health-kicker">Sharing</span>
              <h2>You control the audience.</h2>
            </div>
          </header>
          <p>
            {dashboard.grants.length === 0
              ? "No coach, player, club, or organization can see your Health summary."
              : `${dashboard.grants.length} active Health sharing ${dashboard.grants.length === 1 ? "grant" : "grants"}. Each one is time-limited and separately scoped.`}
          </p>
          {dashboard.grants.map((grant) => (
            <div key={grant.id}>
              <strong>{grant.audience.label}</strong>
              <span>
                {grant.categories.join(" + ")} · expires{" "}
                {new Date(grant.expiresAt).toLocaleDateString()}
              </span>
            </div>
          ))}
          <Link href="/app/settings">
            Review privacy settings <ArrowUpRight aria-hidden />
          </Link>
        </article>
      </section>

      <section className="health-research">
        <header>
          <div>
            <span className="health-kicker">Published research</span>
            <h2>Transparent enough to challenge.</h2>
          </div>
          <p>
            Primary research and Apple documentation used to shape—not
            overstate—the model.
          </p>
        </header>
        <div>
          {intelligence.citations.map((citation) => (
            <a
              href={citation.url}
              key={citation.id}
              rel="noreferrer"
              target="_blank"
            >
              <span>{citation.section}</span>
              <strong>{citation.title}</strong>
              <p>{citation.takeaway}</p>
              <small>
                {citation.authors} · {citation.year}
              </small>
              <ArrowUpRight aria-hidden />
            </a>
          ))}
        </div>
      </section>
      <p className="health-disclaimer">{dashboard.disclaimer}</p>
    </main>
  );
}

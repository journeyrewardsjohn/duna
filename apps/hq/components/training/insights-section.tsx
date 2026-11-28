import type { TrainingWorkspace } from "@duna/api/training-contracts";
import { Chip } from "@duna/ui/tideline";

type Insights = TrainingWorkspace["insights"];

const focusWords = (focus: string) =>
  focus.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Training insights, from the same read the old Insights tab used
 * (`operator.trainingWorkspace`): the headline figures, where the minutes
 * went and planned against delivered load by week. Across the whole club;
 * load is an estimate. Empty when nothing has been planned or recorded.
 */
export function InsightsSection({ insights }: { readonly insights: Insights }) {
  const empty =
    insights.headline.length === 0 &&
    insights.focusDistribution.length === 0 &&
    insights.weeklyLoad.length === 0;
  if (empty) {
    return (
      <p className="tr-quiet">
        No practices have been planned or recorded yet, so there is nothing to
        show.
      </p>
    );
  }
  const max = Math.max(
    1,
    ...insights.weeklyLoad.map((week) =>
      Math.max(week.planned, week.actual ?? 0),
    ),
  );
  return (
    <div className="tr-stack">
      {insights.headline.length > 0 ? (
        <dl aria-label="Headline figures" className="tr-figures">
          {insights.headline.slice(0, 4).map((metric) => (
            <div className="tr-figure" key={metric.id}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <span className="tr-quiet">{metric.detail}</span>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="tr-quiet">
        {`${insights.totalMinutes} minutes planned`}
        {insights.athleteResponseRate !== undefined
          ? ` · ${Math.round(insights.athleteResponseRate)}% of athletes responded`
          : ""}
      </p>
      {insights.focusDistribution.length > 0 ? (
        <div className="tr-stack">
          <h3 className="tr-h3">Where the minutes went (last 28 days)</h3>
          <ul aria-label="Minutes by focus" className="tr-chips">
            {insights.focusDistribution.map((row) => (
              <li key={row.focusArea}>
                <Chip kind="metric">{`${focusWords(row.focusArea)} ${Math.round(row.percent)}%`}</Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {insights.weeklyLoad.length > 0 ? (
        <div className="tr-stack">
          <h3 className="tr-h3">
            Planned and delivered load by week (estimates)
          </h3>
          <ol
            aria-label="Planned and delivered load by week"
            className="tr-weeks"
          >
            {insights.weeklyLoad.map((week) => (
              <li className="tr-week" key={week.week}>
                <span
                  aria-hidden="true"
                  className="tr-week__bar"
                  data-phase={week.tournament ? "taper" : "build"}
                  style={{
                    blockSize: `${Math.max(4, (week.planned / max) * 100)}%`,
                  }}
                />
                <span className="tr-week__load">
                  {week.actual !== undefined
                    ? `${week.planned}/${week.actual}`
                    : week.planned}
                </span>
                <span className="tr-week__label">{week.week}</span>
                <span className="tr-week__phase">
                  {week.tournament ? "Event" : ""}
                </span>
                <span className="tr-sr">
                  {`${week.week}: planned ${week.planned}${week.actual !== undefined ? `, delivered ${week.actual}` : ", not recorded"}${week.tournament ? ", tournament week" : ""}`}
                </span>
              </li>
            ))}
          </ol>
          <p className="tr-quiet">
            Planned / delivered. Delivered load comes from after-practice
            records.
          </p>
        </div>
      ) : null}
    </div>
  );
}

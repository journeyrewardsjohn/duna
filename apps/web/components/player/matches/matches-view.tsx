import type { PersonSummary } from "@duna/core";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  RatingRing,
  type TidelineTone,
} from "@duna/ui/tideline";
import { AppLink } from "@/components/app-shell/navigation";
import { ringProps, WHAT_COUNTS } from "../result-copy";
import type { HistoryModel, HistoryRow } from "./history-model";

const CHIP_TONE: Readonly<
  Record<HistoryRow["state"], TidelineTone | "neutral">
> = {
  awaiting: "warning",
  confirmed: "positive",
  disputed: "danger",
  expired: "warning",
  history: "neutral",
};

function Row({ row }: { readonly row: HistoryRow }) {
  const label = `${row.won === null ? "" : row.won ? "Won" : "Lost"} against ${row.opponents || "the other side"}, ${row.day}`;
  return (
    <li>
      <AppLink aria-label={label} className="pp-result" href={row.href}>
        <span className="pp-result__day">{row.day}</span>
        <span className="pp-result__who">
          <span className="pp-result__title">
            {row.won === null ? "" : row.won ? "Won" : "Lost"}
            {row.opponents ? ` v ${row.opponents}` : ""}
          </span>
          <span className="td-meta">
            {[row.partners ? `With ${row.partners}` : null, row.venue]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="pp-result__score td-num">
          {row.sets.map(([a, b]) => `${a}–${b}`).join(", ")}
        </span>
        <span className="pp-result__state">
          <Chip kind="status" tone={CHIP_TONE[row.state]}>
            {row.chip}
          </Chip>
          {row.change ? (
            <span className="pp-result__change td-num">{row.change}</span>
          ) : row.note && row.note !== row.chip ? (
            <span className="td-meta">{row.note}</span>
          ) : null}
        </span>
      </AppLink>
    </li>
  );
}

export function MatchesView({
  model,
  me,
  actingFor,
  onDay,
}: {
  readonly model: HistoryModel;
  readonly me: PersonSummary;
  readonly actingFor: string | null;
  readonly onDay?: string;
}) {
  if (actingFor) {
    return (
      <Notice tone="info" title={`${actingFor}’s results aren’t here yet`}>
        A guardian can’t read a junior’s results from their own account yet.
        These are yours: switch back to your account to see them.
      </Notice>
    );
  }
  const ring = ringProps({ rating: me.rating });
  return (
    <>
      <section aria-labelledby="pp-rating" className="pp-split">
        <Card className="pp-rating">
          <RatingRing
            label="Sand Rating"
            reliability={ring.reliability}
            size="card"
            value={ring.value}
            {...(ring.delta !== undefined ? { delta: ring.delta } : {})}
          />
          <div className="pp-rating__text">
            <h2 className="pp-h2" id="pp-rating">
              Your Sand Rating
            </h2>
            {WHAT_COUNTS.map((sentence) => (
              <p className="td-meta" key={sentence}>
                {sentence}
              </p>
            ))}
          </div>
        </Card>
        <Card className="pp-form">
          <h2 className="pp-h2">Your form</h2>
          {model.form.length === 0 ? (
            <p className="td-meta">Your last ten results show here.</p>
          ) : (
            <>
              <ol
                aria-label="Last results, newest first"
                className="pp-formline"
              >
                {model.form.map((result, index) => (
                  <li
                    aria-label={result === "W" ? "Won" : "Lost"}
                    className={`pp-formline__item pp-formline__item--${result === "W" ? "won" : "lost"}`}
                    key={index}
                  >
                    {result}
                  </li>
                ))}
              </ol>
              <p className="td-meta td-num">
                {model.wins} won · {model.losses} lost
                {model.wins + model.losses > 0
                  ? ` · ${Math.round((model.wins / (model.wins + model.losses)) * 100)}% won`
                  : ""}
              </p>
            </>
          )}
          {model.partner ? (
            <p className="td-meta">
              Most often with {model.partner.name}:{" "}
              <span className="td-num">
                {model.partner.wins}–
                {model.partner.matches - model.partner.wins}
              </span>{" "}
              together.
            </p>
          ) : null}
        </Card>
      </section>

      {model.needsMe.length > 0 ? (
        <section aria-labelledby="pp-needs" className="pp-section">
          <h2 className="pp-h2" id="pp-needs">
            Waiting for a confirmation
          </h2>
          <ul className="pp-list">
            {model.needsMe.map((row) => (
              <Row key={`needs-${row.id}`} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="pp-history" className="pp-section">
        <div className="pp-section__head">
          <h2 className="pp-h2" id="pp-history">
            {onDay ? "Results that day" : "All results"}
          </h2>
          {onDay ? (
            <AppLink href="/app/matches">Show every result</AppLink>
          ) : null}
        </div>
        {model.count === 0 ? (
          <EmptyState
            actions={
              <Button href="/app/score" variant="primary">
                Add a result
              </Button>
            }
            description="Add a match you played. Once the other side confirms it, it counts toward your Sand Rating."
            icon="score"
            title="No results yet"
          />
        ) : (
          model.months.map((month) => (
            <section
              aria-labelledby={`pp-month-${month.key}`}
              className="pp-month"
              key={month.key}
            >
              <h3 className="pp-day__label" id={`pp-month-${month.key}`}>
                {month.label}
              </h3>
              <ul className="pp-list">
                {month.rows.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
      <p className="pp-more">
        <AppLink href="/app/score/live">
          Keep score live, point by point
        </AppLink>
      </p>
    </>
  );
}

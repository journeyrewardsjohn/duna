import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  RatingBacktestChart,
  RatingCalibrationChart,
} from "@/components/rating-backtest-chart";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = {
  title: "Sand Rating methodology and backtesting",
  description:
    "See how Duna makes pre-match beach volleyball predictions, measures calibration, and compares rating models without looking ahead.",
  alternates: {
    canonical: "/methodology",
    types: { "text/markdown": "/methodology.md" },
  },
};

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function MethodologyPage() {
  const caller = await getServerCaller();
  const lab = await caller.public.ratingLab().catch(() => undefined);
  const champion = lab?.models.find(
    (model) => model.modelId === lab.championModelId,
  );

  return (
    <main className="rating-methodology-page" data-zone="editorial">
      <SiteHeader />
      <section className="rating-methodology-hero">
        <div>
          <Badge>Sand Rating evidence lab</Badge>
          <h1>Predict first. Learn second. Prove every gain.</h1>
          <p>
            Duna replays beach volleyball history in order. Each model must
            publish its probability before it sees the result, then earn its
            place on accuracy, calibration, Brier score, and log loss.
          </p>
          <div className="rating-methodology-hero__actions">
            <Link href="/rankings">
              Explore rankings <ArrowRight aria-hidden size={16} />
            </Link>
            <a href="#results">See the evidence</a>
          </div>
        </div>
        <div className="rating-methodology-hero__score">
          <span>Latest walk-forward run</span>
          <Numeric tier="hero">
            {lab?.matchesProcessed.toLocaleString() ?? "—"}
          </Numeric>
          <strong>pre-match predictions</strong>
          <small>
            {lab
              ? `${lab.playersProcessed.toLocaleString()} players · ${shortDate(lab.dateFrom)}–${shortDate(lab.dateTo)}`
              : "The first public run has not been published yet."}
          </small>
        </div>
      </section>

      <section className="rating-methodology-content" id="results">
        <div className="rating-lab-principles">
          <article>
            <ChartNoAxesCombined aria-hidden />
            <h2>No look-ahead</h2>
            <p>
              Ratings and ensemble weights are frozen at their pre-match values
              before the result updates them.
            </p>
          </article>
          <article>
            <BrainCircuit aria-hidden />
            <h2>Real challengers</h2>
            <p>
              Simple baselines, Elo variants, Duna ablations, and an online
              adaptive ensemble compete on the same matches.
            </p>
          </article>
          <article>
            <ShieldCheck aria-hidden />
            <h2>Governed promotion</h2>
            <p>
              A challenger does not reach production because it sounds advanced.
              It must improve walk-forward error and remain explainable.
            </p>
          </article>
        </div>

        {lab && lab.models.length > 0 ? (
          <>
            <section className="rating-lab-panel">
              <header>
                <div>
                  <span className="page-eyebrow">
                    Cumulative learning curves
                  </span>
                  <h2>Prediction error over time</h2>
                </div>
                <span>Run {lab.id.slice(0, 8)}</span>
              </header>
              <RatingBacktestChart models={lab.models} />
            </section>

            <section className="rating-lab-panel">
              <header>
                <div>
                  <span className="page-eyebrow">Model comparison</span>
                  <h2>Same history. Same scoring rules.</h2>
                </div>
                <span>{lab.methodologyVersion}</span>
              </header>
              <div
                className="rating-model-table"
                role="table"
                aria-label="Rating model backtest results"
              >
                <div role="row">
                  <span role="columnheader">Model</span>
                  <span role="columnheader">Accuracy</span>
                  <span role="columnheader">Brier ↓</span>
                  <span role="columnheader">Log loss ↓</span>
                  <span role="columnheader">Calibration ↓</span>
                  <span role="columnheader">AUC ↑</span>
                </div>
                {lab.models.map((model) => (
                  <div
                    className={
                      model.modelId === lab.championModelId
                        ? "is-champion"
                        : undefined
                    }
                    key={model.modelId}
                    role="row"
                  >
                    <span role="cell">
                      <strong>{model.label}</strong>
                      <small>{model.family}</small>
                    </span>
                    <span role="cell">
                      <Numeric tier="block">
                        {percentage(model.accuracy)}
                      </Numeric>
                    </span>
                    <span role="cell">
                      <Numeric tier="table">
                        {model.brierScore.toFixed(4)}
                      </Numeric>
                    </span>
                    <span role="cell">
                      <Numeric tier="table">{model.logLoss.toFixed(4)}</Numeric>
                    </span>
                    <span role="cell">
                      <Numeric tier="table">
                        {model.expectedCalibrationError.toFixed(4)}
                      </Numeric>
                    </span>
                    <span role="cell">
                      <Numeric tier="table">
                        {model.areaUnderRocCurve.toFixed(3)}
                      </Numeric>
                    </span>
                  </div>
                ))}
              </div>
              <p className="rating-lab-footnote">
                “Champion” means the lowest Brier score in this run, with log
                loss as the tie-breaker. It is not an automatic production
                deployment.
              </p>
            </section>

            {champion ? (
              <section className="rating-lab-split">
                <div>
                  <span className="page-eyebrow">Calibration check</span>
                  <h2>
                    When we say 70%, it should happen about 70% of the time.
                  </h2>
                  <p>
                    The diagonal is ideal calibration. Each marker shows
                    predicted probability against the observed win rate; its
                    number is the match count in that bucket.
                  </p>
                </div>
                <RatingCalibrationChart model={champion} />
              </section>
            ) : null}

            {lab.examples.length > 0 ? (
              <section className="rating-lab-panel">
                <header>
                  <div>
                    <span className="page-eyebrow">Historical audit trail</span>
                    <h2>What the model knew before the match.</h2>
                  </div>
                  <span>Latest 12 rated results</span>
                </header>
                <div className="rating-backtest-examples">
                  {lab.examples.map((example) => {
                    const team = (side: "A" | "B") =>
                      example.participants
                        .filter((participant) => participant.side === side)
                        .map((participant) => ({
                          name: participant.name,
                          rating: participant.personId
                            ? example.preMatchRatings.players?.[
                                participant.personId
                              ]
                            : undefined,
                        }));
                    const teamA = team("A");
                    const teamB = team("B");
                    const probability =
                      example.probabilities[
                        lab.championModelId ?? "duna-score-aware"
                      ] ??
                      example.probabilities["duna-score-aware"] ??
                      0.5;
                    return (
                      <article key={example.matchId}>
                        <header>
                          <time>{shortDate(example.occurredAt)}</time>
                          <Badge>
                            {example.actualTeamA === 1
                              ? "Team A won"
                              : "Team B won"}
                          </Badge>
                        </header>
                        <small>{example.title}</small>
                        <div>
                          <span>
                            <strong>
                              {teamA.map((player) => player.name).join(" / ") ||
                                "Team A"}
                            </strong>
                            <small>
                              {teamA
                                .map(
                                  (player) => player.rating?.toFixed(2) ?? "—",
                                )
                                .join(" · ")}{" "}
                              pre-match
                            </small>
                          </span>
                          <Numeric tier="table">
                            {Math.round(probability * 100)}%
                          </Numeric>
                          <span>
                            <strong>
                              {teamB.map((player) => player.name).join(" / ") ||
                                "Team B"}
                            </strong>
                            <small>
                              {teamB
                                .map(
                                  (player) => player.rating?.toFixed(2) ?? "—",
                                )
                                .join(" · ")}{" "}
                              pre-match
                            </small>
                          </span>
                        </div>
                        <footer>
                          <span>
                            Team A forecast by {lab.championModelId ?? "Duna"}
                          </span>
                          <span>
                            {example.sets
                              .map((set) => `${set.a}–${set.b}`)
                              .join(" · ")}
                          </span>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="rating-lab-panel rating-lab-panel--empty">
            <h2>Backtest publication pending</h2>
            <p>
              The methodology is live; public metrics appear after an audited
              run completes.
            </p>
          </section>
        )}

        <section className="rating-methodology-copy">
          <div>
            <span className="page-eyebrow">How Sand Rating moves</span>
            <h2>Doubles is not two singles ratings.</h2>
          </div>
          <div>
            <p>
              Duna models team strength with extra weight on the weaker partner,
              reflecting targeting and side-out pressure. Updates consider score
              margin, uncertainty, evidence quality, and repeat-opponent decay.
              Weekly display gains are capped, while losses remain uncapped.
            </p>
            <p>
              A player’s public 1.00–8.00 number is a readable projection of an
              internal strength and uncertainty state. World ranking points
              remain a separate official signal; they are never relabeled as
              Sand Rating.
            </p>
          </div>
        </section>

        <section className="rating-methodology-copy">
          <div>
            <span className="page-eyebrow">
              What “machine learning” means here
            </span>
            <h2>Transparent online learning, not marketing fog.</h2>
          </div>
          <div>
            <p>
              The adaptive ensemble is an online machine-learning model: after
              each result, it shifts weight toward component models with lower
              prior log loss. The current lab does not use reinforcement
              learning, and Duna will not claim that it does unless an actual RL
              policy is trained, evaluated, and documented.
            </p>
            <p>
              AI agents may propose new features or challenger models. They
              cannot silently change the live rating. Every proposal must run
              through the same chronological evaluation, data-integrity review,
              versioned configuration, and human promotion gate.
            </p>
          </div>
        </section>

        <section className="rating-metric-notes">
          <h2>How to read the scorecard</h2>
          <dl>
            <div>
              <dt>Accuracy</dt>
              <dd>
                Share of winners picked above 50%. Exact 50/50 forecasts count
                as half a correct pick instead of favoring either team label.
              </dd>
            </div>
            <div>
              <dt>Brier score</dt>
              <dd>
                Mean squared probability error. Lower is better; 0.25 is the
                50/50 baseline.
              </dd>
            </div>
            <div>
              <dt>Log loss</dt>
              <dd>
                Penalizes confident wrong predictions more severely. Lower is
                better.
              </dd>
            </div>
            <div>
              <dt>Calibration error</dt>
              <dd>
                Gap between forecast probability and observed frequency. Lower
                is better.
              </dd>
            </div>
            <div>
              <dt>AUC</dt>
              <dd>
                How often the model ranks a winner above a loser across
                probability pairs. Higher is better.
              </dd>
            </div>
          </dl>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

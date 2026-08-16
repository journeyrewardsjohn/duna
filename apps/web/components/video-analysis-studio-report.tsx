import type { VideoAnalysisReport } from "@duna/api";
import { formatSessionTimeUs } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { CheckCircle2, CircleDashed, Flag, Sparkles } from "lucide-react";
import styles from "./video-analysis-studio-report.module.css";

function runLabel(report: VideoAnalysisReport): string {
  if (!report.run) return "Evidence ready to analyze";
  switch (report.run.status) {
    case "queued":
      return "Analysis queued";
    case "processing":
      return "Analysis in progress";
    case "ready":
      return "Model evidence ready";
    case "needs-review":
      return "Coach review needed";
    case "failed":
      return "Analysis needs retry";
    default:
      return "Analysis cancelled";
  }
}

function heatTone(count: number, maximum: number): string {
  const ratio = count / Math.max(1, maximum);
  if (ratio > 0.75) return styles.heatStrong ?? "";
  if (ratio > 0.42) return styles.heatMedium ?? "";
  return styles.heatLight ?? "";
}

export function VideoAnalysisStudioReport({
  report,
}: {
  readonly report: VideoAnalysisReport;
}) {
  const maximum = Math.max(
    1,
    ...report.heatmap.cells.map((cell) => cell.count),
  );

  return (
    <section
      aria-label="Duna Vision analysis report"
      className={styles.report}
      data-zone="athletic"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Duna Vision</span>
          <h1>Make every rally explainable.</h1>
          <p>
            Court positions stay tied to calibrated video evidence. A human
            correction always outranks a model estimate.
          </p>
        </div>
        <Badge tone={report.run?.status === "ready" ? "positive" : "neutral"}>
          {runLabel(report)}
        </Badge>
      </header>

      <div className={styles.metrics}>
        <article>
          <Numeric tier="block">{report.score.scoredRallies}</Numeric>
          <span>Scored rallies</span>
        </article>
        <article>
          <Numeric tier="block">{report.heatmap.observedCount}</Numeric>
          <span>Visible landings</span>
        </article>
        <article>
          <Numeric tier="block">{report.highlights.length}</Numeric>
          <span>Saved moments</span>
        </article>
        <article>
          <Numeric tier="block">{report.reviewQueue.length}</Numeric>
          <span>Review cues</span>
        </article>
      </div>

      <div className={styles.grid}>
        <article className={styles.courtCard}>
          <header>
            <div>
              <span className={styles.kicker}>Ball landing map</span>
              <h2>Placement, with the uncertainty intact.</h2>
            </div>
            <CircleDashed aria-hidden size={22} />
          </header>
          <div
            aria-label={report.heatmap.summary}
            className={styles.court}
            role="img"
          >
            <span aria-hidden className={styles.net} />
            {report.heatmap.cells.map((cell) => (
              <span
                className={`${styles.heatCell} ${heatTone(cell.count, maximum)}`}
                key={`${cell.column}-${cell.row}`}
                style={{
                  left: `${(cell.column / report.heatmap.columns) * 100}%`,
                  top: `${(cell.row / report.heatmap.rows) * 100}%`,
                  width: `${100 / report.heatmap.columns}%`,
                  height: `${100 / report.heatmap.rows}%`,
                }}
              >
                <b>{cell.count}</b>
                <small>{cell.confidence}</small>
              </span>
            ))}
            <span className={styles.opponentLabel}>Opponent court</span>
            <span className={styles.playerLabel}>Your court</span>
          </div>
          <p className={styles.summary}>{report.heatmap.summary}</p>
          <p className={styles.caption}>
            {report.court.widthMeters}m × {report.court.lengthMeters}m ·{" "}
            {report.court.calibrationSource} calibration
            {report.court.calibrationQualityScore !== undefined
              ? ` · ${report.court.calibrationQualityScore}/100 quality`
              : ""}
          </p>
        </article>

        <article className={styles.evidenceCard}>
          <header>
            <div>
              <span className={styles.kicker}>Evidence integrity</span>
              <h2>What this report can actually prove.</h2>
            </div>
            <CheckCircle2 aria-hidden size={22} />
          </header>
          <ul>
            <li>
              <CheckCircle2 aria-hidden size={16} />
              {report.evidence.sourceVideoAvailable
                ? "Source video is connected."
                : "Source video is not yet connected."}
            </li>
            <li>
              <CheckCircle2 aria-hidden size={16} />
              {report.evidence.scoreTimelineAvailable
                ? "Watch and capture timeline is connected."
                : "No live scoring timeline is attached."}
            </li>
            <li>
              <CheckCircle2 aria-hidden size={16} />
              {report.evidence.trainingEligible
                ? "Separate learning consent is recorded."
                : "This video is not eligible for model learning."}
            </li>
          </ul>
          <p>{report.evidence.disclaimer}</p>
        </article>
      </div>

      <div className={styles.timelineGrid}>
        <article>
          <header>
            <Sparkles aria-hidden size={19} />
            <div>
              <span className={styles.kicker}>Highlight rail</span>
              <h2>Moments worth seeing again.</h2>
            </div>
          </header>
          {report.highlights.length > 0 ? (
            <ol>
              {report.highlights.slice(0, 8).map((highlight) => (
                <li key={highlight.id}>
                  <Numeric tier="chip">
                    {formatSessionTimeUs(highlight.sessionTimeUs)}
                  </Numeric>
                  <span>
                    <strong>{highlight.label}</strong>
                    <small>
                      {highlight.source} · {highlight.confidence}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>
              Save a moment from Apple Watch or Duna Player to make a
              source-linked highlight rail.
            </p>
          )}
        </article>

        <article>
          <header>
            <Flag aria-hidden size={19} />
            <div>
              <span className={styles.kicker}>Coach review</span>
              <h2>Keep the one question that matters.</h2>
            </div>
          </header>
          {report.reviewQueue.length > 0 ? (
            <ol>
              {report.reviewQueue.slice(0, 8).map((cue) => (
                <li key={cue.id}>
                  <Numeric tier="chip">
                    {formatSessionTimeUs(cue.sessionTimeUs)}
                  </Numeric>
                  <span>
                    <strong>{cue.label}</strong>
                    <small>{cue.source} cue</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>
              Flag a rally from the Watch to keep a focused coach-review queue
              beside the source video.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { PredictionMarketView } from "@duna/api";
import { TourBrandMark, type TourBrand } from "./tour-brand-mark";
import { CountryCode } from "@/components/country-code";
import {
  buildViewerPredictionSummary,
  formatPredictionAmount,
} from "@/lib/prediction-position";

export interface ProfessionalMatchPlayer {
  readonly name: string;
  readonly rating?: number;
  readonly avatarUrl?: string;
}

export interface ProfessionalMatchTeam {
  readonly label: string;
  readonly players: readonly ProfessionalMatchPlayer[];
  readonly countryCode?: string;
  readonly flagUrl?: string;
}

function statusLabel(status: "scheduled" | "live" | "completed") {
  return status === "live"
    ? "Live"
    : status === "completed"
      ? "Final"
      : "Upcoming";
}

function formattedDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function setsWon(
  sets: readonly { readonly a: number; readonly b: number }[],
  side: "A" | "B",
) {
  return sets.filter((set) => (side === "A" ? set.a > set.b : set.b > set.a))
    .length;
}

function TeamResultRow({
  team,
  side,
  sets,
  winner,
  status,
  currentSetNo,
}: {
  readonly team: ProfessionalMatchTeam;
  readonly side: "A" | "B";
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly winner: boolean;
  readonly status: "scheduled" | "live" | "completed";
  readonly currentSetNo?: number;
}) {
  const players =
    team.players.length > 0 ? team.players : [{ name: team.label }];
  return (
    <div
      className={`professional-match-card__team${winner ? " professional-match-card__team--winner" : ""}`}
    >
      <div className="professional-match-card__players">
        {players.map((player, index) => (
          <span key={`${player.name}-${index}`}>
            {player.avatarUrl ? (
              <img alt="" src={player.avatarUrl} />
            ) : team.countryCode ? (
              <CountryCode
                code={team.countryCode}
                fallback={player.name.slice(0, 2)}
              />
            ) : team.flagUrl ? (
              <img
                alt={`${team.countryCode ?? "Team"} flag`}
                src={team.flagUrl}
              />
            ) : (
              <CountryCode
                code={team.countryCode}
                fallback={player.name.slice(0, 2)}
              />
            )}
            <span>
              <strong>{player.name}</strong>
              <small>
                {player.rating !== undefined
                  ? `Sand Rating ${player.rating.toFixed(2)}`
                  : "Sand Rating pending"}
              </small>
            </span>
          </span>
        ))}
      </div>
      {sets.length > 0 ? (
        <div className="professional-match-card__sets">
          {sets.map((set, index) => {
            const score = side === "A" ? set.a : set.b;
            const won = side === "A" ? set.a > set.b : set.b > set.a;
            return (
              <span
                className={
                  `${won ? "won" : ""}${currentSetNo === index + 1 ? " is-current" : ""}`.trim() ||
                  undefined
                }
                key={index}
              >
                <small>Set {index + 1}</small>
                <strong>{score}</strong>
              </span>
            );
          })}
        </div>
      ) : (
        <span className="professional-match-card__pending">
          {status === "live" ? "Waiting for first point" : "Not started"}
        </span>
      )}
      <span className="professional-match-card__total">
        <small>Sets</small>
        <strong>{sets.length > 0 ? setsWon(sets, side) : "—"}</strong>
      </span>
    </div>
  );
}

export function ProfessionalMatchCard({
  href,
  status,
  roundLabel,
  playedAt,
  timeLabel,
  context,
  source,
  teamA,
  teamB,
  sets,
  winnerSide,
  outcomeLabel,
  ratingDelta,
  predictionMarket,
  currentSetNo,
  className = "",
}: {
  readonly href?: string;
  readonly status: "scheduled" | "live" | "completed";
  readonly roundLabel: string;
  readonly playedAt?: string;
  readonly timeLabel?: string;
  readonly context?: string;
  readonly source?: TourBrand;
  readonly teamA: ProfessionalMatchTeam;
  readonly teamB: ProfessionalMatchTeam;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly winnerSide?: "A" | "B";
  readonly outcomeLabel?: string;
  readonly ratingDelta?: number;
  readonly predictionMarket?: PredictionMarketView;
  readonly currentSetNo?: number;
  readonly className?: string;
}) {
  const viewerPosition = predictionMarket
    ? buildViewerPredictionSummary(predictionMarket)
    : undefined;
  const body = (
    <>
      <header>
        <div>
          <span
            className={`professional-match-card__status professional-match-card__status--${status}`}
          >
            {status === "live" && <i aria-hidden />}
            {statusLabel(status)}
          </span>
          <strong>{roundLabel}</strong>
          {outcomeLabel && (
            <span className="professional-match-card__outcome">
              {outcomeLabel}
            </span>
          )}
        </div>
        <div>
          {source && <TourBrandMark brand={source} compact />}
          <span>{timeLabel ?? formattedDate(playedAt) ?? "Time pending"}</span>
        </div>
      </header>
      {context && <p className="professional-match-card__context">{context}</p>}
      <div
        className="professional-match-card__score"
        role="group"
        aria-label={`${teamA.label} versus ${teamB.label}`}
      >
        <TeamResultRow
          sets={sets}
          side="A"
          status={status}
          team={teamA}
          winner={winnerSide === "A"}
          currentSetNo={currentSetNo}
        />
        <TeamResultRow
          sets={sets}
          side="B"
          status={status}
          team={teamB}
          winner={winnerSide === "B"}
          currentSetNo={currentSetNo}
        />
      </div>
      {predictionMarket && (
        <div className="professional-match-card__market">
          <div>
            <span>{predictionMarket.yesLabel}</span>
            <strong>{(predictionMarket.yesPriceBps / 100).toFixed(0)}%</strong>
            <i>
              <b style={{ width: `${predictionMarket.yesPriceBps / 100}%` }} />
            </i>
          </div>
          <div>
            <span>{predictionMarket.noLabel}</span>
            <strong>{(predictionMarket.noPriceBps / 100).toFixed(0)}%</strong>
            <i>
              <b style={{ width: `${predictionMarket.noPriceBps / 100}%` }} />
            </i>
          </div>
          <small>
            {predictionMarket.volumeCredits.toLocaleString("en-US", {
              maximumFractionDigits: 1,
            })}{" "}
            credit volume · {predictionMarket.participantCount} predictors
          </small>
          {viewerPosition && (
            <span className="professional-match-card__market-position">
              <Check aria-hidden size={14} /> Your position ·{" "}
              {formatPredictionAmount(viewerPosition.totalCommittedCredits)}
              credits
            </span>
          )}
        </div>
      )}
      {(ratingDelta !== undefined || href) && (
        <footer>
          {ratingDelta !== undefined ? (
            <span
              className={
                ratingDelta > 0
                  ? "positive"
                  : ratingDelta < 0
                    ? "negative"
                    : undefined
              }
            >
              {ratingDelta > 0 ? "+" : ""}
              {ratingDelta.toFixed(2)} SandRating
            </span>
          ) : (
            <span />
          )}
          {href && <ChevronRight aria-hidden size={17} />}
        </footer>
      )}
    </>
  );
  const classes = `professional-match-card ${className}`.trim();
  return href ? (
    <Link className={classes} href={href}>
      {body}
    </Link>
  ) : (
    <article className={classes}>{body}</article>
  );
}

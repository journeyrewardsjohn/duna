import { ArrowUpRight, MapPin, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { countryFlag } from "@/lib/country-flag";

export interface PartnershipMatchPoint {
  readonly id: string;
  readonly occurredAt: string;
  readonly result: "win" | "loss" | "unknown";
  readonly ratingAfter: number;
  readonly delta: number;
  readonly matchTitle: string;
  readonly opponents: string;
  readonly score: string;
}

export interface PartnershipHistory {
  readonly personId: string;
  readonly publicPath: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly homeMarket?: string;
  readonly countryCode?: string;
  readonly isProfessional: boolean;
  readonly sandRating?: number;
  readonly ratedMatches?: number;
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly firstPlayedAt: string;
  readonly lastPlayedAt: string;
  readonly history: readonly PartnershipMatchPoint[];
}

const CHART_WIDTH = 520;
const CHART_HEIGHT = 132;
const CHART_PADDING = { top: 14, right: 12, bottom: 26, left: 12 };

function formatDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(value));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function trendGeometry(history: readonly PartnershipMatchPoint[]) {
  let wins = 0;
  let decided = 0;
  const chartWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const points = history.map((match, index) => {
    if (match.result !== "unknown") decided += 1;
    if (match.result === "win") wins += 1;
    const winRate = decided > 0 ? (wins / decided) * 100 : 50;
    return {
      ...match,
      winRate,
      x:
        history.length === 1
          ? CHART_PADDING.left + chartWidth / 2
          : CHART_PADDING.left + (index / (history.length - 1)) * chartWidth,
      y: CHART_PADDING.top + chartHeight - (winRate / 100) * chartHeight,
    };
  });
  if (points.length === 0) return { path: "", points };
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (const point of points.slice(1)) {
    path += ` H ${point.x} V ${point.y}`;
  }
  return { path, points };
}

export function PartnershipHistoryCard({
  partner,
}: {
  readonly partner: PartnershipHistory;
}) {
  const decided = partner.wins + partner.losses;
  const winRate = decided > 0 ? Math.round((partner.wins / decided) * 100) : 0;
  const netMovement = partner.history.reduce(
    (total, match) => total + match.delta,
    0,
  );
  const { path, points } = trendGeometry(partner.history);
  const firstPoint = points[0];
  const lastPoint = points.at(-1);

  return (
    <article className="partnership-card">
      <header className="partnership-card__identity">
        <Link
          aria-label={`View ${partner.name}'s player profile`}
          className="partnership-card__portrait"
          href={partner.publicPath}
        >
          {partner.avatarUrl ? (
            <Image
              alt={`${partner.name} profile`}
              fill
              sizes="88px"
              src={partner.avatarUrl}
              unoptimized
            />
          ) : (
            <span>{initials(partner.name)}</span>
          )}
        </Link>
        <div>
          <span className="partnership-card__context">
            {partner.countryCode && (
              <span aria-label={partner.countryCode} role="img">
                {countryFlag(partner.countryCode)}
              </span>
            )}
            {partner.isProfessional ? "Professional partner" : "Partner"}
          </span>
          <h3>{partner.name}</h3>
          {(partner.homeMarket || partner.ratedMatches !== undefined) && (
            <p>
              {partner.homeMarket && <MapPin aria-hidden size={14} />}
              {[
                partner.homeMarket,
                partner.ratedMatches === undefined
                  ? undefined
                  : `${partner.ratedMatches} rated matches`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <Link
          className="partnership-card__profile-link"
          href={partner.publicPath}
        >
          Profile <ArrowUpRight aria-hidden size={15} />
        </Link>
      </header>

      <div className="partnership-card__metrics">
        <span>
          <small>Shared matches</small>
          <strong>{partner.matches}</strong>
        </span>
        <span>
          <small>Together</small>
          <strong>
            {partner.wins}–{partner.losses}
          </strong>
        </span>
        <span>
          <small>Win rate</small>
          <strong>{winRate}%</strong>
        </span>
        <span data-direction={netMovement >= 0 ? "up" : "down"}>
          <small>Rating impact</small>
          <strong>{signed(netMovement)}</strong>
        </span>
        {partner.sandRating !== undefined && (
          <span className="partnership-card__rating">
            <small>Partner Sand Rating</small>
            <strong>{partner.sandRating.toFixed(2)}</strong>
          </span>
        )}
      </div>

      <section className="partnership-card__trend">
        <header>
          <div>
            <span>Partnership history</span>
            <strong>Cumulative win rate by match</strong>
          </div>
          <b>{lastPoint ? `${Math.round(lastPoint.winRate)}%` : "—"}</b>
        </header>
        <svg
          aria-label={`${partner.name} partnership win-rate trend across ${partner.matches} shared matches`}
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          {[0, 50, 100].map((value) => {
            const y =
              CHART_PADDING.top +
              (1 - value / 100) *
                (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom);
            return (
              <line
                className="partnership-card__gridline"
                key={value}
                x1={CHART_PADDING.left}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y1={y}
                y2={y}
              />
            );
          })}
          <path className="partnership-card__trend-line" d={path} />
          {points.map((point) => (
            <circle
              aria-label={`${formatDate(point.occurredAt, true)} ${point.result}, ${Math.round(point.winRate)} percent cumulative win rate`}
              className="partnership-card__trend-point"
              cx={point.x}
              cy={point.y}
              data-result={point.result}
              key={point.id}
              r="4.5"
            />
          ))}
          {firstPoint && (
            <text
              className="partnership-card__axis"
              x={CHART_PADDING.left}
              y={CHART_HEIGHT - 7}
            >
              {formatDate(firstPoint.occurredAt)}
            </text>
          )}
          {lastPoint && (
            <text
              className="partnership-card__axis"
              textAnchor="end"
              x={CHART_WIDTH - CHART_PADDING.right}
              y={CHART_HEIGHT - 7}
            >
              {formatDate(lastPoint.occurredAt)}
            </text>
          )}
        </svg>
      </section>

      <section className="partnership-card__recent">
        <header>
          <span>Latest together</span>
          <small>
            {formatDate(partner.firstPlayedAt, true)}–
            {formatDate(partner.lastPlayedAt, true)}
          </small>
        </header>
        <ol>
          {[...partner.history]
            .reverse()
            .slice(0, 3)
            .map((match) => (
              <li data-result={match.result} key={match.id}>
                <span className="partnership-card__result">
                  {match.result === "win"
                    ? "W"
                    : match.result === "loss"
                      ? "L"
                      : "—"}
                </span>
                <span>
                  <strong>vs {match.opponents || "opponent pending"}</strong>
                  <small>
                    {match.matchTitle} · {formatDate(match.occurredAt, true)}
                  </small>
                </span>
                <span>
                  <strong className={match.delta >= 0 ? "is-up" : "is-down"}>
                    {signed(match.delta)}
                  </strong>
                  <small>{match.score || "Score pending"}</small>
                </span>
              </li>
            ))}
        </ol>
      </section>

      {partner.wins > 0 && (
        <footer>
          <Trophy aria-hidden size={15} /> {partner.wins} verified shared win
          {partner.wins === 1 ? "" : "s"}
        </footer>
      )}
    </article>
  );
}

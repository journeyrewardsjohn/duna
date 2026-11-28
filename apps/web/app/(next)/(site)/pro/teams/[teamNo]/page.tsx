import "../../../pages.css";

import type { PublicProfessionalTeam } from "@duna/api";
import { Avatar, Icon } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "@/components/site/site-link";
import { notFound } from "next/navigation";
import { NetLine } from "@/components/site/net-line";
import { TeamTrend } from "@/components/site/pro/team-trend";
import { getServerCaller } from "@/lib/api";
import { professionalTeamJsonLd, serializeJsonLd } from "@/lib/pro-seo";

async function loadTeam(
  teamNo: string,
): Promise<PublicProfessionalTeam | undefined> {
  const parsed = Number.parseInt(teamNo, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  const caller = await getServerCaller();
  return caller.public.proTeam({ teamNo: parsed }).catch(() => undefined);
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ teamNo: string }>;
}): Promise<Metadata> {
  const { teamNo } = await params;
  const team = await loadTeam(teamNo);
  if (!team) return { title: "Professional team not found" };
  const description = `${team.name} professional beach volleyball statistics, players, match history, hitting efficiency, aces, blocks and digs per set.`;
  const canonical = `/pro/teams/${team.teamNo}`;
  return {
    title: { absolute: `${team.name} · Pro Tour · Duna` },
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${team.name} · Duna Pro Tour`,
      description,
      type: "profile",
      url: canonical,
      siteName: "Duna",
    },
    robots: { index: true, follow: true },
  };
}

function matchDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function Stat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="site-stat">
      <dt>{label}</dt>
      <dd>
        <span className="td-num site-stat__value">{value}</span>
        <span className="site-meta">{detail}</span>
      </dd>
    </div>
  );
}

/**
 * A professional team (`/pro/teams/[teamNo]`), same address and data as
 * before (`public.proTeam`): the record, the official box-score numbers,
 * their trend over the season, the roster with Duna profiles and Sand
 * Ratings where they exist, and the match archive. Missing numbers read
 * "—", never zero.
 */
export default async function ProfessionalTeamPage({
  params,
}: {
  readonly params: Promise<{ teamNo: string }>;
}) {
  const { teamNo } = await params;
  const team = await loadTeam(teamNo);
  if (!team) notFound();
  const stats = team.statistics;
  return (
    <main
      className="site-page-main"
      data-zone="athletic"
      id="main"
      tabIndex={-1}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(professionalTeamJsonLd(team)),
        }}
        type="application/ld+json"
      />
      <section
        aria-labelledby="team-title"
        className="site-wrap site-team-hero"
      >
        <div className="site-team-hero__copy td-rise">
          <Link className="site-back" href="/pro">
            <Icon name="chevron-left" size="inline" />
            Pro Tour
          </Link>
          <p className="site-label">
            Official FIVB team{team.countryCode ? ` · ${team.countryCode}` : ""}
          </p>
          <h1 className="site-display" id="team-title">
            {team.name}
          </h1>
          <p className="site-lead">
            This partnership’s official box scores, form, roster and Duna match
            record in one place.
          </p>
        </div>
        <dl className="site-team-hero__record td-rise">
          <dt>Record</dt>
          <dd>
            <span className="td-num site-team-hero__wl">
              {team.record.wins}–{team.record.losses}
            </span>
            <span className="site-meta td-num">
              {team.record.matches} official matches
            </span>
          </dd>
        </dl>
      </section>

      <section
        aria-labelledby="numbers-title"
        className="site-wrap site-section"
      >
        <NetLine label="Box score" />
        <h2 className="site-h2" id="numbers-title">
          The numbers.
        </h2>
        <dl className="site-stats-grid">
          <Stat
            detail={`${stats?.attackAttempts ?? "—"} recorded attacks`}
            label="Hitting efficiency"
            value={
              stats?.hittingEfficiency !== undefined
                ? `${stats.hittingEfficiency.toFixed(1)}%`
                : "—"
            }
          />
          <Stat
            detail={`${stats?.aces ?? "—"} aces in all`}
            label="Aces / set"
            value={stats ? stats.acesPerSet.toFixed(2) : "—"}
          />
          <Stat
            detail={`${stats?.blocks ?? "—"} blocks in all`}
            label="Blocks / set"
            value={stats ? stats.blocksPerSet.toFixed(2) : "—"}
          />
          <Stat
            detail={`${stats?.digs ?? "—"} digs in all`}
            label="Digs / set"
            value={stats ? stats.digsPerSet.toFixed(2) : "—"}
          />
        </dl>
        {team.trends.length > 0 ? <TeamTrend points={team.trends} /> : null}
      </section>

      <section
        aria-labelledby="roster-title"
        className="site-wrap site-section"
      >
        <NetLine label="Roster" />
        <h2 className="site-h2" id="roster-title">
          The players behind the numbers.
        </h2>
        <ul className="site-roster">
          {team.players.map((player) => {
            const body = (
              <>
                <Avatar name={player.name} size="md" src={player.avatarUrl} />
                <span className="site-player__name">
                  <b>{player.name}</b>
                  <span className="site-meta">
                    {player.sandRating !== undefined ? (
                      <>
                        Sand Rating{" "}
                        <span className="td-num">
                          {player.sandRating.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      "Profile connected"
                    )}
                  </span>
                </span>
                {player.publicPath ? (
                  <Icon name="chevron-right" size="inline" />
                ) : null}
              </>
            );
            return (
              <li key={player.personId ?? player.name}>
                {player.publicPath ? (
                  <Link className="site-player" href={player.publicPath}>
                    {body}
                  </Link>
                ) : (
                  <span className="site-player">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="archive-title"
        className="site-wrap site-section"
      >
        <NetLine label="Match archive" />
        <h2 className="site-h2" id="archive-title">
          Official results.
        </h2>
        {team.matches.length === 0 ? (
          <p className="site-empty">No official results yet.</p>
        ) : (
          <ul className="site-results">
            {team.matches.map((match) => {
              const body = (
                <>
                  <span
                    className="site-result__chip"
                    data-result={match.result}
                  >
                    {match.result === "win" ? (
                      <Icon name="check" size="chip" />
                    ) : null}
                    {match.result === "win"
                      ? "Win"
                      : match.result === "loss"
                        ? "Loss"
                        : "Final"}
                  </span>
                  <span className="site-result__what">
                    <span className="site-meta">
                      <span className="td-num">
                        {matchDate(match.occurredAt)}
                      </span>{" "}
                      · {match.eventName}
                    </span>
                    <b>vs. {match.opponent}</b>
                  </span>
                  <span className="td-num site-result__sets">
                    {match.sets.map((set) => `${set.a}–${set.b}`).join(" · ")}
                  </span>
                </>
              );
              return (
                <li key={match.matchId}>
                  {match.canonicalPath ? (
                    <Link className="site-result" href={match.canonicalPath}>
                      {body}
                    </Link>
                  ) : (
                    <span className="site-result">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

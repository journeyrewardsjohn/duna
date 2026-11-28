import type { PublicProfessionalTeam } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountryCode } from "@/components/country-code";
import { ProStatTrendChart } from "@/components/pro-stat-trend-chart";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { professionalTeamJsonLd, serializeJsonLd } from "@/lib/pro-seo";
import styles from "./team-page.module.css";

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
  const description = `${team.name} professional beach volleyball statistics, players, Elite16 match history, hitting efficiency, aces, blocks, and digs per set.`;
  const canonical = `/pro/teams/${team.teamNo}`;
  return {
    title: `${team.name} beach volleyball team`,
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

export default async function ProfessionalTeamPage({
  params,
}: {
  readonly params: Promise<{ teamNo: string }>;
}) {
  const { teamNo } = await params;
  const team = await loadTeam(teamNo);
  if (!team) notFound();
  const statistics = team.statistics;
  const jsonLd = professionalTeamJsonLd(team);
  return (
    <main className={styles.page} data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        type="application/ld+json"
      />
      <section className={styles.hero}>
        <div>
          <Link className={styles.back} href="/pro">
            <ArrowLeft aria-hidden size={16} /> Pro Tour
          </Link>
          <div className={styles.kicker}>
            <Badge>Official FIVB team</Badge>
            {team.countryCode && <CountryCode code={team.countryCode} />}
          </div>
          <h1>{team.name}</h1>
          <p>
            One connected view of this partnership&apos;s official Elite16 box
            scores, form, roster, and Duna match record.
          </p>
        </div>
        <aside>
          <span>Connected record</span>
          <strong>
            <Numeric tier="hero">
              {team.record.wins}–{team.record.losses}
            </Numeric>
          </strong>
          <small>
            <Numeric tier="chip">{team.record.matches}</Numeric> official
            matches
          </small>
        </aside>
      </section>

      <section className={styles.content}>
        <div className={styles.metrics}>
          <article>
            <span>Hitting efficiency</span>
            <strong>
              <Numeric tier="block">
                {statistics?.hittingEfficiency?.toFixed(1) ?? "—"}
                {statistics?.hittingEfficiency !== undefined ? "%" : ""}
              </Numeric>
            </strong>
            <small>
              <Numeric tier="chip">{statistics?.attackAttempts ?? 0}</Numeric>{" "}
              recorded attacks
            </small>
          </article>
          <article>
            <span>Aces / set</span>
            <strong>
              <Numeric tier="block">
                {statistics?.acesPerSet.toFixed(2) ?? "—"}
              </Numeric>
            </strong>
            <small>
              <Numeric tier="chip">{statistics?.aces ?? 0}</Numeric> total aces
            </small>
          </article>
          <article>
            <span>Blocks / set</span>
            <strong>
              <Numeric tier="block">
                {statistics?.blocksPerSet.toFixed(2) ?? "—"}
              </Numeric>
            </strong>
            <small>
              <Numeric tier="chip">{statistics?.blocks ?? 0}</Numeric> total
              blocks
            </small>
          </article>
          <article>
            <span>Digs / set</span>
            <strong>
              <Numeric tier="block">
                {statistics?.digsPerSet.toFixed(2) ?? "—"}
              </Numeric>
            </strong>
            <small>
              <Numeric tier="chip">{statistics?.digs ?? 0}</Numeric> successful
              digs
            </small>
          </article>
        </div>

        {team.trends.length > 0 && (
          <section className={styles.section}>
            <header>
              <div>
                <span>Performance history</span>
                <h2>Every match changes the picture.</h2>
              </div>
              <BarChart3 aria-hidden size={24} />
            </header>
            <ProStatTrendChart points={team.trends} />
          </section>
        )}

        <section className={styles.section}>
          <header>
            <div>
              <span>Connected roster</span>
              <h2>Players behind the numbers.</h2>
            </div>
            <UsersRound aria-hidden size={24} />
          </header>
          <div className={styles.players}>
            {team.players.map((player) => {
              const content = (
                <>
                  {player.avatarUrl ? (
                    <img alt="" src={player.avatarUrl} />
                  ) : (
                    <CountryCode
                      code={team.countryCode}
                      fallback={player.name.slice(0, 2)}
                    />
                  )}
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.sandRating !== undefined ? (
                        <>
                          Sand Rating{" "}
                          <Numeric tier="chip">
                            {player.sandRating.toFixed(2)}
                          </Numeric>
                        </>
                      ) : (
                        "Profile connected"
                      )}
                    </small>
                  </span>
                  {player.publicPath && <ArrowRight aria-hidden size={17} />}
                </>
              );
              return player.publicPath ? (
                <Link
                  href={player.publicPath}
                  key={player.personId ?? player.name}
                >
                  {content}
                </Link>
              ) : (
                <article key={player.personId ?? player.name}>
                  {content}
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <header>
            <div>
              <span>Match archive</span>
              <h2>Official results.</h2>
            </div>
            <Trophy aria-hidden size={24} />
          </header>
          <div className={styles.matches}>
            {team.matches.map((match) => {
              const occurredAt = new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(match.occurredAt));
              const content = (
                <>
                  <span className={styles[match.result]}>
                    {match.result === "win"
                      ? "Win"
                      : match.result === "loss"
                        ? "Loss"
                        : "Final"}
                  </span>
                  <div>
                    <small>
                      <Numeric tier="table">{occurredAt}</Numeric> ·{" "}
                      {match.eventName}
                    </small>
                    <strong>vs. {match.opponent}</strong>
                  </div>
                  <b>
                    <Numeric tier="table">
                      {match.sets.map((set) => `${set.a}–${set.b}`).join(" · ")}
                    </Numeric>
                  </b>
                  {match.canonicalPath && <ArrowRight aria-hidden size={16} />}
                </>
              );
              return match.canonicalPath ? (
                <Link href={match.canonicalPath} key={match.matchId}>
                  {content}
                </Link>
              ) : (
                <article key={match.matchId}>{content}</article>
              );
            })}
          </div>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

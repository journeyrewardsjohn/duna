import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, ChartNoAxesCombined, Globe2, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = {
  title: "Beach volleyball world and Sand Rating rankings",
  description:
    "Explore the top 200 men's and women's beach volleyball players by official world ranking and Duna Sand Rating.",
  alternates: { canonical: "/rankings" },
};

type Gender = "men" | "women";
type RankingView = "world" | "duna";

function rankingHref(view: RankingView, gender: Gender) {
  return `/rankings?view=${view}&gender=${gender}`;
}

export default async function RankingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly view?: string;
    readonly gender?: string;
  }>;
}) {
  const [{ view: rawView, gender: rawGender }, caller] = await Promise.all([
    searchParams,
    getServerCaller(),
  ]);
  const view: RankingView = rawView === "duna" ? "duna" : "world";
  const gender: Gender = rawGender === "women" ? "women" : "men";
  const rankings = await caller.public.worldRankings().catch(() => undefined);
  const worldRows = rankings?.world[gender] ?? [];
  const dunaRows = rankings?.duna[gender] ?? [];
  const mappedProfiles = worldRows.filter((row) => row.handle).length;

  return (
    <main className="rankings-page">
      <SiteHeader />
      <section className="rankings-hero">
        <div>
          <Badge>
            <Globe2 aria-hidden size={13} /> Global player index
          </Badge>
          <h1>The world rankings, connected to the match record.</h1>
          <p>
            Compare official tour points with Duna’s match-based Sand Rating.
            They answer different questions, and we publish both without forcing
            them to agree.
          </p>
        </div>
        <div className="rankings-hero__stats">
          <span>
            <Numeric>{worldRows.length}</Numeric>
            <small>officially ranked</small>
          </span>
          <span>
            <Numeric>{mappedProfiles}</Numeric>
            <small>public profiles</small>
          </span>
          <span>
            <Numeric>{dunaRows.length}</Numeric>
            <small>Duna ranked</small>
          </span>
        </div>
      </section>

      <section className="rankings-content">
        <div className="rankings-tabs">
          <nav aria-label="Ranking system">
            <Link
              aria-current={view === "world" ? "page" : undefined}
              href={rankingHref("world", gender)}
            >
              <Trophy aria-hidden size={15} /> World ranking
            </Link>
            <Link
              aria-current={view === "duna" ? "page" : undefined}
              href={rankingHref("duna", gender)}
            >
              <ChartNoAxesCombined aria-hidden size={15} /> Duna Sand Rating
            </Link>
          </nav>
          <nav aria-label="Gender category">
            <Link
              aria-current={gender === "men" ? "page" : undefined}
              href={rankingHref(view, "men")}
            >
              Men
            </Link>
            <Link
              aria-current={gender === "women" ? "page" : undefined}
              href={rankingHref(view, "women")}
            >
              Women
            </Link>
          </nav>
        </div>

        <header className="rankings-list-header">
          <div>
            <span className="page-eyebrow">
              {view === "world"
                ? "Official tour points"
                : "Match-based playing strength"}
            </span>
            <h2>{gender === "men" ? "Men’s" : "Women’s"} top 200</h2>
          </div>
          <span>
            {view === "world"
              ? (rankings?.latestDates[gender] ?? "Snapshot pending")
              : "Updated with approved matches"}
          </span>
        </header>

        {view === "world" ? (
          <div className="rankings-list">
            {worldRows.map((row) => {
              const content = (
                <>
                  <Numeric>{row.rank}</Numeric>
                  <span
                    className="rankings-list__avatar"
                    style={
                      row.avatarUrl
                        ? { backgroundImage: `url(${row.avatarUrl})` }
                        : undefined
                    }
                  >
                    {!row.avatarUrl ? row.displayName.slice(0, 1) : null}
                  </span>
                  <span className="rankings-list__identity">
                    <strong>{row.displayName}</strong>
                    <small>
                      {row.countryCode ?? "International"} ·{" "}
                      {row.points.toFixed(0)} points
                    </small>
                  </span>
                  <span className="rankings-list__rating">
                    <small>Sand Rating</small>
                    <strong>{row.sandRating?.toFixed(2) ?? "—"}</strong>
                  </span>
                  <span className="rankings-list__movement">
                    {row.previousRank
                      ? `${row.previousRank - row.rank > 0 ? "+" : ""}${row.previousRank - row.rank}`
                      : "new"}
                  </span>
                  {row.handle ? <ArrowRight aria-hidden size={17} /> : <span />}
                </>
              );
              return row.handle ? (
                <Link
                  href={`/players/${row.handle}`}
                  key={`${row.rank}-${row.displayName}`}
                >
                  {content}
                </Link>
              ) : (
                <div key={`${row.rank}-${row.displayName}`}>{content}</div>
              );
            })}
          </div>
        ) : (
          <div className="rankings-list">
            {dunaRows.map((row) => (
              <Link href={`/players/${row.handle}`} key={row.personId}>
                <Numeric>{row.rank}</Numeric>
                <span
                  className="rankings-list__avatar"
                  style={
                    row.avatarUrl
                      ? { backgroundImage: `url(${row.avatarUrl})` }
                      : undefined
                  }
                >
                  {!row.avatarUrl ? row.displayName.slice(0, 1) : null}
                </span>
                <span className="rankings-list__identity">
                  <strong>{row.displayName}</strong>
                  <small>
                    {row.ratedMatches} rated matches · {row.confidence}
                  </small>
                </span>
                <span className="rankings-list__rating">
                  <small>Sand Rating</small>
                  <strong>{row.sandRating.toFixed(2)}</strong>
                </span>
                <span className="rankings-list__movement">
                  {row.worldRanking ? `World #${row.worldRanking.rank}` : "—"}
                </span>
                <ArrowRight aria-hidden size={17} />
              </Link>
            ))}
          </div>
        )}
        {(view === "world" ? worldRows : dunaRows).length === 0 ? (
          <p className="profile-empty">
            This ranking snapshot has not been published yet.
          </p>
        ) : null}

        <aside className="rankings-explainer">
          <div>
            <span className="page-eyebrow">Two useful lenses</span>
            <h2>
              Ranking points reward tour results. Sand Rating estimates playing
              strength.
            </h2>
          </div>
          <div>
            <p>
              Official world rankings follow the governing tour’s points and
              eligibility rules. Duna does not alter them.
            </p>
            <p>
              Sand Rating uses approved match outcomes, opponent strength,
              partner composition, score margin, uncertainty, and evidence
              quality.
            </p>
            <Link href="/methodology">
              Read the backtest methodology <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}

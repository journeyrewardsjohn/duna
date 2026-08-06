import type { PublicWorldRankings } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleDot,
  Globe2,
  MoveDownRight,
  MoveUpRight,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { CountryCode } from "@/components/country-code";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";

export const metadata: Metadata = {
  title: "Beach volleyball world and Sand Rating rankings",
  description:
    "Explore the top 200 men's and women's beach volleyball players by official world ranking and Duna Sand Rating, with verified player profiles and match evidence.",
  alternates: { canonical: "/rankings" },
  openGraph: {
    title: "Beach volleyball player rankings · Duna",
    description:
      "Official world tour points and Duna's evidence-based Sand Rating in one player index.",
    type: "website",
    url: "/rankings",
    siteName: "Duna",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beach volleyball player rankings · Duna",
    description:
      "Official world tour points and Duna's evidence-based Sand Rating in one player index.",
  },
};

type Gender = "men" | "women";
type RankingView = "world" | "duna";
type WorldRow = PublicWorldRankings["world"][Gender][number];
type DunaRow = PublicWorldRankings["duna"][Gender][number];

function rankingHref(view: RankingView, gender: Gender) {
  return `/rankings?view=${view}&gender=${gender}`;
}

function movement(row: WorldRow) {
  return row.previousRank === undefined
    ? undefined
    : row.previousRank - row.rank;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  const topRows = (view === "world" ? worldRows : dunaRows).slice(0, 3);
  const enrichedTop = await Promise.all(
    topRows.map(async (row) => {
      const intelligence = row.handle
        ? await caller.public
            .playerIntelligence({ handle: row.handle })
            .catch(() => undefined)
        : undefined;
      return { row, intelligence };
    }),
  );
  const activeRows = view === "world" ? worldRows : dunaRows;
  const pulseValues = activeRows
    .slice(0, 28)
    .map((row) =>
      view === "world" ? (row as WorldRow).points : (row as DunaRow).sandRating,
    );
  const pulseMin = Math.min(...pulseValues, 0);
  const pulseMax = Math.max(...pulseValues, 1);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${absolutePublicUrl("/rankings")}#page`,
        url: absolutePublicUrl(rankingHref(view, gender)),
        name: `${gender === "men" ? "Men's" : "Women's"} beach volleyball ${view === "world" ? "world rankings" : "Sand Rating rankings"}`,
        description: metadata.description,
        mainEntity: { "@id": `${absolutePublicUrl("/rankings")}#list` },
      },
      {
        "@type": "ItemList",
        "@id": `${absolutePublicUrl("/rankings")}#list`,
        name: `${gender === "men" ? "Men's" : "Women's"} top beach volleyball players`,
        numberOfItems: activeRows.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: activeRows.map((row) => ({
          "@type": "ListItem",
          position: row.rank,
          name: row.displayName,
          url: row.publicPath ? absolutePublicUrl(row.publicPath) : undefined,
          item: {
            "@type": "Person",
            name: row.displayName,
            nationality: row.countryCode
              ? { "@type": "Country", name: row.countryCode }
              : undefined,
          },
        })),
      },
      {
        "@type": "Dataset",
        name: "Duna beach volleyball ranking index",
        description:
          "A connected snapshot of official world tour points and Duna Sand Rating evidence.",
        creator: { "@type": "Organization", name: "Duna" },
        dateModified: rankings?.latestDates[gender],
        measurementTechnique:
          view === "world"
            ? "Official governing tour ranking points"
            : "Duna Sand Rating methodology",
      },
    ],
  };

  return (
    <main className="rankings-page rankings-v2" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section className="rankings-hero rankings-v2__hero">
        <div>
          <Badge>
            <Globe2 aria-hidden size={14} /> Duna player intelligence
          </Badge>
          <h1>The players shaping beach volleyball now.</h1>
          <p>
            Official tour points show who has earned position. Sand Rating
            estimates current playing strength from approved results. Explore
            both lenses, then open the match evidence behind each athlete.
          </p>
          <div className="rankings-v2__hero-links">
            <Link href={rankingHref("world", gender)}>
              World ranking <Trophy aria-hidden size={16} />
            </Link>
            <Link href={rankingHref("duna", gender)}>
              Sand Rating <ChartNoAxesCombined aria-hidden size={16} />
            </Link>
          </div>
        </div>
        <div className="rankings-v2__signal">
          <span className="page-eyebrow">
            Top {gender === "men" ? "men" : "women"}
          </span>
          <Numeric tier="monument">{activeRows.length}</Numeric>
          <p>ranked players in this connected snapshot</p>
          <div aria-label="Ranking distribution" className="rankings-pulse">
            {pulseValues.map((value, index) => (
              <i
                key={`${index}-${value}`}
                style={{
                  height: `${18 + ((value - pulseMin) / Math.max(0.01, pulseMax - pulseMin)) * 82}%`,
                }}
              />
            ))}
          </div>
          <div>
            <span>
              <Numeric tier="block">{mappedProfiles}</Numeric>
              <small>public profiles</small>
            </span>
            <span>
              <Numeric tier="block">{dunaRows.length}</Numeric>
              <small>Sand Rated</small>
            </span>
          </div>
        </div>
      </section>

      <section className="rankings-content rankings-v2__content">
        <div className="rankings-tabs rankings-v2__tabs">
          <nav aria-label="Ranking system">
            <Link
              aria-current={view === "world" ? "page" : undefined}
              href={rankingHref("world", gender)}
            >
              <Trophy aria-hidden size={17} /> World ranking
            </Link>
            <Link
              aria-current={view === "duna" ? "page" : undefined}
              href={rankingHref("duna", gender)}
            >
              <ChartNoAxesCombined aria-hidden size={17} /> Duna Sand Rating
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

        {enrichedTop.length > 0 && (
          <section className="ranking-podium">
            {enrichedTop.map(({ row, intelligence }, index) => {
              const image =
                intelligence?.profile?.cutoutImageUrl ?? row.avatarUrl;
              const country = row.countryCode;
              const worldRow = view === "world" ? (row as WorldRow) : undefined;
              const dunaRow = view === "duna" ? (row as DunaRow) : undefined;
              const card = (
                <>
                  <div className="ranking-podium__art">
                    <Numeric tier="monument">#{row.rank}</Numeric>
                    {image ? (
                      <span
                        className="ranking-podium__image"
                        style={{ backgroundImage: `url("${image}")` }}
                      />
                    ) : (
                      <strong className="ranking-podium__initials">
                        {initials(row.displayName)}
                      </strong>
                    )}
                  </div>
                  <div className="ranking-podium__copy">
                    <small>
                      <CountryCode code={country} />
                    </small>
                    <h2>{row.displayName}</h2>
                    <div>
                      <span>
                        <small>
                          {view === "world" ? "Tour points" : "Sand Rating"}
                        </small>
                        <Numeric tier="block">
                          {view === "world"
                            ? worldRow!.points.toFixed(0)
                            : dunaRow!.sandRating.toFixed(2)}
                        </Numeric>
                      </span>
                      <span>
                        <small>
                          {view === "world" ? "Sand Rating" : "Rated matches"}
                        </small>
                        <Numeric tier="block">
                          {view === "world"
                            ? (worldRow!.sandRating?.toFixed(2) ?? "—")
                            : dunaRow!.ratedMatches}
                        </Numeric>
                      </span>
                    </div>
                    {row.publicPath && (
                      <span className="ranking-podium__open">
                        Player profile <ArrowRight aria-hidden size={15} />
                      </span>
                    )}
                  </div>
                </>
              );
              return row.publicPath ? (
                <Link
                  data-place={index + 1}
                  href={row.publicPath}
                  key={`${row.personId ?? row.publicPath}-${row.rank}-${index}`}
                >
                  {card}
                </Link>
              ) : (
                <article
                  data-place={index + 1}
                  key={`${row.personId ?? row.displayName}-${row.rank}-${index}`}
                >
                  {card}
                </article>
              );
            })}
          </section>
        )}

        <header className="rankings-list-header rankings-v2__list-header">
          <div>
            <span className="page-eyebrow">
              {view === "world"
                ? "Official tour points"
                : "Match-based playing strength"}
            </span>
            <h2>
              {gender === "men" ? "Men’s" : "Women’s"} top{" "}
              <Numeric tier="block">200</Numeric>
            </h2>
          </div>
          {view === "world" && rankings?.latestDates[gender] ? (
            <Numeric tier="table">{rankings.latestDates[gender]}</Numeric>
          ) : (
            <span>
              {view === "world"
                ? "Snapshot pending"
                : "Updated with approved matches"}
            </span>
          )}
        </header>

        <div className="rankings-list rankings-v2__list">
          {view === "world"
            ? worldRows.map((row, index) => (
                <RankingRow
                  content={
                    <>
                      <span className="rankings-list__identity">
                        <strong>{row.displayName}</strong>
                        <small>
                          <CountryCode code={row.countryCode} /> ·{" "}
                          <Numeric tier="table">
                            {row.points.toFixed(0)}
                          </Numeric>{" "}
                          points
                        </small>
                      </span>
                      <span className="rankings-list__rating">
                        <small>Sand Rating</small>
                        <Numeric tier="table">
                          {row.sandRating?.toFixed(2) ?? "—"}
                        </Numeric>
                      </span>
                      <Movement value={movement(row)} />
                    </>
                  }
                  key={`${row.personId ?? row.publicPath ?? row.displayName}-${row.rank}-${index}`}
                  row={row}
                />
              ))
            : dunaRows.map((row) => (
                <RankingRow
                  content={
                    <>
                      <span className="rankings-list__identity">
                        <strong>{row.displayName}</strong>
                        <small>
                          <CountryCode code={row.countryCode} />{" "}
                          <Numeric tier="table">{row.ratedMatches}</Numeric>{" "}
                          rated matches · {row.confidence}
                        </small>
                      </span>
                      <span className="rankings-list__rating">
                        <small>Sand Rating</small>
                        <Numeric tier="table">
                          {row.sandRating.toFixed(2)}
                        </Numeric>
                      </span>
                      <span className="rankings-list__movement">
                        {row.worldRanking ? (
                          <>
                            World #
                            <Numeric tier="table">
                              {row.worldRanking.rank}
                            </Numeric>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </>
                  }
                  key={row.personId}
                  row={row}
                />
              ))}
        </div>
        {activeRows.length === 0 && (
          <p className="profile-empty">
            This ranking snapshot has not been published yet.
          </p>
        )}

        <aside className="rankings-explainer rankings-v2__explainer">
          <div>
            <Sparkles aria-hidden size={25} />
            <span className="page-eyebrow">Two useful lenses</span>
            <h2>Position and playing strength are not the same thing.</h2>
          </div>
          <div>
            <p>
              Official world rankings follow the governing tour’s points,
              eligibility, and expiration rules. Duna preserves that snapshot.
            </p>
            <p>
              Sand Rating uses approved outcomes, opponent strength, partner
              composition, score margin, uncertainty, and evidence quality to
              estimate the form a player brings to the next match.
            </p>
            <Link href="/methodology">
              Read the backtest methodology <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}

function Movement({ value }: { readonly value?: number }) {
  if (value === undefined) {
    return <span className="rankings-list__movement">New</span>;
  }
  if (value === 0) {
    return (
      <span className="rankings-list__movement" data-direction="flat">
        <CircleDot aria-hidden size={14} />
        <Numeric tier="chip">0</Numeric>
      </span>
    );
  }
  return (
    <span
      className="rankings-list__movement"
      data-direction={value > 0 ? "up" : "down"}
    >
      {value > 0 ? (
        <MoveUpRight aria-hidden size={15} />
      ) : (
        <MoveDownRight aria-hidden size={15} />
      )}
      <Numeric tier="chip">
        {value > 0 ? "+" : ""}
        {value}
      </Numeric>
    </span>
  );
}

function RankingRow({
  content,
  row,
}: {
  readonly content: React.ReactNode;
  readonly row: {
    readonly rank: number;
    readonly displayName: string;
    readonly handle?: string;
    readonly publicPath?: string;
    readonly avatarUrl?: string;
  };
}) {
  const inner = (
    <>
      <Numeric tier="table">{row.rank}</Numeric>
      <span
        className="rankings-list__avatar"
        style={
          row.avatarUrl
            ? { backgroundImage: `url("${row.avatarUrl}")` }
            : undefined
        }
      >
        {!row.avatarUrl ? initials(row.displayName) : null}
      </span>
      {content}
      {row.publicPath ? <ArrowRight aria-hidden size={18} /> : <span />}
    </>
  );
  return row.publicPath ? (
    <Link href={row.publicPath}>{inner}</Link>
  ) : (
    <div>{inner}</div>
  );
}

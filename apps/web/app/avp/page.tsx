import type { Metadata } from "next";
import { Badge } from "@duna/ui";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  GitBranch,
  Radio,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { ProEventCard } from "@/components/pro-event-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TourBrandMark } from "@/components/tour-brand-mark";
import {
  avpBracketRound,
  isAvpChampionship,
  selectOfficialAvpCoverage,
  type AvpEvent,
  type AvpMatch,
} from "@/lib/avp";
import { createPublicCaller } from "@/lib/public-api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import styles from "./avp-page.module.css";

const officialAvpUrl = "https://avp.com/";
const officialLeagueUrl = "https://avp.com/league/";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "AVP beach volleyball events, brackets, and results",
  description:
    "Follow official AVP.com events, AVP League championships, brackets, live matches, and results on Duna.",
  alternates: { canonical: absolutePublicUrl("/avp") },
  openGraph: {
    title: "Official AVP coverage on Duna",
    description:
      "AVP events, championship brackets, live matches, and results from official AVP sources.",
    type: "website",
    url: absolutePublicUrl("/avp"),
  },
};

function matchTime(match: AvpMatch): number {
  const value = match.scheduledAt ?? match.playedAt;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function matchStatus(match: AvpMatch): "scheduled" | "live" | "completed" {
  return (
    match.status ??
    (match.winnerSide === "A" || match.winnerSide === "B"
      ? "completed"
      : "scheduled")
  );
}

function syncedLabel(events: readonly AvpEvent[]): string {
  const latest = events
    .map((event) => Date.parse(event.lastSyncedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (!latest) return "Waiting for first sync";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(latest));
}

function MatchResult({ match }: { readonly match: AvpMatch }) {
  return (
    <ProfessionalMatchCard
      context={match.title}
      href={match.canonicalPath ?? "/avp"}
      playedAt={match.scheduledAt ?? match.playedAt}
      roundLabel={match.roundLabel ?? "AVP match"}
      sets={match.sets}
      source="avp"
      status={matchStatus(match)}
      teamA={match.teamA}
      teamB={match.teamB}
      winnerSide={
        match.winnerSide === "A" || match.winnerSide === "B"
          ? match.winnerSide
          : undefined
      }
    />
  );
}

function ChampionshipBracket({
  event,
  matches,
}: {
  readonly event: AvpEvent;
  readonly matches: readonly AvpMatch[];
}) {
  const rounds = (["Quarterfinals", "Semifinals", "Final"] as const).map(
    (round) => ({
      round,
      matches: matches
        .filter((match) => avpBracketRound(match) === round)
        .toSorted((a, b) => matchTime(a) - matchTime(b)),
    }),
  );
  return (
    <article className={styles.bracket}>
      <header>
        <div>
          <span>{event.genderCategory}</span>
          <h3>{event.name}</h3>
          <p>{event.location ?? "Location pending"}</p>
        </div>
        <Link href={`/events/${event.slug}`}>
          Full event <ArrowUpRight aria-hidden size={15} />
        </Link>
      </header>
      <div className={styles.bracketRounds}>
        {rounds.map(({ round, matches: roundMatches }) => (
          <section key={round}>
            <div>
              <span>{round}</span>
              <Badge>{roundMatches.length}</Badge>
            </div>
            {roundMatches.length > 0 ? (
              roundMatches.map((match) => (
                <MatchResult key={match.id} match={match} />
              ))
            ) : (
              <p>Matchup pending from the official bracket.</p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

function EventShelf({
  events,
  eyebrow,
  title,
}: {
  readonly events: readonly AvpEvent[];
  readonly eyebrow: string;
  readonly title: string;
}) {
  if (events.length === 0) return null;
  return (
    <section className={styles.eventShelf}>
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Badge>{events.length}</Badge>
      </header>
      <div className="pro-event-grid">
        {events.map((event) => (
          <ProEventCard event={event} key={event.id} />
        ))}
      </div>
    </section>
  );
}

export default async function AvpPage() {
  const caller = createPublicCaller();
  const coverage = await caller.public.proCoverage().catch(() => undefined);
  const avp = selectOfficialAvpCoverage(coverage);
  const championshipEvents = avp.events.filter(isAvpChampionship);
  const activeEvents = avp.events.filter(
    (event) => event.status === "live" || event.status === "upcoming",
  );
  const completedEvents = avp.events.filter(
    (event) => event.status === "completed",
  );
  const completedMatches = avp.matches.filter(
    (match) => matchStatus(match) === "completed",
  );
  const latestResults = completedMatches
    .toSorted((a, b) => matchTime(b) - matchTime(a))
    .slice(0, 10);
  const liveMatches = avp.matches.filter(
    (match) => matchStatus(match) === "live",
  ).length;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absolutePublicUrl("/avp")}#webpage`,
    url: absolutePublicUrl("/avp"),
    name: "Official AVP beach volleyball coverage",
    description: metadata.description,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: avp.events.length,
      itemListElement: avp.events.map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: event.name,
        url: absolutePublicUrl(`/events/${event.slug}`),
      })),
    },
  };

  return (
    <main className={styles.page} data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Badge tone={liveMatches > 0 ? "danger" : "neutral"}>
            {liveMatches > 0 ? (
              <Radio aria-hidden size={12} />
            ) : (
              <Trophy aria-hidden size={12} />
            )}
            {liveMatches > 0
              ? `${liveMatches} live matches`
              : "Official AVP coverage"}
          </Badge>
          <div className={styles.heroBrand}>
            <TourBrandMark brand="avp" />
          </div>
          <h1>Every official AVP event. One clear bracket.</h1>
          <p>
            Follow AVP League championships, Heritage events, scheduled
            matchups, and final scores. This page includes professional events
            published by AVP.com only—not AVP America or third-party listings.
          </p>
          <div className={styles.heroActions}>
            <a href={officialLeagueUrl} rel="noreferrer" target="_blank">
              Official AVP League <ArrowUpRight aria-hidden size={16} />
            </a>
            <Link href="/pro?tour=avp">Open AVP in Duna Pro</Link>
          </div>
        </div>
        <aside className={styles.heroPanel}>
          <div>
            <Activity aria-hidden size={19} />
            <span>Coverage status</span>
          </div>
          <dl>
            <div>
              <dt>Official events</dt>
              <dd>{avp.events.length}</dd>
            </div>
            <div>
              <dt>Match results</dt>
              <dd>{completedMatches.length}</dd>
            </div>
            <div>
              <dt>Championships</dt>
              <dd>{championshipEvents.length}</dd>
            </div>
          </dl>
          <p>
            <CheckCircle2 aria-hidden size={15} /> Last Duna sync:{" "}
            {syncedLabel(avp.events)}
          </p>
        </aside>
      </section>

      <div className={styles.content}>
        <section className={styles.sourceNote}>
          <CheckCircle2 aria-hidden size={20} />
          <div>
            <strong>Official-source boundary</strong>
            <p>
              Event identity, brackets, schedules, and results are limited to
              the AVP League and professional tournament feeds published by
              AVP.com.
            </p>
          </div>
          <a href={officialAvpUrl} rel="noreferrer" target="_blank">
            AVP.com <ArrowUpRight aria-hidden size={14} />
          </a>
        </section>

        <section className={styles.championships}>
          <header>
            <div>
              <span>Championship center</span>
              <h2>Bracket and outcomes</h2>
              <p>
                Quarterfinals advance into the semifinals and championship match
                as the official AVP results update.
              </p>
            </div>
            <GitBranch aria-hidden size={28} />
          </header>
          {championshipEvents.length > 0 ? (
            <div className={styles.brackets}>
              {championshipEvents.map((event) => (
                <ChampionshipBracket
                  event={event}
                  key={event.id}
                  matches={avp.matches.filter(
                    (match) => match.externalEventId === event.externalEventId,
                  )}
                />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <GitBranch aria-hidden size={22} />
              <p>
                The current championship bracket is waiting for its next
                official AVP sync.
              </p>
            </div>
          )}
        </section>

        <EventShelf
          events={activeEvents}
          eyebrow="Live and scheduled"
          title="AVP events now and next"
        />

        <section className={styles.results}>
          <header>
            <div>
              <span>Official outcomes</span>
              <h2>Latest AVP results</h2>
            </div>
            <Activity aria-hidden size={24} />
          </header>
          {latestResults.length > 0 ? (
            <div>
              {latestResults.map((match) => (
                <MatchResult key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <CalendarDays aria-hidden size={22} />
              <p>
                Official AVP results will appear after the next completed match
                sync.
              </p>
            </div>
          )}
        </section>

        <EventShelf
          events={completedEvents}
          eyebrow="Season archive"
          title="Completed official events"
        />
      </div>
      <SiteFooter />
    </main>
  );
}

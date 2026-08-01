import { Badge, Numeric } from "@duna/ui";
import { Activity, CalendarDays, Globe2, Radio, Trophy } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Pro beach volleyball",
  description:
    "Live FIVB events, recent results, and Volleyball World rankings on Duna.",
};

export default async function ProTourPage() {
  const caller = await getServerCaller();
  const coverage = await caller.public.proCoverage().catch(() => undefined);
  const liveEvents =
    coverage?.events.filter((event) => event.status === "live") ?? [];
  return (
    <main className="pro-tour-page">
      <SiteHeader />
      <section className="pro-tour-hero">
        <div>
          <Badge tone={liveEvents.length ? "danger" : "neutral"}>
            <Radio aria-hidden size={12} />
            {liveEvents.length ? `${liveEvents.length} live now` : "Pro tour"}
          </Badge>
          <h1>The world&apos;s game, in one live view.</h1>
          <p>
            FIVB events and results from fivb.12ndr, plus published Volleyball
            World rankings—connected to the same player identities and match
            history used throughout Duna.
          </p>
        </div>
        <div className="pro-tour-hero__orb">
          <Globe2 aria-hidden size={54} />
          <Numeric>{coverage?.events.length ?? 0}</Numeric>
          <span>tracked events</span>
        </div>
      </section>

      <section className="pro-tour-content">
        <section className="pro-event-section">
          <header>
            <div>
              <span className="page-eyebrow">Now + next</span>
              <h2>Professional events</h2>
            </div>
            <Badge>{coverage?.events.length ?? 0}</Badge>
          </header>
          <div className="pro-event-grid">
            {(coverage?.events ?? []).map((event) => (
              <article key={event.id}>
                <div>
                  <Badge tone={event.live ? "danger" : "neutral"}>
                    {event.live ? "Live" : event.status}
                  </Badge>
                  <span>{event.genderCategory}</span>
                </div>
                <Trophy aria-hidden size={25} />
                <h3>{event.name}</h3>
                <p>{event.category ?? "FIVB Beach Volleyball"}</p>
                <footer>
                  <span>
                    <CalendarDays aria-hidden size={14} />
                    {event.startsOn ?? "Date pending"}
                  </span>
                  <span>{event.location ?? "Location pending"}</span>
                </footer>
              </article>
            ))}
          </div>
          {!coverage?.events.length && (
            <p className="profile-empty">
              The event index has not been refreshed yet.
            </p>
          )}
        </section>

        <section className="pro-live-results">
          <header>
            <div>
              <span className="page-eyebrow">Live reporting</span>
              <h2>Latest match updates</h2>
            </div>
            <Activity aria-hidden size={22} />
          </header>
          <div>
            {(coverage?.matches ?? []).slice(0, 20).map((match) => {
              const team = (side: "A" | "B") =>
                match.participants
                  .filter((participant) => participant.side === side)
                  .map((participant) => participant.name)
                  .join(" / ");
              return (
                <article key={match.id}>
                  <div>
                    <small>{match.roundLabel ?? match.title}</small>
                    <strong>{team("A")}</strong>
                    <span>{team("B")}</span>
                  </div>
                  <div>
                    <strong>
                      {match.sets
                        .map((set) => `${set.a}–${set.b}`)
                        .join(" · ") || "Scheduled"}
                    </strong>
                    <small>
                      {match.playedAt
                        ? new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                          }).format(new Date(match.playedAt))
                        : "Time pending"}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="world-ranking-section">
          <header>
            <div>
              <span className="page-eyebrow">Official ranking snapshot</span>
              <h2>Volleyball World</h2>
            </div>
            <span>{coverage?.rankingDate ?? "Not refreshed"}</span>
          </header>
          <div className="world-ranking-grid">
            {(["men", "women"] as const).map((gender) => (
              <section key={gender}>
                <h3>{gender}</h3>
                {(coverage?.rankings ?? [])
                  .filter((ranking) => ranking.genderCategory === gender)
                  .slice(0, 10)
                  .map((ranking) => (
                    <article key={ranking.id}>
                      <Numeric>{ranking.rank}</Numeric>
                      <div>
                        <strong>{ranking.displayName}</strong>
                        <small>
                          {ranking.countryCode ?? "—"} ·{" "}
                          {ranking.points.toFixed(0)} pts
                        </small>
                      </div>
                      <span>
                        {ranking.previousRank
                          ? `was ${ranking.previousRank}`
                          : "new"}
                      </span>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

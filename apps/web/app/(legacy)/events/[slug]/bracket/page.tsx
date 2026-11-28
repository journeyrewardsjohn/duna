import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventTournamentDesk } from "@/components/event-tournament-desk";
import { TournamentPredictionMarkets } from "@/components/prediction-market";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

/**
 * A club tournament's full desk, unchanged: pools, brackets, King/Queen of
 * the Beach boards, results and the event's predictions. The event's public
 * face is `/events/[slug]` (SITE-5), which links here whenever a draw or
 * predictions exist, until the events package rebuilds the desk. Not
 * indexed; canonical to the event page.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Bracket and results",
    alternates: { canonical: `/events/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function EventBracketPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const event = await caller.public
    .eventBySlug({ slug })
    .catch(() => undefined);
  if (!event) notFound();
  const [competition, predictions, wallet] = await Promise.all([
    caller.public.tournamentCompetition({ slug }).catch(() => undefined),
    caller.public
      .eventPredictionMarkets({ eventSlug: slug })
      .catch(() => undefined),
    caller.player.predictionWallet().catch(() => undefined),
  ]);
  return (
    <main className="event-public" data-zone="athletic">
      <SiteHeader />
      <section className="event-public__layout">
        <div className="event-public__content">
          <Link href={`/events/${event.slug}`}>Back to {event.title}</Link>
          <h1>{event.title}: bracket and results</h1>
          {competition?.divisions.length ? (
            <EventTournamentDesk snapshot={competition} />
          ) : (
            <p>The draw for this event hasn&apos;t been published yet.</p>
          )}
          {predictions && predictions.markets.length > 0 ? (
            <div id="predictions">
              <TournamentPredictionMarkets
                entries={predictions.entries}
                eventSlug={event.slug}
                markets={predictions.markets}
                returnTo={`/events/${event.slug}/bracket`}
                targetKind="event-team"
                wallet={wallet}
              />
            </div>
          ) : null}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

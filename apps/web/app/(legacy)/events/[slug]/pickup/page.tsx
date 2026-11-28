import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PickupEventActions } from "@/components/pickup-event-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

/**
 * Joining or hosting a pickup game: ask to join, the host's requests,
 * invites, attendance, edit and cancel, unchanged. The game's public face is
 * `/events/[slug]` (SITE-5), whose action leads here until pickup hosting
 * is rebuilt. Not indexed.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Join or manage this game",
    alternates: { canonical: `/events/${slug}` },
    robots: { index: false, follow: false },
  };
}

export default async function PickupParticipationPage({
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
  if (event.kind !== "pickup") redirect(`/events/${slug}`);
  const management = await caller.player
    .pickupManagement({ pickupSessionId: event.id })
    .catch(() => undefined);
  const phase = event.live
    ? "live"
    : event.lifecycleStatus === "completed"
      ? "completed"
      : event.lifecycleStatus === "cancelled"
        ? "cancelled"
        : "upcoming";
  return (
    <main className="standard-page" data-zone="athletic">
      <SiteHeader />
      <section className="event-public__layout">
        <div className="event-public__content">
          <Link href={`/events/${event.slug}`}>Back to {event.title}</Link>
          <h1>{event.title}</h1>
        </div>
        <aside className="event-public__booking">
          <PickupEventActions
            approvalRequired={event.approvalRequired ?? false}
            management={management}
            paidMatch={event.price.amountMinor > 0}
            phase={phase}
            pickupSessionId={event.id}
            slug={event.slug}
          />
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}

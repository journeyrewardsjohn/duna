import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/checkout-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    division?: string;
    ticket?: string;
    team?: string;
    session_id?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [event, dashboard, wallet, settings, searchablePlayers] =
    await Promise.all([
      caller.public.eventBySlug({ slug }).catch(() => undefined),
      caller.player.dashboard(),
      caller.player.wallet(),
      caller.player.settings(),
      caller.public.players({ limit: 24 }),
    ]);
  if (!event) notFound();
  return (
    <main className="standard-page checkout-page">
      <CheckoutPanel
        event={event}
        initialDivisionId={query.division}
        initialTicketTypeId={query.ticket}
        initialTeamClaimToken={query.team}
        isDunaPlus={Boolean(
          settings.membership &&
          ["active", "trialing"].includes(settings.membership.status) &&
          !settings.membership.pausedUntil,
        )}
        initialCheckoutSessionId={
          query.checkout === "success" ? query.session_id : undefined
        }
        initialNotice={
          query.checkout === "cancelled"
            ? "Checkout was cancelled. Your temporary spot will be released automatically."
            : undefined
        }
        player={dashboard.player}
        searchablePlayers={searchablePlayers}
        participants={[
          {
            person: settings.profile.person,
            label: "You",
            available: settings.profile.ageBand === "adult",
          },
          ...settings.household
            .filter((member) => member.role === "dependent")
            .map((member) => ({
              person: member.person,
              label: member.relationship,
              available: member.verified,
            })),
        ]}
        walletAvailableMinor={wallet.availableMinor}
      />
    </main>
  );
}

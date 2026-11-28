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
    quantity?: string;
    team?: string;
    participant?: string;
    session_id?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedTicketQuantity = query.quantity
    ? Number.parseInt(query.quantity, 10)
    : undefined;
  const caller = await getServerCaller();
  const [event, dashboard, wallet, settings, searchablePlayers] =
    await Promise.all([
      caller.public.eventBySlug({ slug }).catch(() => undefined),
      caller.player.dashboard(),
      caller.player.wallet(),
      caller.player.settings(),
      caller.public.players({ limit: 50 }),
    ]);
  if (!event) notFound();
  const postPurchaseWaiverRequirements =
    query.checkout === "success" && event.organizationId
      ? await caller.player
          .waiverRequirements({
            organizationId: event.organizationId,
            subjectPersonId: query.participant,
            waiverDocumentIds: event.policies
              ?.filter(
                (policy) =>
                  policy.kind === "waiver" && Boolean(policy.waiverDocumentId),
              )
              .map((policy) => policy.waiverDocumentId!)
              .slice(0, 20),
          })
          .catch(() => [])
      : [];
  return (
    <main className="standard-page checkout-page">
      <CheckoutPanel
        event={event}
        initialDivisionId={query.division}
        initialTicketTypeId={query.ticket}
        initialTicketQuantity={
          Number.isSafeInteger(requestedTicketQuantity) &&
          (requestedTicketQuantity ?? 0) > 0
            ? requestedTicketQuantity
            : undefined
        }
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
        postPurchaseWaiverRequirements={postPurchaseWaiverRequirements}
        participants={[
          {
            person: settings.profile.person,
            label: "You",
            available: settings.profile.ageBand === "adult",
            birthDate: settings.profile.birthDate,
            ageBand: settings.profile.ageBand,
            genderCategory: settings.profile.genderCategory,
            unavailableReason:
              settings.profile.ageBand === "adult"
                ? undefined
                : "An adult guardian must complete registration",
          },
          ...settings.household
            .filter((member) => member.role === "dependent")
            .map((member) => ({
              person: member.person,
              label: member.relationship,
              available: member.verified,
              birthDate: member.birthDate,
              ageBand: member.ageBand,
              genderCategory: member.genderCategory,
              unavailableReason: member.verified
                ? undefined
                : "Guardian verification is still pending",
            })),
        ]}
        walletAvailableMinor={wallet.availableMinor}
      />
    </main>
  );
}

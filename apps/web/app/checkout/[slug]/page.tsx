import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound, redirect } from "next/navigation";
import { PublicEventRegistration } from "@/components/public-event-registration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { playerEventCheckoutHref } from "@/lib/event-checkout";

export const metadata = { title: "Review registration" };

export default async function PublicCheckoutPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{
    division?: string;
    ticket?: string;
    quantity?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const signedIn = isWorkOSAuthKitConfigured()
    ? Boolean((await withAuth()).user)
    : false;
  if (signedIn) {
    redirect(
      playerEventCheckoutHref({
        slug,
        divisionId: query.division,
        ticketTypeId: query.ticket,
        ticketQuantity: query.quantity,
      }),
    );
  }

  const ticketQuantity = query.quantity
    ? Number.parseInt(query.quantity, 10)
    : undefined;
  const caller = await getServerCaller();
  const event = await caller.public
    .eventBySlug({ slug })
    .catch(() => undefined);
  if (!event) notFound();

  return (
    <>
      <SiteHeader />
      <PublicEventRegistration
        event={event}
        initialDivisionId={query.division}
        initialTicketQuantity={
          Number.isSafeInteger(ticketQuantity) && (ticketQuantity ?? 0) > 0
            ? ticketQuantity
            : undefined
        }
        initialTicketTypeId={query.ticket}
      />
      <SiteFooter />
    </>
  );
}

import {
  formatMoney,
  formatVenueTime,
  type EventDivisionSummary,
  type EventSummary,
  type EventTicketSummary,
} from "@duna/core";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleUserRound,
  MapPin,
  ShieldCheck,
  Ticket,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { AuthenticatedEventCheckoutHandoff } from "./authenticated-event-checkout-handoff";

type Selection =
  | { readonly kind: "division"; readonly item: EventDivisionSummary }
  | {
      readonly kind: "ticket";
      readonly item: EventTicketSummary;
      readonly quantity: number;
    };

function selectionFrom(
  event: EventSummary,
  input: {
    readonly divisionId?: string;
    readonly ticketTypeId?: string;
    readonly ticketQuantity?: number;
  },
): Selection | undefined {
  const division = event.divisions?.find(
    (item) => item.id === input.divisionId,
  );
  if (division) return { kind: "division", item: division };

  const ticket = event.tickets?.find((item) => item.id === input.ticketTypeId);
  if (!ticket) return undefined;

  return {
    kind: "ticket",
    item: ticket,
    quantity: Math.max(1, Math.min(10, input.ticketQuantity ?? 1)),
  };
}

function cartHref(
  slug: string,
  selection: Selection | undefined,
  protectedRoute = false,
) {
  const base = `${protectedRoute ? "/app/checkout" : "/checkout"}/${slug}`;
  if (!selection) return base;
  const query = new URLSearchParams(
    selection.kind === "division"
      ? { division: selection.item.id }
      : { ticket: selection.item.id, quantity: String(selection.quantity) },
  );
  return `${base}?${query}`;
}

export function PublicEventRegistration({
  event,
  initialDivisionId,
  initialTicketTypeId,
  initialTicketQuantity,
  authConfigured,
}: {
  readonly event: EventSummary;
  readonly initialDivisionId?: string;
  readonly initialTicketTypeId?: string;
  readonly initialTicketQuantity?: number;
  readonly authConfigured: boolean;
}) {
  const selection = selectionFrom(event, {
    divisionId: initialDivisionId,
    ticketTypeId: initialTicketTypeId,
    ticketQuantity: initialTicketQuantity,
  });
  const returnTo = cartHref(event.slug, selection, true);
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  const signUpHref = `/sign-up?returnTo=${encodeURIComponent(returnTo)}`;
  const starts = formatVenueTime(event.startsAt, event.timezone, "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const isVip =
    selection?.kind === "ticket" &&
    /\b(vip|premium|hospitality|reserved)\b/i.test(
      `${selection.item.name} ${selection.item.description ?? ""}`,
    );
  const itemPrice =
    selection?.kind === "ticket"
      ? selection.item.price.amountMinor * selection.quantity
      : selection?.item.teamPrice.amountMinor;
  const itemCurrency = selection?.item.price.currency;

  return (
    <main className="public-registration" data-zone="editorial">
      {authConfigured ? (
        <AuthenticatedEventCheckoutHandoff checkoutHref={returnTo} />
      ) : null}
      <section className="public-registration__hero">
        <div>
          <span className="section__eyebrow">YOUR EVENT CART</span>
          <h1>Review your place on the sand.</h1>
          <p>
            Keep browsing, review your event details, then use a free Duna
            account only when you are ready to securely complete registration.
          </p>
        </div>
        <div className="public-registration__event-facts">
          <span>
            <CalendarDays aria-hidden size={18} />
            <small>When</small>
            <strong>{starts}</strong>
          </span>
          <span>
            <MapPin aria-hidden size={18} />
            <small>Where</small>
            <strong>{event.location?.venueName ?? event.venueName}</strong>
          </span>
        </div>
      </section>

      <section
        className="public-registration__body"
        aria-label="Registration cart"
      >
        <div className="public-registration__cart">
          <header>
            <span>
              <Ticket aria-hidden size={19} /> Cart
            </span>
            <Link href={`/events/${event.slug}`}>Back to event</Link>
          </header>

          {selection ? (
            <article
              className={
                isVip
                  ? "public-registration__item is-vip"
                  : "public-registration__item"
              }
            >
              <span className="public-registration__item-icon">
                {selection.kind === "division" ? (
                  <Trophy aria-hidden size={22} />
                ) : (
                  <Ticket aria-hidden size={22} />
                )}
              </span>
              <div>
                <small>
                  {selection.kind === "division"
                    ? "Player entry"
                    : isVip
                      ? "VIP experience"
                      : "Spectator access"}
                </small>
                <h2>{selection.item.name}</h2>
                <p>
                  {selection.kind === "division"
                    ? `${selection.item.teamSize ?? 1}-player team · ${selection.item.description ?? "Eligible players are checked before payment."}`
                    : `${selection.quantity} ${selection.quantity === 1 ? "ticket" : "tickets"} · ${selection.item.description ?? "Event access included."}`}
                </p>
              </div>
              <strong>
                {itemPrice === 0 || itemPrice === undefined
                  ? "Free"
                  : formatMoney(
                      itemPrice,
                      itemCurrency ?? event.price.currency,
                    )}
              </strong>
            </article>
          ) : (
            <article className="public-registration__empty">
              <Ticket aria-hidden size={22} />
              <div>
                <strong>Choose what you want to reserve.</strong>
                <p>
                  Select a player division or ticket on the event page; your
                  cart will stay in view before you create an account.
                </p>
              </div>
              <Link href={`/events/${event.slug}`}>Choose options</Link>
            </article>
          )}

          <div className="public-registration__checkout-note">
            <Check aria-hidden size={17} />
            <span>
              <strong>No account wall before this point.</strong>
              <small>
                You will add your team, accept any event agreements, and pay
                after securely signing in or creating your free Duna account.
              </small>
            </span>
          </div>
        </div>

        <aside className="public-registration__identity">
          <span className="public-registration__identity-icon">
            <CircleUserRound aria-hidden size={23} />
          </span>
          <span className="section__eyebrow">ONE LAST STEP</span>
          <h2>Make the registration yours.</h2>
          <p>
            Your account keeps your confirmation, payment, teammates, and event
            updates together. It is free to create.
          </p>
          <Link
            aria-disabled={!selection}
            className="public-registration__create"
            href={selection ? signUpHref : cartHref(event.slug, undefined)}
          >
            Create free account <ArrowRight aria-hidden size={17} />
          </Link>
          <Link
            aria-disabled={!selection}
            className="public-registration__sign-in"
            href={selection ? signInHref : cartHref(event.slug, undefined)}
          >
            I already have Duna
          </Link>
          <small className="public-registration__secure">
            <ShieldCheck aria-hidden size={15} /> Secure sign-in · your cart
            stays with you
          </small>
        </aside>
      </section>
    </main>
  );
}

import type { DiscoveryMapItem } from "@duna/api/discovery-search";
import { Icon } from "@duna/ui/tideline";
import Link from "next/link";
import { ArrowLink } from "../link-button";
import { siteLinks } from "../links";
import { NetLine } from "../net-line";

/** What a rail card shows: a public session or event on Duna, as listed. */
export interface RailSession {
  readonly id: string;
  readonly title: string;
  readonly place: string;
  readonly href: string;
  readonly startsAt: string;
  readonly spotsRemaining?: number;
  readonly level?: string;
  readonly price?: { amountMinor: number; currency: string };
}

const MAX_RAIL = 6;

/** The next public sessions on Duna, soonest first (no invented examples). */
export function railSessions(
  items: ReadonlyArray<DiscoveryMapItem>,
  now: Date = new Date(),
): RailSession[] {
  return items
    .filter(
      (item) =>
        item.entityType === "event" &&
        item.startsAt !== undefined &&
        Date.parse(item.startsAt) >= now.getTime(),
    )
    .sort(
      (left, right) => Date.parse(left.startsAt!) - Date.parse(right.startsAt!),
    )
    .slice(0, MAX_RAIL)
    .map((item) => ({
      id: item.id,
      title: item.title,
      place: item.subtitle,
      href: item.href,
      startsAt: item.startsAt!,
      spotsRemaining: item.spotsRemaining,
      level: item.level,
      price: item.price,
    }));
}

const when = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function priceText(price: RailSession["price"]) {
  if (!price) return null;
  if (price.amountMinor === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: price.amountMinor % 100 === 0 ? 0 : 2,
  }).format(price.amountMinor / 100);
}

/**
 * "There's a game near you." The next public sessions listed on Duna, as a
 * horizontal snap list a keyboard can scroll. With none listed, the empty
 * state offers to add a court and a score. Near-the-visitor ranking waits
 * for the search package (B10); the label says what the list is.
 */
export function SessionRail({
  sessions,
}: {
  readonly sessions: RailSession[];
}) {
  return (
    <section
      aria-labelledby="rail-title"
      className="site-wrap site-section site-section--tight"
    >
      <NetLine label="Coming up on Duna" />
      <div className="site-section__head site-section__head--row">
        <h2 className="site-h2" id="rail-title">
          There’s a game near you.
        </h2>
        <ArrowLink href={siteLinks.findGame}>Search every game</ArrowLink>
      </div>
      {sessions.length > 0 ? (
        <ul
          aria-label="Games coming up, scroll sideways"
          className="site-rail"
          tabIndex={0}
        >
          {sessions.map((session) => {
            const price = priceText(session.price);
            return (
              <li key={session.id}>
                <Link className="site-rail__card" href={session.href}>
                  <span className="site-rail__when td-num">
                    {when.format(new Date(session.startsAt))}
                  </span>
                  <span className="site-rail__title">{session.title}</span>
                  <span className="site-rail__place">
                    <Icon name="pin" size="inline" />
                    {session.place}
                  </span>
                  <span className="site-rail__foot">
                    <span>
                      {session.spotsRemaining !== undefined
                        ? session.spotsRemaining > 0
                          ? `${session.spotsRemaining} ${session.spotsRemaining === 1 ? "spot" : "spots"} left`
                          : "Full"
                        : (session.level ?? "Open to book")}
                    </span>
                    {price ? (
                      <span className="td-num site-rail__price">{price}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="site-rail__empty">
          <p>
            <strong>No open games are listed yet.</strong> Played somewhere? Add
            the court and your score, and it starts here.
          </p>
          <ArrowLink href={siteLinks.addScore}>Add a court and score</ArrowLink>
        </div>
      )}
    </section>
  );
}

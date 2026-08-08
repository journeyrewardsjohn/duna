export interface SiteNavigationQuickAction {
  readonly surface: "player" | "hq";
  readonly product: "Duna Player" | "Duna HQ";
  readonly title: string;
  readonly detail: string;
  readonly startsAt: string;
  readonly href: string;
}

interface NavigationEvent {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName: string;
  readonly organizationName: string;
  readonly lifecycleStatus?: "active" | "cancelled" | "completed";
  readonly host?: { readonly id: string };
}

interface NavigationBooking {
  readonly title: string;
  readonly startsAt: string;
  readonly venueName: string;
}

interface PlayerNavigationSource {
  readonly player: { readonly id: string };
  readonly bookings: readonly NavigationBooking[];
  readonly events: readonly NavigationEvent[];
}

interface HqNavigationSource {
  readonly organization: { readonly name: string };
  readonly events: readonly NavigationEvent[];
}

function futureTimestamp(startsAt: string, now: number): number | undefined {
  const timestamp = new Date(startsAt).getTime();
  return Number.isFinite(timestamp) && timestamp >= now ? timestamp : undefined;
}

function detail(parts: readonly (string | undefined)[]): string {
  return [
    ...new Set(parts.filter((part): part is string => Boolean(part))),
  ].join(" · ");
}

export function selectPlayerNavigationQuickAction(
  source: PlayerNavigationSource,
  now = Date.now(),
): SiteNavigationQuickAction | undefined {
  const nextBooking = source.bookings
    .flatMap((booking) => {
      const timestamp = futureTimestamp(booking.startsAt, now);
      return timestamp === undefined ? [] : [{ booking, timestamp }];
    })
    .sort((left, right) => left.timestamp - right.timestamp)[0]?.booking;

  if (nextBooking) {
    return {
      surface: "player",
      product: "Duna Player",
      title: nextBooking.title,
      detail: nextBooking.venueName,
      startsAt: nextBooking.startsAt,
      href: "/app/play",
    };
  }

  const nextHostedEvent = source.events
    .flatMap((event) => {
      const timestamp = futureTimestamp(event.startsAt, now);
      return timestamp === undefined ||
        event.lifecycleStatus === "cancelled" ||
        event.host?.id !== source.player.id
        ? []
        : [{ event, timestamp }];
    })
    .sort((left, right) => left.timestamp - right.timestamp)[0]?.event;

  return nextHostedEvent
    ? {
        surface: "player",
        product: "Duna Player",
        title: nextHostedEvent.title,
        detail: detail([
          nextHostedEvent.venueName,
          nextHostedEvent.organizationName,
        ]),
        startsAt: nextHostedEvent.startsAt,
        href: "/app",
      }
    : undefined;
}

export function selectHqNavigationQuickAction(
  source: HqNavigationSource,
  hqUrl: string,
  now = Date.now(),
): SiteNavigationQuickAction | undefined {
  const nextEvent = source.events
    .flatMap((event) => {
      const timestamp = futureTimestamp(event.startsAt, now);
      return timestamp === undefined || event.lifecycleStatus === "cancelled"
        ? []
        : [{ event, timestamp }];
    })
    .sort((left, right) => left.timestamp - right.timestamp)[0]?.event;

  return nextEvent
    ? {
        surface: "hq",
        product: "Duna HQ",
        title: nextEvent.title,
        detail: detail([nextEvent.venueName, source.organization.name]),
        startsAt: nextEvent.startsAt,
        href: `${hqUrl.replace(/\/$/, "")}/events/${nextEvent.id}`,
      }
    : undefined;
}

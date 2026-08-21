import { getServerCaller } from "@/lib/api";

type SearchResult = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly category: string;
  readonly kind:
    | "coach"
    | "event"
    | "money"
    | "navigation"
    | "person"
    | "product"
    | "session"
    | "venue";
  readonly badge?: string;
  readonly imageUrl?: string;
  readonly searchText?: string;
};

const navigation: readonly SearchResult[] = [
  {
    id: "nav-home",
    title: "Player home",
    subtitle: "Your next game and recent form",
    href: "/app",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-discover",
    title: "Discover",
    subtitle: "Find events, players, clubs, coaches, and venues",
    href: "/discover",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-play",
    title: "Play",
    subtitle: "Your schedule and court booking",
    href: "/app/play",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-matches",
    title: "Matches",
    subtitle: "History, scores, and ratings",
    href: "/app/matches",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-video",
    title: "Video",
    subtitle: "Recordings and live play",
    href: "/app/video",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-health",
    title: "Health",
    subtitle: "Readiness and connected health context",
    href: "/app/health",
    category: "Duna Player",
    kind: "navigation",
  },
  {
    id: "nav-wallet",
    title: "Wallet",
    subtitle: "Credits, payments, and memberships",
    href: "/app/wallet",
    category: "Duna Player",
    kind: "navigation",
  },
] as const;

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rank(result: SearchResult, rawQuery: string): number {
  const query = normalized(rawQuery.trim());
  const terms = query.split(/\s+/).filter(Boolean);
  const title = normalized(result.title);
  const subtitle = normalized(`${result.subtitle} ${result.searchText ?? ""}`);
  const category = normalized(result.category);
  if (!terms.every((term) => `${title} ${subtitle} ${category}`.includes(term)))
    return -1;
  let score =
    title === query
      ? 120
      : title.startsWith(query)
        ? 80
        : title.includes(query)
          ? 55
          : 0;
  for (const term of terms) {
    if (title.startsWith(term)) score += 24;
    else if (title.includes(term)) score += 16;
    if (subtitle.includes(term)) score += 7;
    if (category.includes(term)) score += 4;
  }
  return score;
}

function eventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });
  try {
    const caller = await getServerCaller();
    const [players, events, venues, coaches, dashboard] = await Promise.all([
      caller.public.searchPlayers({ query, limit: 14 }).catch(() => []),
      caller.public.events().catch(() => []),
      caller.public.venues().catch(() => []),
      caller.public.coaches().catch(() => []),
      caller.player.dashboard().catch(() => undefined),
    ]);
    const results: SearchResult[] = [...navigation];

    for (const player of players) {
      results.push({
        id: `player-${player.id}`,
        title: player.displayName,
        subtitle: `${player.homeMarket || "Duna player"}${player.sandRating ? ` · ${player.sandRating.toFixed(2)} Sand Rating` : ""}`,
        href: player.publicPath,
        category: "Players",
        kind: "person",
        badge: player.isProfessional ? "pro" : player.profileClaimStatus,
        imageUrl: player.avatarUrl ?? undefined,
        searchText: player.handle,
      });
    }

    for (const coach of coaches) {
      results.push({
        id: `coach-${coach.organizationId}-${coach.personId}`,
        title: coach.displayName,
        subtitle: `${coach.organizationName}${coach.homeMarket ? ` · ${coach.homeMarket}` : ""}`,
        href: `/coaches/${coach.handle}?organization=${encodeURIComponent(coach.organizationSlug)}`,
        category: "Coaches",
        kind: "coach",
        badge: coach.services.length
          ? `${coach.services.length} services`
          : undefined,
        imageUrl: coach.avatarUrl,
        searchText: `${coach.bio ?? ""} ${coach.services.map(({ title }) => title).join(" ")}`,
      });
    }

    for (const event of events) {
      results.push({
        id: `event-${event.id}`,
        title: event.title,
        subtitle: `${eventDate(event.startsAt, event.timezone)} · ${event.venueName}`,
        href: `/events/${event.slug}`,
        category: "Events",
        kind: "event",
        badge: `${event.spotsRemaining} spots`,
        imageUrl: event.imageUrl,
        searchText: `${event.kind} ${event.shortSummary ?? ""} ${event.description ?? ""} ${event.host?.displayName ?? ""}`,
      });
    }

    for (const venue of venues) {
      results.push({
        id: `venue-${venue.id}`,
        title: venue.name,
        subtitle: `${venue.city}, ${venue.region} · ${venue.courtCount} courts`,
        href: `/venues/${venue.id}`,
        category: "Venues",
        kind: "venue",
        badge: venue.openNow ? "open now" : undefined,
        imageUrl: venue.imageUrl,
        searchText: venue.tags.join(" "),
      });
    }

    for (const booking of dashboard?.bookings ?? []) {
      results.push({
        id: `booking-${booking.id}`,
        title: booking.title,
        subtitle: `${eventDate(booking.startsAt, booking.venueTimezone ?? "America/New_York")} · ${booking.venueName}`,
        href: "/app/play",
        category: "Your schedule",
        kind: "session",
        badge: booking.status,
        searchText: `${booking.kind} booking upcoming reservation`,
      });
    }

    const ranked = results
      .map((result) => ({ result, score: rank(result, query) }))
      .filter(({ score }) => score >= 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.result.title.localeCompare(right.result.title),
      )
      .slice(0, 40)
      .map(({ result }) => ({
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        href: result.href,
        category: result.category,
        kind: result.kind,
        badge: result.badge,
        imageUrl: result.imageUrl,
      }));
    return Response.json({ results: ranked });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search is unavailable.";
    return Response.json({ error: message, results: [] }, { status: 401 });
  }
}

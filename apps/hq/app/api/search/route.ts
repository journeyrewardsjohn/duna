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
    id: "nav-overview",
    title: "Overview",
    subtitle: "Today’s operation and live signals",
    href: "/",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-calendar",
    title: "Calendar",
    subtitle: "Schedule, courts, coaches, and bookings",
    href: "/calendar",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-people",
    title: "People",
    subtitle: "Members, players, guardians, and customers",
    href: "/members",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-team",
    title: "Team",
    subtitle: "Coaches, managers, directors, and staff",
    href: "/team",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-events",
    title: "Events",
    subtitle: "Tournaments, clinics, leagues, open play, and pickup",
    href: "/events",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-products",
    title: "Products",
    subtitle: "Services, memberships, packs, and goods",
    href: "/products",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-money",
    title: "Money",
    subtitle: "Transactions, balances, payouts, and disputes",
    href: "/payments",
    category: "Duna HQ",
    kind: "navigation",
  },
  {
    id: "nav-reports",
    title: "Reports",
    subtitle: "Performance and operating analytics",
    href: "/reports",
    category: "Duna HQ",
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
  let score = 0;
  if (title === query) score += 120;
  else if (title.startsWith(query)) score += 80;
  else if (title.includes(query)) score += 55;
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

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });
  try {
    const caller = await getServerCaller();
    const [workspace, moneyWorkspace] = await Promise.all([
      caller.operator.workspace(),
      caller.operator.moneyWorkspace().catch(() => undefined),
    ]);
    const results: SearchResult[] = [...navigation];

    for (const person of workspace.people) {
      results.push({
        id: `person-${person.personId}`,
        title: person.displayName,
        subtitle: [
          person.roles.join(" · "),
          person.membershipName ?? person.membershipStatus,
          person.email,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/members/${person.personId}`,
        category: "People",
        kind: "person",
        badge: person.status,
        imageUrl: person.avatarUrl,
        searchText: `${person.phoneE164 ?? ""} ${person.recentPurchases.map(({ description }) => description).join(" ")}`,
      });
    }

    for (const teammate of workspace.staff) {
      results.push({
        id: `staff-${teammate.personId}`,
        title: teammate.displayName,
        subtitle: `${teammate.role.replace("-", " ")} · ${teammate.upcomingSessions} upcoming sessions${teammate.homeMarket ? ` · ${teammate.homeMarket}` : ""}`,
        href: `/team/${teammate.personId}`,
        category: teammate.role === "coach" ? "Coaches" : "Team",
        kind: teammate.role === "coach" ? "coach" : "person",
        badge: teammate.active ? "active" : "inactive",
        imageUrl: teammate.avatarUrl,
        searchText: `${teammate.email ?? ""} ${teammate.handle}`,
      });
    }

    for (const session of workspace.sessions) {
      results.push({
        id: `session-${session.id}`,
        title: session.title,
        subtitle: `${eventDate(session.startsAt, session.timezone)} · ${session.venueName ?? "Venue not set"}`,
        href: `/events/${session.id}`,
        category: "Sessions + events",
        kind: "event",
        badge: session.status,
        searchText: `${session.kind} ${session.shortSummary ?? ""} ${session.description ?? ""} ${session.courtName ?? ""}`,
      });
    }

    for (const entry of workspace.calendar.entries.filter(
      ({ sourceType }) => sourceType !== "session",
    )) {
      const href =
        entry.sourceType === "booking"
          ? `/events/court-bookings/${entry.id}`
          : entry.sourceType === "pickup"
            ? `/events/matches/${entry.id}`
            : "/calendar";
      results.push({
        id: `calendar-${entry.sourceType}-${entry.id}`,
        title: entry.title,
        subtitle: `${eventDate(entry.startsAt, entry.timezone)} · ${entry.venueName ?? entry.sourceType.replace("-", " ")}`,
        href,
        category: "Calendar",
        kind: "session",
        badge: entry.status,
        searchText: `${entry.sourceType} ${entry.kind ?? ""} ${entry.coachName ?? ""} ${entry.courtName ?? ""}`,
      });
    }

    for (const venue of workspace.venues) {
      results.push({
        id: `venue-${venue.id}`,
        title: venue.name,
        subtitle: `${venue.locality ?? "Location"}${venue.administrativeArea ? `, ${venue.administrativeArea}` : ""} · ${venue.courts.length} courts`,
        href: `/locations/${venue.id}`,
        category: "Venues",
        kind: "venue",
        badge: venue.status,
        imageUrl: venue.heroImageUrl,
        searchText: `${venue.description ?? ""} ${venue.amenities.join(" ")} ${venue.courts.map(({ name }) => name).join(" ")}`,
      });
    }

    for (const product of workspace.catalog) {
      results.push({
        id: `product-${product.id}`,
        title: product.title,
        subtitle: `${product.type} · ${product.subtype.replaceAll("-", " ")} · ${product.visibility}`,
        href: `/products/${product.id}`,
        category: "Products + services",
        kind: "product",
        badge: product.status,
        imageUrl: product.media.find(({ kind }) => kind === "image")?.url,
        searchText: `${product.shortSummary ?? ""} ${product.description ?? ""} ${product.variants.map(({ sku, title }) => `${title} ${sku ?? ""}`).join(" ")}`,
      });
    }

    for (const transaction of moneyWorkspace?.transactions ?? []) {
      results.push({
        id: `transaction-${transaction.id}`,
        title: transaction.description,
        subtitle: `${transaction.customerName} · ${money(transaction.grossMinor, transaction.currency)} · ${eventDate(transaction.occurredAt, workspace.organization.timezone)}`,
        href: `/payments?transaction=${encodeURIComponent(transaction.id)}`,
        category: "Transactions",
        kind: "money",
        badge: transaction.status,
        searchText: `${transaction.id} ${transaction.orderId} ${transaction.policyName}`,
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

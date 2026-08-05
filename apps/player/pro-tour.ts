export type ProTourSection =
  "overview" | "live" | "schedule" | "draw" | "teams" | "watch";

type ProCoverageEvent = {
  readonly id: string;
  readonly name: string;
  readonly location?: string;
  readonly category?: string;
  readonly genderCategory: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly status: string;
  readonly live: boolean;
  readonly source: string;
  readonly tour: string;
};

type ProEventMedia = {
  readonly kind: string;
  readonly url: string;
  readonly alt?: string;
  readonly posterUrl?: string;
  readonly featured?: boolean;
};

type ProEvent = {
  readonly matches: readonly {
    readonly status: string;
    readonly watchOptions: readonly unknown[];
  }[];
  readonly bracket: readonly unknown[];
  readonly pools: readonly unknown[];
  readonly teamEntries: readonly unknown[];
  readonly liveStandings: readonly unknown[];
  readonly avpLeague?: unknown;
  readonly watchOptions: readonly unknown[];
  readonly editorial: { readonly media: readonly ProEventMedia[] };
};

const statusOrder = {
  live: 0,
  upcoming: 1,
  completed: 2,
} as const;

function eventStatusOrder(status: string): number {
  return statusOrder[status as keyof typeof statusOrder] ?? 3;
}

function eventDate(event: ProCoverageEvent): string {
  return event.startsOn ?? event.endsOn ?? "9999-12-31";
}

export function sortProEvents<T extends ProCoverageEvent>(
  events: readonly T[],
): T[] {
  return [...events].sort((left, right) => {
    if (left.live !== right.live) return left.live ? -1 : 1;
    const statusDifference =
      eventStatusOrder(left.status) - eventStatusOrder(right.status);
    if (statusDifference !== 0) return statusDifference;
    return left.status === "completed"
      ? eventDate(right).localeCompare(eventDate(left))
      : eventDate(left).localeCompare(eventDate(right));
  });
}

export function searchProEvents<T extends ProCoverageEvent>(
  events: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sorted = sortProEvents(events);
  if (!normalizedQuery) return sorted;
  return sorted.filter((event) =>
    [
      event.name,
      event.location,
      event.category,
      event.genderCategory,
      event.source,
      event.tour,
      event.status,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

export function proEventSections(event: ProEvent): readonly ProTourSection[] {
  const sections: ProTourSection[] = ["overview"];
  if (event.matches.some((match) => match.status === "live")) {
    sections.push("live");
  }
  if (event.matches.length > 0) sections.push("schedule");
  if (event.bracket.length > 0 || event.pools.length > 0) {
    sections.push("draw");
  }
  if (
    event.teamEntries.length > 0 ||
    event.liveStandings.length > 0 ||
    Boolean(event.avpLeague)
  ) {
    sections.push("teams");
  }
  if (
    event.watchOptions.length > 0 ||
    event.matches.some((match) => match.watchOptions.length > 0)
  ) {
    sections.push("watch");
  }
  return sections;
}

export function proEventFeaturedMedia(event: ProEvent) {
  return (
    event.editorial.media.find((media) => media.featured) ??
    event.editorial.media[0]
  );
}

export function proEventMediaUrl(event: ProEvent): string | undefined {
  const media = proEventFeaturedMedia(event);
  if (!media) return undefined;
  return media.kind === "hero-video" ? media.posterUrl : media.url;
}

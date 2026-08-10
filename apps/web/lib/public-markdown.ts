import type {
  CourtBookingInventory,
  DiscoveryMapItem,
  EventSummary,
  MatchSummary,
  OrganizationSummary,
  PersonSummary,
  PublicCoach,
  PublicOrganizationStorefront,
  PublicPlayerIntelligence,
  PublicPlayerPerformance,
  PublicProCoverage,
  PublicProEvent,
  PublicProMatchDetail,
  PublicProfessionalTeam,
  PublicWorldRankings,
  VenueSummary,
} from "@duna/api";
import { absolutePublicUrl } from "./pro-seo";

const markdownContentType = "text/markdown; charset=utf-8";

export const publicMarkdownHeaders = {
  "Cache-Control":
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  "Content-Type": markdownContentType,
  "X-Content-Type-Options": "nosniff",
} as const;

export const staticPublicPages = [
  {
    path: "/",
    title: "Duna",
    description:
      "The player network and operating system for beach volleyball: play, professional coverage, Sand Rating, and club operations.",
    sections: [
      "Find and join beach volleyball events, clinics, leagues, lessons, open play, and court time.",
      "Follow professional events, players, teams, schedules, results, broadcasts, and tournament statistics.",
      "Understand form through Duna Sand Rating and its published methodology.",
      "Run a club or coaching business with Duna HQ.",
    ],
  },
  {
    path: "/pro",
    title: "Professional beach volleyball",
    description:
      "Live and upcoming Beach Pro Tour and AVP events, matches, scores, broadcasts, rankings, and player identities.",
    sections: [],
  },
  {
    path: "/discover",
    title: "Discover beach volleyball",
    description:
      "Find public beach volleyball events, tournaments, leagues, training, matches, clubs, coaches, and court rentals on Duna.",
    sections: [
      "Search by place, current location, flexible or exact dates, and the kind of play you want.",
      "Nearby searches expand from 10 miles until at least five matching results are available, then fall back to worldwide results.",
      "Public details are open to people and agents. Registration, booking, checkout, and account actions require sign-in.",
    ],
  },
  {
    path: "/rankings",
    title: "Beach volleyball rankings",
    description:
      "Official world ranking snapshots and Duna Sand Rating tables for professional beach volleyball players.",
    sections: [],
  },
  {
    path: "/about",
    title: "About Duna",
    description:
      "Duna connects every side of beach volleyball through one player network and operating system.",
    sections: [
      "Players discover games, build a verified competition record, and carry one Sand Rating.",
      "Fans follow professional events, athletes, teams, scores, results, and watch information.",
      "Clubs and coaches publish programs, take registrations, operate courts, and serve members.",
    ],
  },
  {
    path: "/apps/apple-watch",
    title: "Duna for Apple Watch",
    description:
      "Score every rally from your wrist and keep the match connected without taking a phone onto the court.",
    sections: [
      "Start or continue a Duna match from Apple Watch.",
      "Track rally scores, sets, serving side, and match state courtside.",
      "Sync the verified result back to the Duna player record.",
    ],
  },
  {
    path: "/methodology",
    title: "Sand Rating methodology",
    description:
      "The evidence, walk-forward evaluation, calibration, model comparisons, and design choices behind Duna Sand Rating.",
    sections: [],
  },
  {
    path: "/run-your-club",
    title: "Duna for clubs and coaches",
    description:
      "Run an independent coaching business or a growing beach volleyball club with scheduling, courts, staff, parents, memberships, payments, marketing, video, and reporting in Duna HQ.",
    sections: [
      "Solo coaches can manage a mobile calendar, check-in, private notes, public services, memberships, credit packs, player-network distribution, payments, video, and permissioned player context.",
      "Club owners can coordinate venues, courts, equipment, multiple coaches, parents, guardians, memberships, programs, inventory, money, marketing, and reporting.",
      "Duna HQ connects orders, credits, refunds, payouts, people, products, events, leagues, video, and operating reports without inferring unavailable financial data.",
      "Players control health-data sharing and visibility. Verified guardians receive appropriately scoped communication for minors.",
      "Duna AI suggestions remain reviewable. Publishing, sending, refunding, and access changes remain explicit operator actions.",
      "Current plans include a free Coach and Organizer plan plus paid Club, Facility, and Network plans. Live prices and eligibility are confirmed in Duna HQ.",
    ],
  },
  {
    path: "/safety",
    title: "Duna safety",
    description:
      "Safety, privacy, reporting, guardian review, and evidence ownership across the Duna network.",
    sections: [
      "Profiles and public attendance respect player visibility settings.",
      "Minors require guardian-aware controls and age-appropriate visibility.",
      "Match disputes and identity claims follow evidence review rather than silent data changes.",
    ],
  },
] as const;

export type StaticPublicPath = (typeof staticPublicPages)[number]["path"];

function clean(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("|", "\\|")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function yaml(value: unknown): string {
  return JSON.stringify(clean(value));
}

function internal(path: string): string {
  return absolutePublicUrl(path);
}

function markdownLink(label: string, path: string): string {
  return `[${clean(label)}](${path.startsWith("http") ? path : internal(path)})`;
}

function date(value: string | undefined): string {
  if (!value) return "Not announced";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.valueOf())) return clean(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(value.length === 10
      ? { timeZone: "UTC" }
      : { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  }).format(parsed);
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function documentHeader(input: {
  readonly title: string;
  readonly description?: string;
  readonly canonicalPath: string;
  readonly entityType: string;
  readonly identifier?: string | number;
  readonly lastModified?: string;
  readonly sourceUrl?: string;
}): string {
  const markdownPath = markdownPathForCanonical(input.canonicalPath);
  return `---
title: ${yaml(input.title)}
entity_type: ${yaml(input.entityType)}
canonical_url: ${yaml(internal(input.canonicalPath))}
markdown_url: ${yaml(internal(markdownPath))}${
    input.identifier === undefined
      ? ""
      : `\nidentifier: ${yaml(input.identifier)}`
  }${input.lastModified ? `\nlast_modified: ${yaml(input.lastModified)}` : ""}${
    input.sourceUrl ? `\nsource_url: ${yaml(input.sourceUrl)}` : ""
  }
---

# ${clean(input.title)}

${input.description ? `> ${clean(input.description)}\n\n` : ""}- Canonical page: ${markdownLink("Open on Duna", input.canonicalPath)}
- Markdown version: ${markdownLink("Machine-readable page", markdownPath)}
`;
}

export function markdownPathForCanonical(canonicalPath: string): string {
  const url = canonicalPath.startsWith("http")
    ? new URL(canonicalPath)
    : new URL(canonicalPath, "https://duna.coach");
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  return pathname === "/" ? "/index.md" : `${pathname}.md`;
}

export function canonicalPathFromMarkdownRequest(path: string): string {
  const normalized = `/${path}`
    .replaceAll(/\/{2,}/g, "/")
    .replace(/\.md$/i, "")
    .replace(/\/$/, "");
  if (normalized === "/index" || normalized === "/home") return "/";
  return normalized || "/";
}

export function renderStaticPageMarkdown(path: string): string | undefined {
  const page = staticPublicPages.find((candidate) => candidate.path === path);
  if (!page) return undefined;
  return `${documentHeader({
    title: page.title,
    description: page.description,
    canonicalPath: page.path,
    entityType: "web_page",
  })}
## What you can find here

${
  page.sections.length > 0
    ? page.sections.map((section) => `- ${clean(section)}`).join("\n")
    : "- This page is backed by current Duna public data. Use the dedicated sections and linked entity pages for details."
}

## Related Duna resources

- ${markdownLink("Agent guide", "/agents")}
- ${markdownLink("Public content index", "/sitemap.md")}
- ${markdownLink("MCP endpoint", "/api/mcp")}
`;
}

function playerPath(player: {
  readonly publicPath?: string;
  readonly handle?: string;
}): string | undefined {
  return (
    player.publicPath ??
    (player.handle ? `/players/${player.handle}` : undefined)
  );
}

function renderPlayerReference(player: {
  readonly name?: string;
  readonly displayName?: string;
  readonly publicPath?: string;
  readonly handle?: string;
  readonly rating?: number;
}): string {
  const name = player.name ?? player.displayName ?? "Player";
  const path = playerPath(player);
  const rating =
    player.rating === undefined
      ? ""
      : ` — Sand Rating ${player.rating.toFixed(2)}`;
  return `${path ? markdownLink(name, path) : clean(name)}${rating}`;
}

export function renderConsumerEventMarkdown(event: EventSummary): string {
  const canonicalPath = `/events/${event.slug}`;
  const location = event.location;
  const lines = [
    documentHeader({
      title: event.title,
      description: event.shortSummary ?? event.description,
      canonicalPath,
      entityType: "sports_event",
      identifier: event.id,
    }),
    "## Event details",
    "",
    `- Type: ${clean(event.kind)}`,
    `- Host: ${clean(event.organizationName)}`,
    `- Starts: ${date(event.startsAt)}`,
    `- Ends: ${date(event.endsAt)}`,
    `- Event timezone: ${clean(event.timezone)}`,
    `- Venue: ${clean(location?.venueName ?? event.venueName)}`,
    `- Address: ${clean(location?.address ?? "Not published")}`,
    ...(location?.latitude !== undefined && location.longitude !== undefined
      ? [
          `- Coordinates: ${location.latitude}, ${location.longitude}`,
          `- Map: https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`,
        ]
      : []),
    `- Price: ${event.price.amountMinor === 0 ? "Free" : money(event.price.amountMinor, event.price.currency)}`,
    `- Capacity: ${event.capacity}`,
    `- Spots remaining: ${event.spotsRemaining}`,
    `- Status: ${clean(event.lifecycleStatus ?? (event.live ? "live" : "active"))}`,
    `- Registration: ${internal(canonicalPath)}`,
  ];

  if (event.ratingRange) {
    lines.push(
      `- Sand Rating range: ${event.ratingRange[0].toFixed(1)}–${event.ratingRange[1].toFixed(1)}`,
    );
  }
  if (event.divisions?.length) {
    lines.push("", "## Divisions", "");
    for (const division of event.divisions) {
      lines.push(
        `- **${clean(division.name)}** — team ${money(division.teamPrice.amountMinor, division.teamPrice.currency)}; player ${money(division.playerPrice.amountMinor, division.playerPrice.currency)}`,
      );
    }
  }
  if (event.tickets?.length) {
    lines.push("", "## Tickets", "");
    for (const ticket of event.tickets) {
      lines.push(
        `- **${clean(ticket.name)}** — ${ticket.price.amountMinor === 0 ? "Free" : money(ticket.price.amountMinor, ticket.price.currency)}${ticket.description ? ` — ${clean(ticket.description)}` : ""}`,
      );
    }
  }
  if (event.attendees?.length) {
    lines.push("", "## Public player list", "");
    for (const attendee of event.attendees) {
      lines.push(
        `- ${renderPlayerReference({ ...attendee, rating: attendee.ratingDisplay })}`,
      );
    }
  }
  if (event.features?.length) {
    lines.push("", "## Event features", "");
    for (const feature of event.features) {
      lines.push(
        `- **${clean(feature.title)}**${feature.description ? ` — ${clean(feature.description)}` : ""}`,
      );
    }
  }
  if (event.policies?.length) {
    lines.push("", "## Policies", "");
    for (const policy of event.policies) {
      lines.push(`### ${clean(policy.title)}`, "", policy.markdown.trim(), "");
    }
  }
  lines.push(
    "",
    "## Agent note",
    "",
    "Use the canonical Duna page for eligibility review, the current spot count, waivers, registration, and checkout. Do not claim a place is reserved until the user completes the Duna flow.",
  );
  return `${lines.join("\n")}\n`;
}

function proTeamKey(team: PublicProEvent["matches"][number]["teamA"]): string {
  return team.players
    .map((player) => player.personId ?? player.name.toLowerCase())
    .sort()
    .join("|");
}

function renderProTeam(
  team: PublicProEvent["matches"][number]["teamA"],
): string {
  const players = team.players.map(renderPlayerReference).join(" / ");
  return `${players || clean(team.label)}${team.countryCode ? ` (${clean(team.countryCode)})` : ""}`;
}

export function renderProfessionalEventMarkdown(event: PublicProEvent): string {
  const canonicalPath = `/events/${event.slug}`;
  const venue = event.editorial.venue;
  const description =
    event.editorial.summary ??
    `${event.name} is a ${event.genderCategory} ${event.category ?? "professional beach volleyball"} event.`;
  const lines = [
    documentHeader({
      title: event.name,
      description,
      canonicalPath,
      entityType: "professional_sports_event",
      identifier: event.externalEventId,
      lastModified: event.lastSyncedAt,
      sourceUrl: event.sourceUrl,
    }),
    "## Tournament details",
    "",
    `- Tour: ${event.source === "avp" ? "AVP" : "Volleyball World Beach Pro Tour"}`,
    `- Category: ${clean(event.category ?? "Professional")}`,
    `- Division: ${clean(event.genderCategory)}`,
    `- Starts: ${date(event.startsOn)}`,
    `- Ends: ${date(event.endsOn)}`,
    `- Status: ${event.live ? "Live" : clean(event.status)}`,
    `- Venue: ${clean(event.editorial.venueName ?? event.location ?? "Not announced")}`,
    `- Address: ${clean(venue?.formattedAddress ?? event.editorial.venueAddress ?? "Not published")}`,
    `- Event timezone: ${clean(event.editorial.timezone ?? "Not published")}`,
    `- Teams: ${event.teamCount || event.liveStandings.length}`,
    `- Matches: ${event.completedMatchCount}/${event.matchCount} completed`,
    ...(venue?.latitude !== undefined && venue.longitude !== undefined
      ? [
          `- Coordinates: ${venue.latitude}, ${venue.longitude}`,
          `- Map: ${venue.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`}`,
        ]
      : []),
    ...(event.editorial.ticketUrl
      ? [`- Tickets and access: ${event.editorial.ticketUrl}`]
      : []),
    `- Official source: ${event.sourceUrl}`,
  ];

  if (
    event.watchOptions.length ||
    event.matches.some((match) => match.watchOptions.length)
  ) {
    lines.push("", "## Where to watch", "");
    for (const option of event.watchOptions) {
      lines.push(
        `- ${clean(option.label)}${option.channelName ? ` — ${clean(option.channelName)}` : ""}${option.url ? ` — ${option.url}` : ""}`,
      );
    }
    for (const match of event.matches.filter(
      (candidate) => candidate.watchOptions.length,
    )) {
      for (const option of match.watchOptions) {
        lines.push(
          `- ${clean(match.time ?? "Time pending")} — ${clean(match.teamA.label)} vs ${clean(match.teamB.label)} — ${option.url ?? internal(match.canonicalPath)}`,
        );
      }
    }
  }

  const teams = new Map<string, PublicProEvent["matches"][number]["teamA"]>();
  for (const match of event.matches) {
    teams.set(proTeamKey(match.teamA), match.teamA);
    teams.set(proTeamKey(match.teamB), match.teamB);
  }
  if (teams.size) {
    lines.push("", "## Teams and players", "");
    for (const team of teams.values()) lines.push(`- ${renderProTeam(team)}`);
  }

  if (event.liveStandings.length) {
    lines.push(
      "",
      "## Standings",
      "",
      "| Place | Team | W | L | Sets | Points |",
      "| ---: | --- | ---: | ---: | ---: | ---: |",
    );
    event.liveStandings.forEach((standing, index) => {
      lines.push(
        `| ${index + 1} | ${renderProTeam(standing.team)} | ${standing.wins} | ${standing.losses} | ${standing.setsFor}–${standing.setsAgainst} | ${standing.pointsFor}–${standing.pointsAgainst} |`,
      );
    });
  }

  if (event.tournamentStatistics) {
    lines.push(
      "",
      "## Tournament statistics",
      "",
      `- Matches with official statistics: ${event.tournamentStatistics.coverage.matchesWithStatistics}/${event.tournamentStatistics.coverage.totalMatches}`,
      `- Average hitting efficiency: ${event.tournamentStatistics.averages.hittingEfficiency?.toFixed(1) ?? "Not available"}%`,
      `- Average aces per set: ${event.tournamentStatistics.averages.acesPerSet?.toFixed(2) ?? "Not available"}`,
      `- Average blocks per set: ${event.tournamentStatistics.averages.blocksPerSet?.toFixed(2) ?? "Not available"}`,
      `- Average digs per set: ${event.tournamentStatistics.averages.digsPerSet?.toFixed(2) ?? "Not available"}`,
    );
  }

  lines.push(
    "",
    "## Matches",
    "",
    "| Status | Round | Match | Set scores | Watch |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const match of event.matches) {
    const scores = match.sets.length
      ? match.sets.map((set) => `${set.a}–${set.b}`).join(", ")
      : "Pending";
    const watch = match.watchOptions.find((option) => option.url)?.url ?? "—";
    lines.push(
      `| ${clean(match.status)} | ${clean(match.roundLabel)} | ${markdownLink(`${match.teamA.label} vs ${match.teamB.label}`, match.canonicalPath)} | ${scores} | ${watch} |`,
    );
  }
  lines.push(
    "",
    "## Data interpretation",
    "",
    "- Match and broadcast data can change while the tournament is live.",
    "- Times should be interpreted in the event timezone shown above.",
    "- A missing value means Duna has not verified it; do not infer a venue, player identity, result, or stream.",
    "- Prediction probabilities are forecasts, not guarantees or betting advice.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderProfessionalMatchMarkdown(
  detail: PublicProMatchDetail,
): string {
  const { event, match } = detail;
  const title = `${match.teamA.label} vs ${match.teamB.label}`;
  const lines = [
    documentHeader({
      title,
      description: `${title} at ${event.name}.`,
      canonicalPath: match.canonicalPath,
      entityType: "professional_match",
      identifier: match.externalMatchId,
      lastModified: match.playedAt,
      sourceUrl: match.sourceUrl,
    }),
    "## Match details",
    "",
    `- Tournament: ${markdownLink(event.name, `/events/${event.slug}`)}`,
    `- Round: ${clean(match.roundLabel)}`,
    `- Status: ${clean(match.status)}`,
    `- Scheduled or played: ${date(match.scheduledAt ?? match.playedAt)}`,
    `- Court: ${clean(match.court ?? "Not announced")}`,
    `- Team A: ${renderProTeam(match.teamA)}`,
    `- Team B: ${renderProTeam(match.teamB)}`,
    `- Set scores: ${match.sets.length ? match.sets.map((set) => `${set.a}–${set.b}`).join(", ") : "Not available"}`,
    `- Winner: ${match.winnerSide === "A" ? clean(match.teamA.label) : match.winnerSide === "B" ? clean(match.teamB.label) : "Not final"}`,
  ];
  if (match.prediction) {
    lines.push(
      "",
      "## Sand Rating forecast",
      "",
      `- ${clean(match.teamA.label)}: ${match.prediction.teamA}%`,
      `- ${clean(match.teamB.label)}: ${match.prediction.teamB}%`,
      `- Basis: ${clean(match.prediction.basis)}`,
      "- This is a forecast, not a guarantee or betting advice.",
    );
  }
  if (match.watchOptions.length) {
    lines.push("", "## Where to watch", "");
    for (const option of match.watchOptions) {
      lines.push(
        `- ${clean(option.label)}${option.channelName ? ` — ${clean(option.channelName)}` : ""}${option.url ? ` — ${option.url}` : ""}`,
      );
    }
  }
  if (detail.headToHead.total > 0) {
    lines.push(
      "",
      "## Head to head",
      "",
      `- Meetings: ${detail.headToHead.total}`,
      `- ${clean(match.teamA.label)} wins: ${detail.headToHead.teamAWins}`,
      `- ${clean(match.teamB.label)} wins: ${detail.headToHead.teamBWins}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function personTeamLabel(players: readonly PersonSummary[]): string {
  return players.map((player) => player.displayName).join(" / ");
}

export function renderMatchMarkdown(match: MatchSummary): string {
  const canonicalPath = `/matches/${match.id}`;
  const teamA = personTeamLabel(match.teamA);
  const teamB = personTeamLabel(match.teamB);
  const lines = [
    documentHeader({
      title: `${teamA} vs ${teamB}`,
      description: `${match.eventName ?? "Beach volleyball match"} at ${match.venueName}.`,
      canonicalPath,
      entityType: "match",
      identifier: match.id,
      lastModified: match.playedAt,
      sourceUrl: match.sourceUrl,
    }),
    "## Result",
    "",
    `- Event: ${match.eventSlug ? markdownLink(match.eventName ?? "Event", `/events/${match.eventSlug}`) : clean(match.eventName ?? "Not linked")}`,
    `- Played: ${date(match.playedAt)}`,
    `- Venue: ${clean(match.location?.name ?? match.venueName)}`,
    `- Address: ${clean(match.location?.address ?? match.location?.label ?? "Not published")}`,
    `- Round: ${clean(match.roundLabel ?? "Not published")}`,
    `- Team A: ${match.teamA.map((player) => renderPlayerReference({ ...player, rating: player.rating.display })).join(" / ")}`,
    `- Team B: ${match.teamB.map((player) => renderPlayerReference({ ...player, rating: player.rating.display })).join(" / ")}`,
    `- Set scores: ${match.score.map(([a, b]) => `${a}–${b}`).join(", ")}`,
    `- Winner: ${match.winner === "A" ? teamA : teamB}`,
    `- Verification: ${clean(match.verification)}`,
    `- Sand Rating movement: ${match.ratingDelta >= 0 ? "+" : ""}${match.ratingDelta.toFixed(2)}`,
  ];
  if (match.prediction) {
    lines.push(
      "",
      "## Pre-match forecast",
      "",
      `- ${clean(teamA)}: ${match.prediction.teamA}%`,
      `- ${clean(teamB)}: ${match.prediction.teamB}%`,
      `- Outcome: ${clean(match.prediction.outcome)}`,
      "- The forecast is model context, not a guarantee or betting advice.",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderPlayerMarkdown(input: {
  readonly player: PersonSummary;
  readonly canonicalPath: string;
  readonly performance?: PublicPlayerPerformance;
  readonly intelligence?: PublicPlayerIntelligence;
}): string {
  const { player, performance, intelligence } = input;
  const profile = intelligence?.profile;
  const description =
    profile?.shortBio ??
    `${player.displayName} beach volleyball profile, Sand Rating, verified match record, ranking, partners, and upcoming events.`;
  const lines = [
    documentHeader({
      title: player.displayName,
      description,
      canonicalPath: input.canonicalPath,
      entityType: "player",
      identifier: player.id,
      lastModified: profile?.publishedAt,
    }),
    "## Player identity",
    "",
    `- Duna handle: @${clean(player.handle)}`,
    `- Home market: ${clean(profile?.hometown ?? player.homeMarket ?? "Not published")}`,
    `- Country: ${clean(profile?.countryCode ?? performance?.worldRanking?.countryCode ?? "Not published")}`,
    `- Professional: ${player.isProfessional ? "Yes" : "Not marked as professional"}`,
    `- Profile status: ${clean(player.profileClaimStatus ?? "claimed")}`,
    `- Sand Rating: ${player.rating.display.toFixed(2)}`,
    `- Rating confidence: ${clean(player.rating.confidence)}`,
    `- Discipline: ${clean(player.rating.discipline)}`,
  ];
  if (profile?.biography) {
    lines.push("", "## Biography", "", profile.biography.trim());
  }
  if (performance?.worldRanking) {
    lines.push(
      "",
      "## World ranking",
      "",
      `- Rank: #${performance.worldRanking.rank}`,
      `- Points: ${performance.worldRanking.points.toFixed(0)}`,
      `- Ranking date: ${performance.worldRanking.rankingDate}`,
      `- Division: ${clean(performance.worldRanking.genderCategory)}`,
    );
  }
  if (intelligence?.upcomingEvents.length) {
    lines.push("", "## Upcoming professional events", "");
    for (const event of intelligence.upcomingEvents) {
      lines.push(
        `- ${markdownLink(event.name, `/events/${event.slug}`)} — ${date(event.startsOn)}${event.location ? ` — ${clean(event.location)}` : ""}${event.status === "live" ? " — live" : ""}`,
      );
    }
  }
  if (performance?.history.length) {
    lines.push(
      "",
      "## Verified match history",
      "",
      "| Date | Event | Match | Set scores | Rating after |",
      "| --- | --- | --- | --- | ---: |",
    );
    for (const event of performance.history) {
      const sideA = event.participants
        .filter((participant) => participant.side === "A")
        .map((participant) => participant.name)
        .join(" / ");
      const sideB = event.participants
        .filter((participant) => participant.side === "B")
        .map((participant) => participant.name)
        .join(" / ");
      const matchLabel = `${sideA} vs ${sideB}`;
      const matchReference = event.canonicalMatchPath
        ? markdownLink(matchLabel, event.canonicalMatchPath)
        : clean(matchLabel);
      lines.push(
        `| ${date(event.occurredAt)} | ${clean(event.matchTitle)} | ${matchReference} | ${event.sets.map((set) => `${set.a}–${set.b}`).join(", ")} | ${event.afterDisplay.toFixed(2)} |`,
      );
    }
  }
  if (profile?.links.length) {
    lines.push("", "## Verified links", "");
    for (const link of profile.links) {
      lines.push(`- ${clean(link.label ?? link.kind)}: ${link.url}`);
    }
  }
  lines.push(
    "",
    "## Data ownership",
    "",
    "Players may manage expressive identity such as biography, image, and links. Duna owns verified match evidence, scores, rankings, and Sand Rating history.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderProfessionalTeamMarkdown(
  team: PublicProfessionalTeam,
): string {
  const canonicalPath = `/pro/teams/${team.teamNo}`;
  const lines = [
    documentHeader({
      title: team.name,
      description: `${team.name} professional beach volleyball players, record, match history, and official performance statistics.`,
      canonicalPath,
      entityType: "professional_team",
      identifier: team.teamNo,
      lastModified: team.matches[0]?.occurredAt,
    }),
    "## Team summary",
    "",
    `- Country: ${clean(team.countryCode ?? "Not published")}`,
    `- Record: ${team.record.wins}–${team.record.losses}`,
    `- Verified matches: ${team.record.matches}`,
    "",
    "## Players",
    "",
    ...team.players.map(
      (player) =>
        `- ${renderPlayerReference({ ...player, rating: player.sandRating })}`,
    ),
  ];
  if (team.statistics) {
    lines.push(
      "",
      "## Official statistics",
      "",
      `- Hitting efficiency: ${team.statistics.hittingEfficiency?.toFixed(1) ?? "Not available"}%`,
      `- Aces per set: ${team.statistics.acesPerSet.toFixed(2)}`,
      `- Blocks per set: ${team.statistics.blocksPerSet.toFixed(2)}`,
      `- Digs per set: ${team.statistics.digsPerSet.toFixed(2)}`,
      `- Recorded attacks: ${team.statistics.attackAttempts ?? 0}`,
    );
  }
  if (team.matches.length) {
    lines.push(
      "",
      "## Match history",
      "",
      "| Date | Event | Opponent | Result | Set scores |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const match of team.matches) {
      const matchName = `${team.name} vs ${match.opponent}`;
      lines.push(
        `| ${date(match.occurredAt)} | ${clean(match.eventName)} | ${match.canonicalPath ? markdownLink(matchName, match.canonicalPath) : clean(match.opponent)} | ${clean(match.result)} | ${match.sets.map((set) => `${set.a}–${set.b}`).join(", ")} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderCoachMarkdown(coach: PublicCoach): string {
  const canonicalPath = `/coaches/${coach.handle}`;
  const lines = [
    documentHeader({
      title: coach.displayName,
      description:
        coach.bio ??
        `Beach volleyball coaching, lessons, and upcoming sessions with ${coach.displayName}.`,
      canonicalPath,
      entityType: "coach",
      identifier: coach.personId,
    }),
    "## Coach details",
    "",
    `- Handle: @${clean(coach.handle)}`,
    `- Organization: ${markdownLink(coach.organizationName, `/clubs/${coach.organizationSlug}`)}`,
    `- Home market: ${clean(coach.homeMarket ?? "Not published")}`,
  ];
  if (coach.services.length) {
    lines.push("", "## Bookable services", "");
    for (const service of coach.services) {
      lines.push(
        `- ${markdownLink(service.title, `/clubs/${coach.organizationSlug}/products/${service.slug}`)}${service.shortSummary ? ` — ${clean(service.shortSummary)}` : ""}`,
      );
    }
  }
  if (coach.upcomingSessions.length) {
    lines.push("", "## Upcoming sessions", "");
    for (const session of coach.upcomingSessions) {
      lines.push(
        `- ${markdownLink(session.title, `/events/${session.slug}`)} — ${date(session.startsAt)} — ${clean(session.venueName ?? "Venue pending")}`,
      );
    }
  }
  lines.push(
    "",
    "## Booking note",
    "",
    "Use the linked Duna service or event page to review availability, eligibility, price, and policies. A booking is not complete until the user finishes Duna checkout.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderStorefrontMarkdown(
  storefront: PublicOrganizationStorefront,
): string {
  const canonicalPath = `/clubs/${storefront.slug}`;
  const lines = [
    documentHeader({
      title: storefront.name,
      description: `${storefront.name} beach volleyball programs, coaching, memberships, rentals, and bookable services on Duna.`,
      canonicalPath,
      entityType: "sports_organization",
      identifier: storefront.organizationId,
    }),
    "## Club details",
    "",
    `- Timezone: ${clean(storefront.timezone)}`,
    `- Currency: ${clean(storefront.currency)}`,
    `- Online payments: ${storefront.paymentsReady ? "Available" : "Not available"}`,
  ];
  if (storefront.catalog.length) {
    lines.push("", "## Programs and products", "");
    for (const item of storefront.catalog) {
      lines.push(
        `- ${markdownLink(item.title, `/clubs/${storefront.slug}/products/${item.slug}`)} — ${clean(item.subtype)}${item.shortSummary ? ` — ${clean(item.shortSummary)}` : ""}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderOrganizationMarkdown(input: {
  readonly organization: OrganizationSummary;
  readonly events: readonly EventSummary[];
  readonly coaches: readonly PublicCoach[];
  readonly venues: readonly VenueSummary[];
}): string {
  const { organization } = input;
  const canonicalPath = `/clubs/${organization.slug}`;
  const lines = [
    documentHeader({
      title: organization.name,
      description: `${organization.name} public beach volleyball events, coaches, venues, clinics, and programs on Duna.`,
      canonicalPath,
      entityType: "sports_organization",
      identifier: organization.id,
    }),
    "## Organization details",
    "",
    `- Timezone: ${clean(organization.timezone)}`,
    `- Public venues: ${input.venues.length}`,
    `- Public coaches: ${input.coaches.length}`,
    `- Public events: ${input.events.length}`,
  ];
  if (input.venues.length) {
    lines.push("", "## Venues", "");
    for (const venue of input.venues) {
      lines.push(
        `- **${clean(venue.name)}** — ${clean(venue.city)}, ${clean(venue.region)} — ${venue.latitude}, ${venue.longitude} — ${venue.courtCount} courts`,
      );
    }
  }
  if (input.coaches.length) {
    lines.push("", "## Coaches", "");
    for (const coach of input.coaches) {
      lines.push(
        `- ${markdownLink(coach.displayName, `/coaches/${coach.handle}`)}${coach.homeMarket ? ` — ${clean(coach.homeMarket)}` : ""}`,
      );
    }
  }
  if (input.events.length) {
    lines.push("", "## Events, clinics, and programs", "");
    for (const event of input.events) {
      lines.push(
        `- ${markdownLink(event.title, `/events/${event.slug}`)} — ${date(event.startsAt)} — ${clean(event.location?.venueName ?? event.venueName)} — ${event.spotsRemaining} spots remaining`,
      );
    }
  }
  lines.push(
    "",
    "## Action",
    "",
    `Review live availability and complete registration or booking on Duna: ${internal(canonicalPath)}`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderProductMarkdown(input: {
  readonly storefront: PublicOrganizationStorefront;
  readonly productSlug: string;
}): string | undefined {
  const item = input.storefront.catalog.find(
    (candidate) => candidate.slug === input.productSlug,
  );
  if (!item) return undefined;
  const canonicalPath = `/clubs/${input.storefront.slug}/products/${item.slug}`;
  const lines = [
    documentHeader({
      title: item.title,
      description: item.shortSummary ?? item.description,
      canonicalPath,
      entityType: "bookable_offer",
      identifier: item.id,
    }),
    "## Offer details",
    "",
    `- Provider: ${markdownLink(input.storefront.name, `/clubs/${input.storefront.slug}`)}`,
    `- Type: ${clean(item.type)}`,
    `- Subtype: ${clean(item.subtype)}`,
    `- Visibility: ${clean(item.visibility)}`,
    `- Membership required: ${item.membershipRequired ? "Yes" : "No"}`,
    `- Card accepted: ${item.allowCard ? "Yes" : "No"}`,
    `- Organization credits accepted: ${item.allowCredits ? "Yes" : "No"}`,
    `- Cash accepted: ${item.allowCash ? "Yes" : "No"}`,
  ];
  if (item.description)
    lines.push("", "## Description", "", item.description.trim());
  if (item.variants.length) {
    lines.push("", "## Options and prices", "");
    for (const variant of item.variants) {
      for (const price of variant.prices) {
        const amount =
          price.paymentKind === "credit"
            ? `${price.creditAmount ?? 0} organization credits`
            : price.amountMinor !== undefined && price.currency
              ? money(price.amountMinor, price.currency)
              : clean(price.paymentKind);
        lines.push(`- **${clean(variant.title)}** — ${amount}`);
      }
    }
  }
  lines.push(
    "",
    "## Action",
    "",
    `Review and book on Duna: ${internal(canonicalPath)}`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderProCoverageMarkdown(coverage: PublicProCoverage): string {
  const lines = [
    documentHeader({
      title: "Professional beach volleyball",
      description:
        "Current Duna coverage of Beach Pro Tour and AVP events, matches, broadcasts, and player identities.",
      canonicalPath: "/pro",
      entityType: "collection_page",
    }),
    "## Events",
    "",
    "| Status | Dates | Event | Division | Location | Matches |",
    "| --- | --- | --- | --- | --- | ---: |",
  ];
  for (const event of coverage.events) {
    lines.push(
      `| ${event.live ? "Live" : clean(event.status)} | ${date(event.startsOn)}–${date(event.endsOn)} | ${markdownLink(event.name, `/events/${event.slug}`)} | ${clean(event.genderCategory)} | ${clean(event.location ?? "Pending")} | ${event.matchCount} |`,
    );
  }
  lines.push(
    "",
    "## Navigation",
    "",
    `- ${markdownLink("Rankings", "/rankings")}`,
    `- ${markdownLink("Public content index", "/sitemap.md")}`,
    `- ${markdownLink("Agent guide", "/agents")}`,
  );
  return `${lines.join("\n")}\n`;
}

function rankingTable(
  rows: readonly {
    readonly rank: number;
    readonly displayName: string;
    readonly publicPath?: string;
    readonly countryCode?: string;
    readonly points?: number;
    readonly sandRating?: number;
  }[],
): string[] {
  return [
    "| Rank | Player | Country | Points | Sand Rating |",
    "| ---: | --- | --- | ---: | ---: |",
    ...rows.map(
      (player) =>
        `| ${player.rank} | ${player.publicPath ? markdownLink(player.displayName, player.publicPath) : clean(player.displayName)} | ${clean(player.countryCode ?? "—")} | ${player.points?.toFixed(0) ?? "—"} | ${player.sandRating?.toFixed(2) ?? "—"} |`,
    ),
  ];
}

export function renderRankingsMarkdown(rankings: PublicWorldRankings): string {
  const lines = [
    documentHeader({
      title: "Beach volleyball rankings",
      description:
        "Official world ranking snapshots and Duna Sand Rating tables for men's and women's professional beach volleyball.",
      canonicalPath: "/rankings",
      entityType: "dataset",
      lastModified:
        rankings.latestDates.men ?? rankings.latestDates.women ?? undefined,
    }),
  ];
  for (const [label, rows] of [
    ["Men's official world ranking", rankings.world.men],
    ["Women's official world ranking", rankings.world.women],
    ["Men's Duna Sand Rating", rankings.duna.men],
    ["Women's Duna Sand Rating", rankings.duna.women],
  ] as const) {
    lines.push("", `## ${label}`, "", ...rankingTable(rows));
  }
  lines.push(
    "",
    "## Interpretation",
    "",
    "Official world ranking points and Duna Sand Rating measure different things and are not expected to match. A missing value means the signal has not been connected or verified.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderDiscoveryMarkdown(
  items: readonly DiscoveryMapItem[],
): string {
  const canonicalPath = "/discover";
  const visible = [
    ...new Map(items.map((item) => [item.href, item] as const)).values(),
  ];
  const labels: Record<DiscoveryMapItem["entityType"], string> = {
    event: "Events and local play",
    venue: "Court rentals",
    coach: "Coaches and training",
    organization: "Clubs and organizations",
    match: "Matches",
    "pro-tour": "Professional tour events",
  };
  const lines = [
    documentHeader({
      title: "Discover beach volleyball",
      description:
        "Public beach volleyball events, tournaments, leagues, training, matches, clubs, coaches, and court rentals available through Duna.",
      canonicalPath,
      entityType: "collection_page",
    }),
    "## Search behavior",
    "",
    "- Where can use the player's current location, a selected place, or Anywhere.",
    "- Nearby searches expand through 10, 30, 60, 120, 240, and 480 miles and continue outward until at least five matching results are available.",
    "- When can remain flexible or use a preset or exact date range.",
    "- What can include events, tournaments, leagues, training, matches, and court rentals.",
    "- Public reading is open. Registration, booking, checkout, and account actions require sign-in and explicit confirmation.",
    "",
    `## Current public index (${visible.length})`,
  ];
  for (const entityType of Object.keys(
    labels,
  ) as DiscoveryMapItem["entityType"][]) {
    const matches = visible.filter((item) => item.entityType === entityType);
    if (matches.length === 0) continue;
    lines.push("", `### ${labels[entityType]} (${matches.length})`, "");
    for (const item of matches.slice(0, 100)) {
      const facts = [
        clean(item.kind.replaceAll("-", " ")),
        clean(item.subtitle),
        item.startsAt ? date(item.startsAt) : undefined,
        item.level ? `level ${clean(item.level)}` : undefined,
        item.spotsRemaining !== undefined
          ? `${item.spotsRemaining} spots remaining`
          : undefined,
        item.courtCount !== undefined ? `${item.courtCount} courts` : undefined,
        item.price
          ? item.price.amountMinor === 0
            ? "Free"
            : money(item.price.amountMinor, item.price.currency)
          : undefined,
        item.openNow ? "Open now" : undefined,
      ].filter(Boolean);
      lines.push(
        `- ${markdownLink(item.title, item.href)} — ${facts.join(" — ")}`,
      );
    }
  }
  lines.push(
    "",
    "## Agent routing",
    "",
    `Use each linked canonical entity page and its Markdown companion for final facts. Return people to ${internal(canonicalPath)} to refine Where, When, and What.`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderVenueMarkdown(inventory: CourtBookingInventory): string {
  const venue = inventory.venue;
  const canonicalPath = `/venues/${venue.id}`;
  const lines = [
    documentHeader({
      title: venue.name,
      description:
        venue.description ??
        `${venue.name} public beach volleyball court details and live availability on Duna.`,
      canonicalPath,
      entityType: "sports_activity_location",
      identifier: venue.id,
    }),
    "## Venue details",
    "",
    `- Operator: ${clean(venue.organizationName)}`,
    `- Location: ${clean(venue.city)}, ${clean(venue.region)}`,
    `- Timezone: ${clean(venue.timezone)}`,
    `- Public courts: ${inventory.courts.length}`,
    `- Online payments: ${venue.paymentsReady ? "Available after sign-in" : "Not currently available"}`,
    ...(venue.latitude !== undefined && venue.longitude !== undefined
      ? [
          `- Coordinates: ${venue.latitude}, ${venue.longitude}`,
          `- Map: https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`,
        ]
      : []),
  ];
  if (venue.amenities.length > 0) {
    lines.push("", "## Amenities", "");
    for (const amenity of venue.amenities) lines.push(`- ${clean(amenity)}`);
  }
  lines.push("", "## Courts and published rates", "");
  for (const court of inventory.courts) {
    const rate = court.pricing
      ? `${money(court.pricing.baseAmountMinor, court.pricing.currency)} per ${court.pricing.rateUnitMinutes} minutes`
      : "Rate not published";
    lines.push(
      `- **${clean(court.name)}** — ${clean(court.surface)} — ${court.lit ? "Lit" : "Natural light"} — ${court.minimumDurationMinutes}–${court.maximumDurationMinutes} minutes — ${rate}`,
    );
  }
  lines.push(
    "",
    "## Availability and booking",
    "",
    `People can review current dates, open start times, weather, court details, and prices at ${internal(canonicalPath)} without an account. Sign-in is required only to hold a court, create an alert, accept policy terms, or complete payment.`,
    "",
    "Do not claim a court is held or booked until Duna returns a confirmed reservation after the authenticated checkout flow.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderVenueSummaryMarkdown(venue: VenueSummary): string {
  const canonicalPath = `/venues/${venue.id}`;
  const lines = [
    documentHeader({
      title: venue.name,
      description: `${venue.name} public beach volleyball court guide on Duna.`,
      canonicalPath,
      entityType: "sports_activity_location",
      identifier: venue.id,
    }),
    "## Venue details",
    "",
    `- Location: ${clean(venue.city)}, ${clean(venue.region)}`,
    `- Timezone: ${clean(venue.timezone)}`,
    `- Public courts: ${venue.courtCount}`,
    `- Coordinates: ${venue.latitude}, ${venue.longitude}`,
    `- Map: https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`,
  ];
  if (venue.tags.length > 0) {
    lines.push("", "## Published features", "");
    for (const tag of venue.tags) lines.push(`- ${clean(tag)}`);
  }
  lines.push(
    "",
    "## Booking status",
    "",
    "Live court inventory and online rates have not been published for this venue. Do not claim a court is available, held, or booked from this guide.",
    "",
    `Return to ${internal("/discover")} to find currently published court rentals and nearby play.`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderSitemapMarkdown(
  entries: readonly {
    readonly url: string;
    readonly lastModified?: string | Date;
  }[],
): string {
  const lines = [
    "# Duna public content index",
    "",
    "> Canonical public destinations and their deterministic Markdown representations. Interactive HTML remains the destination for people, registration, booking, live interactions, and checkout; /agents is intentionally Markdown-only.",
    "",
    `- Agent guide: ${internal("/agents")}`,
    `- MCP endpoint: ${internal("/api/mcp")}`,
    `- XML sitemap: ${internal("/sitemap.xml")}`,
    "",
    "| Canonical public page | Markdown | Last significant update |",
    "| --- | --- | --- |",
  ];
  const unique = new Map(entries.map((entry) => [entry.url, entry]));
  for (const entry of [...unique.values()].sort((a, b) =>
    a.url.localeCompare(b.url),
  )) {
    const path = new URL(entry.url).pathname;
    const modified =
      entry.lastModified instanceof Date
        ? entry.lastModified.toISOString()
        : (entry.lastModified ?? "—");
    lines.push(
      `| ${entry.url} | ${internal(markdownPathForCanonical(path))} | ${clean(modified)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderAgentsGuide(): string {
  return `# Duna agent guide

> Duna is the player network and operating system for beach volleyball. This endpoint is intentionally served as Markdown. Use it as the routing and interpretation contract for public Duna data.

## Start here

- Public content index: ${internal("/sitemap.md")}
- XML canonical sitemap: ${internal("/sitemap.xml")}
- Compact model index: ${internal("/llms.txt")}
- MCP Streamable HTTP endpoint: ${internal("/api/mcp")}
- Public discovery hub: ${internal("/discover")}
- Professional tour hub: ${internal("/pro")}
- Player and Sand Rating rankings: ${internal("/rankings")}
- Sand Rating methodology: ${internal("/methodology")}

## Markdown page convention

Every canonical public page in the Duna sitemap has a Markdown companion. Append \`.md\` to the canonical pathname:

- \`/events/{event-slug}\` → \`/events/{event-slug}.md\`
- \`/events/{event-slug}/match/{match-slug}/{match-id}\` → the same path plus \`.md\`
- \`/players/{player-identifier}\` → \`/players/{player-identifier}.md\`
- \`/pro/teams/{team-number}\` → \`/pro/teams/{team-number}.md\`
- \`/coaches/{handle}\` → \`/coaches/{handle}.md\`
- \`/clubs/{club-slug}\` → \`/clubs/{club-slug}.md\`
- \`/venues/{venue-id}\` → \`/venues/{venue-id}.md\`
- \`/discover\` → \`/discover.md\`
- The homepage is \`/index.md\`.

Markdown companions contain only public facts. They include canonical HTML links so a person can inspect live state, register, book, buy a ticket, or complete checkout on Duna.

## How to answer common questions

### Tournaments, schedules, results, and standings

1. Start at ${internal("/pro.md")} or call the MCP \`search_events\` tool.
2. Open the event Markdown page for dates, division, status, venue, coordinates, timezone, teams, standings, watch options, and match links.
3. Open an individual match Markdown page for competitors, set scores, status, prediction context, and match-specific broadcasts.
4. Link the user back to the canonical Duna event or match page.

### Where to watch

Use the event or match \`Where to watch\` section, or call MCP \`find_where_to_watch\`. Never infer a stream from the tour name or from a prior event. If Duna says the broadcast is pending, report it as pending.

### Player identity, ranking, form, and stats

1. Use ${internal("/rankings.md")} or MCP \`search_players\`.
2. Prefer a linked canonical Duna player identity over a source-only name.
3. The player page contains biography, verified links, Sand Rating, official world rank when connected, upcoming events, and verified match history.
4. World ranking and Sand Rating are distinct signals. Do not combine or substitute them.

### Teams and partnerships

Professional team pages use \`/pro/teams/{team-number}\`. They expose the connected roster, official statistics, record, and match history. Beach volleyball partnerships can change; identify the team by its Duna team number and state the date or event context.

### Geography and event location

Event Markdown pages expose the verified venue name, formatted address, event timezone, coordinates, and map URL when available. Use the event timezone for schedule interpretation. Do not infer geography from a tournament title if the location fields are missing.

### Clinics, open play, leagues, lessons, rentals, and registration

1. Start at ${internal("/discover.md")}, call MCP \`search_duna\`, or call \`search_events\` with the appropriate kind.
2. Use MCP \`find_coaches\` for public coaches and lessons.
3. Club storefronts list public programs and bookable offers. Public venue pages expose current courts, amenities, published rates, and availability.
4. Discovery and entity details are public. Return the canonical Duna page for registration or booking; account access is required only when the user takes that action.
5. Do not say a player is registered, a place is held, or payment succeeded until the user completes the Duna flow and receives confirmation.

### Coaches

Coach pages use \`/coaches/{handle}\` and list the coach's public organization, home market, services, and upcoming sessions. A service link leads to the Duna booking page where current pricing, eligibility, and availability are enforced.

## Data and provenance rules

- Duna aggregates official and licensed public competition data while preserving source URLs.
- Public professional facts may update frequently while an event is live.
- A missing value means it has not been verified. Do not invent a venue, broadcast, identity, result, ranking, price, or availability.
- AI-researched biographies and generated media are not public until reviewed and published by Duna.
- Players control expressive identity. Duna controls verified scores, results, rankings, and Sand Rating history.
- Prediction probabilities are forecasts, not guarantees or betting advice.
- Public data is open to read and cite. Registration, booking, tickets, purchases, claims, and account actions must return the user to the canonical Duna flow.

## MCP usage

Connect to ${internal("/api/mcp")} using Streamable HTTP. Start with \`resources/read\` for \`duna://guide/agents\`, then use \`resources/list\`, \`resources/templates/list\`, \`tools/list\`, or \`prompts/list\`.

Core resource templates:

- \`duna://events/{slug}\`
- \`duna://events/{eventSlug}/matches/{matchId}\`
- \`duna://matches/{matchId}\`
- \`duna://players/{identifier}\`
- \`duna://teams/{teamNo}\`
- \`duna://coaches/{handle}\`
- \`duna://clubs/{slug}\`
- \`duna://venues/{venueId}\`

Public discovery tools return structured data plus canonical and Markdown URLs. Use \`search_duna\` for broad questions, then prefer the entity-specific tools for final details. Any authenticated repair tools are role-gated and audited.
`;
}

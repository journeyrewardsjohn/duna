import {
  createApiContextFromRequest,
  createCaller,
  type ApiContext,
} from "@duna/api";
import {
  renderAgentsGuide,
  renderCoachMarkdown,
  renderConsumerEventMarkdown,
  renderMatchMarkdown,
  renderOrganizationMarkdown,
  renderPlayerMarkdown,
  renderProfessionalEventMarkdown,
  renderProfessionalMatchMarkdown,
  renderProfessionalTeamMarkdown,
  renderSitemapMarkdown,
  renderStorefrontMarkdown,
} from "../../../lib/public-markdown";
import { publicSiteOrigin } from "../../../lib/pro-seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const protocolVersion = "2025-11-25";
const supportedProtocolVersions = new Set([protocolVersion, "2025-06-18"]);
const maximumBodyBytes = 256 * 1024;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: Readonly<Record<string, boolean>>;
}

interface ResourceDefinition {
  readonly uri: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: "text/markdown";
  readonly annotations?: Readonly<Record<string, unknown>>;
}

interface ResourceTemplateDefinition {
  readonly uriTemplate: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: "text/markdown";
  readonly annotations?: Readonly<Record<string, unknown>>;
}

interface PromptDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly arguments?: readonly {
    readonly name: string;
    readonly description: string;
    readonly required?: boolean;
  }[];
}

const objectSchema = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = [],
): Readonly<Record<string, unknown>> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const publicTools: readonly ToolDefinition[] = [
  {
    name: "search_duna",
    title: "Search Duna public knowledge",
    description:
      "Search events, professional tournaments, players, teams, coaches, clinics, and bookable public content in one call. Returns canonical and Markdown URLs.",
    inputSchema: objectSchema(
      {
        query: { type: "string", minLength: 2, maxLength: 120 },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      ["query"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "search_events",
    title: "Search Duna events",
    description:
      "Find public beach volleyball tournaments, leagues, clinics, open play, lessons, court rentals, and pickup sessions. Returns canonical Duna action URLs.",
    inputSchema: objectSchema({
      query: { type: "string", maxLength: 120 },
      kind: {
        type: "string",
        enum: [
          "tournament",
          "league",
          "clinic",
          "open-play",
          "private-lesson",
          "court-rental",
          "pickup",
        ],
      },
      rating: { type: "number", minimum: 1, maximum: 8 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_event",
    title: "Get a Duna event",
    description:
      "Load one public event by slug, including schedule, eligibility, venue, price, and registration context when available.",
    inputSchema: objectSchema(
      { slug: { type: "string", minLength: 1, maxLength: 160 } },
      ["slug"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_match",
    title: "Get a Duna match",
    description:
      "Load one public match with tournament context, players or teams, set scores, status, broadcast options, and canonical links.",
    inputSchema: objectSchema(
      {
        matchId: { type: "string", format: "uuid" },
        eventSlug: { type: "string", minLength: 1, maxLength: 180 },
      },
      ["matchId"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_team",
    title: "Get a professional team",
    description:
      "Load a professional beach volleyball partnership by Duna team number, including roster, record, official statistics, and match history.",
    inputSchema: objectSchema({ teamNo: { type: "integer", minimum: 1 } }, [
      "teamNo",
    ]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "find_where_to_watch",
    title: "Find where to watch",
    description:
      "Return only verified event or match broadcast destinations. Missing broadcast data is reported as pending and never inferred.",
    inputSchema: objectSchema({
      eventSlug: { type: "string", minLength: 1, maxLength: 180 },
      matchId: { type: "string", format: "uuid" },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "search_players",
    title: "Search public players",
    description:
      "Find public Duna player identities by name or handle with Sand Rating and professional status.",
    inputSchema: objectSchema(
      {
        query: { type: "string", minLength: 2, maxLength: 100 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      ["query"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_player",
    title: "Get a public player profile",
    description:
      "Load a public player, reviewed biography and artwork, rating history, prior match predictions, official ranking, upcoming registrations, broadcast options, partner history inputs, news, videos, and connected sources.",
    inputSchema: objectSchema(
      { handle: { type: "string", minLength: 2, maxLength: 48 } },
      ["handle"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_world_rankings",
    title: "Get world or Duna rankings",
    description:
      "Return the men's or women's top player table from the official world snapshot or Duna Sand Rating.",
    inputSchema: objectSchema({
      system: { type: "string", enum: ["world", "duna"], default: "world" },
      gender: { type: "string", enum: ["men", "women"], default: "men" },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 25 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_rating_methodology",
    title: "Get Sand Rating evidence",
    description:
      "Return the current walk-forward methodology version, matches processed, model comparison metrics, calibration, and learning curves.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "find_coaches",
    title: "Find Duna coaches",
    description:
      "Find public coaches and lesson providers, optionally within one club, with canonical profile links.",
    inputSchema: objectSchema({
      query: { type: "string", maxLength: 120 },
      organizationSlug: { type: "string", maxLength: 64 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_coach",
    title: "Get a Duna coach",
    description:
      "Load a public coach profile and its lesson or organization context.",
    inputSchema: objectSchema(
      {
        handle: { type: "string", minLength: 2, maxLength: 48 },
        organizationSlug: { type: "string", maxLength: 64 },
      },
      ["handle"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "find_booking_options",
    title: "Find booking and registration options",
    description:
      "Discover public events, lessons, venues, tickets, and registration entry points. This tool finds options; it never purchases or registers without a user completing Duna checkout.",
    inputSchema: objectSchema({
      query: { type: "string", maxLength: 120 },
      organizationSlug: { type: "string", maxLength: 64 },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 12 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

const publicResources: readonly ResourceDefinition[] = [
  {
    uri: "duna://guide/agents",
    name: "duna-agent-guide",
    title: "Duna public data and navigation guide",
    description:
      "Authoritative routing, interpretation, provenance, and action-link guidance for public Duna knowledge.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uri: "duna://site/index",
    name: "duna-public-index",
    title: "Duna public content index",
    description:
      "Canonical public pages and their deterministic Markdown companions.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 0.95 },
  },
];

const publicResourceTemplates: readonly ResourceTemplateDefinition[] = [
  {
    uriTemplate: "duna://events/{slug}",
    name: "duna-event",
    title: "Duna event or tournament",
    description:
      "Dates, timezone, venue, geography, teams, standings, matches, watch links, and registration context.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uriTemplate: "duna://events/{eventSlug}/matches/{matchId}",
    name: "duna-professional-match",
    title: "Duna professional match",
    description:
      "Tournament match status, teams, players, set scores, prediction context, and broadcasts.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uriTemplate: "duna://matches/{matchId}",
    name: "duna-match",
    title: "Duna verified match",
    description: "Verified players, result, scores, venue, and rating context.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 0.9 },
  },
  {
    uriTemplate: "duna://players/{identifier}",
    name: "duna-player",
    title: "Duna player profile",
    description:
      "Canonical identity, biography, ranking, Sand Rating, upcoming events, and verified match history.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 1 },
  },
  {
    uriTemplate: "duna://teams/{teamNo}",
    name: "duna-professional-team",
    title: "Duna professional team",
    description: "Roster, record, official statistics, and match history.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 0.9 },
  },
  {
    uriTemplate: "duna://coaches/{handle}",
    name: "duna-coach",
    title: "Duna coach",
    description:
      "Public coach identity, services, club, and upcoming sessions.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 0.85 },
  },
  {
    uriTemplate: "duna://clubs/{slug}",
    name: "duna-club",
    title: "Duna club storefront",
    description:
      "Public programs, services, plans, products, and booking links.",
    mimeType: "text/markdown",
    annotations: { audience: ["assistant"], priority: 0.85 },
  },
];

const publicPrompts: readonly PromptDefinition[] = [
  {
    name: "answer_where_to_watch",
    title: "Answer where to watch a beach volleyball event",
    description:
      "Use verified event and match broadcasts and return a canonical Duna link.",
    arguments: [
      {
        name: "event_or_match",
        description: "Tournament, event, player matchup, or match identifier.",
        required: true,
      },
    ],
  },
  {
    name: "research_player",
    title: "Research a beach volleyball player",
    description:
      "Resolve canonical identity, ranking, Sand Rating, form, partners, results, and upcoming events without conflating signals.",
    arguments: [
      {
        name: "player",
        description: "Player name, handle, or Duna identifier.",
        required: true,
      },
    ],
  },
  {
    name: "find_play_or_coaching",
    title: "Find play, clinics, or coaching",
    description:
      "Find public options, explain verified details, and route registration or booking back to Duna.",
    arguments: [
      {
        name: "request",
        description:
          "Location, dates, level, event kind, coach, or program need.",
        required: true,
      },
    ],
  },
];

const authenticatedTools: readonly ToolDefinition[] = [
  {
    name: "report_match_issue",
    title: "Report an inaccurate match",
    description:
      "For an authenticated match participant, hold a match out of ratings and open a super-admin evidence review.",
    inputSchema: objectSchema(
      {
        matchId: { type: "string", format: "uuid" },
        reasonCode: {
          type: "string",
          enum: [
            "not-me",
            "wrong-score",
            "wrong-opponents",
            "duplicate",
            "other",
          ],
        },
        details: { type: "string", maxLength: 1000 },
        idempotencyKey: { type: "string", format: "uuid" },
      },
      ["matchId", "reasonCode"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const adminTools: readonly ToolDefinition[] = [
  {
    name: "list_data_issues",
    title: "List Duna data issues",
    description:
      "List unresolved player mappings, staged match problems, participant disputes, and profile claims for a super-admin repair agent.",
    inputSchema: objectSchema({
      limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "inspect_player_identity",
    title: "Inspect player identity candidates",
    description:
      "Search the internal canonical player directory and return matching source records and unresolved mappings.",
    inputSchema: objectSchema(
      { query: { type: "string", minLength: 2, maxLength: 100 } },
      ["query"],
    ),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "resolve_player_identity",
    title: "Resolve an external player identity",
    description:
      "Link one exact external profile to one canonical Duna person after high-confidence source verification. The action is audited and refreshes affected match mappings.",
    inputSchema: objectSchema(
      {
        externalProfileId: { type: "string", format: "uuid" },
        personId: { type: "string", format: "uuid" },
        confidence: { type: "number", minimum: 0.98, maximum: 1 },
        evidenceUrls: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string", format: "uri" },
        },
        reason: { type: "string", minLength: 12, maxLength: 300 },
      },
      ["externalProfileId", "personId", "confidence", "evidenceUrls", "reason"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "review_profile_claim",
    title: "Review a professional profile claim",
    description:
      "Approve or reject a queued claim. Professional approval requires attesting that an official player page matches the signed-in identity.",
    inputSchema: objectSchema(
      {
        jobId: { type: "string", format: "uuid" },
        decision: { type: "string", enum: ["approved", "rejected"] },
        officialProfileMatched: { type: "boolean" },
        reason: { type: "string", minLength: 12, maxLength: 1000 },
      },
      ["jobId", "decision", "officialProfileMatched", "reason"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "review_match_issue",
    title: "Resolve a reported match issue",
    description:
      "Resolve a participant-reported match dispute and replay the rating projection with the reviewed evidence.",
    inputSchema: objectSchema(
      {
        disputeId: { type: "string", format: "uuid" },
        decision: { type: "string", enum: ["upheld", "rejected"] },
        resolutionNotes: { type: "string", minLength: 8, maxLength: 2000 },
      },
      ["disputeId", "decision", "resolutionNotes"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "run_rating_backtest",
    title: "Run the Sand Rating model challenge",
    description:
      "Run and persist a chronological pre-match backtest across all eligible rated matches, then publish the audited model comparison.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArgument(
  args: Record<string, unknown>,
  name: string,
  required = true,
): string | undefined {
  const value = args[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw new Error(`${name} is required`);
  return undefined;
}

function numberArgument(
  args: Record<string, unknown>,
  name: string,
  fallback: number,
): number {
  const value = args[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toolsFor(context: ApiContext): readonly ToolDefinition[] {
  return [
    ...publicTools,
    ...(context.actor ? authenticatedTools : []),
    ...(context.actor?.roles.includes("super-admin") ? adminTools : []),
  ];
}

function publicOrigin(): string {
  return publicSiteOrigin();
}

function publicLinks(origin: string, canonicalPath: string) {
  const normalized = canonicalPath.startsWith("/")
    ? canonicalPath
    : `/${canonicalPath}`;
  return {
    canonicalUrl: `${origin}${normalized}`,
    markdownUrl: `${origin}${normalized === "/" ? "/index" : normalized}.md`,
  };
}

function eventSlugFromMatchPath(path: string | undefined) {
  return path?.match(/^\/events\/([^/]+)\/match\//)?.[1];
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configured = [
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_DUNA_WEB_URL,
    ...(process.env.DUNA_MCP_ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/$/, ""));
  return origin === requestOrigin || configured.includes(origin);
}

function jsonRpcResponse(
  body: Readonly<Record<string, unknown>>,
  status = 200,
  responseProtocol = protocolVersion,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": responseProtocol,
    },
  });
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  status = 200,
): Response {
  return jsonRpcResponse(
    { jsonrpc: "2.0", id, error: { code, message } },
    status,
  );
}

function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent:
      data && typeof data === "object" && !Array.isArray(data)
        ? data
        : { data },
    ...(isError ? { isError: true } : {}),
  };
}

async function callTool(input: {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly context: ApiContext;
  readonly request: Request;
}) {
  const caller = createCaller(input.context);
  const origin = publicOrigin();
  const limit = Math.floor(numberArgument(input.args, "limit", 20));
  switch (input.name) {
    case "search_duna": {
      const query = stringArgument(input.args, "query")!;
      const normalizedQuery = query.toLowerCase();
      const bounded = Math.min(25, Math.max(1, limit || 10));
      const [events, coverage, players, coaches, teams] = await Promise.all([
        caller.public.events(),
        caller.public.proCoverage(),
        caller.public.searchPlayers({ query, limit: bounded }),
        caller.public.coaches(),
        caller.public.proTeams(),
      ]);
      const matches = (value: unknown) =>
        JSON.stringify(value).toLowerCase().includes(normalizedQuery);
      return {
        query,
        events: [
          ...events.filter(matches).map((event) => ({
            entityType: "event" as const,
            id: event.id,
            slug: event.slug,
            name: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timezone: event.timezone,
            location: event.location ?? { venueName: event.venueName },
            ...publicLinks(origin, `/events/${event.slug}`),
          })),
          ...coverage.events.filter(matches).map((event) => ({
            entityType: "professional_event" as const,
            id: event.id,
            slug: event.slug,
            name: event.name,
            startsOn: event.startsOn,
            endsOn: event.endsOn,
            location: event.venue ?? event.location,
            live: event.live,
            ...publicLinks(origin, `/events/${event.slug}`),
          })),
        ].slice(0, bounded),
        players: players.slice(0, bounded).map((player) => ({
          ...player,
          ...publicLinks(
            origin,
            player.publicPath ?? `/players/${player.handle}`,
          ),
        })),
        coaches: coaches
          .filter(matches)
          .slice(0, bounded)
          .map((coach) => ({
            ...coach,
            ...publicLinks(origin, `/coaches/${coach.handle}`),
          })),
        teams: teams
          .filter(matches)
          .slice(0, bounded)
          .map((team) => ({
            ...team,
            ...publicLinks(origin, `/pro/teams/${team.teamNo}`),
          })),
      };
    }
    case "search_events": {
      const kind = stringArgument(input.args, "kind", false) as
        | "tournament"
        | "league"
        | "clinic"
        | "open-play"
        | "private-lesson"
        | "court-rental"
        | "pickup"
        | undefined;
      const ratingValue = input.args.rating;
      const [events, coverage] = await Promise.all([
        caller.public.events({
          ...(kind ? { kind } : {}),
          ...(typeof ratingValue === "number" ? { rating: ratingValue } : {}),
        }),
        caller.public.proCoverage(),
      ]);
      const query = stringArgument(input.args, "query", false)?.toLowerCase();
      const matchesQuery = (value: unknown) =>
        query ? JSON.stringify(value).toLowerCase().includes(query) : true;
      const bounded = Math.min(50, Math.max(1, limit));
      return [
        ...events.filter(matchesQuery).map((event) => ({
          entityType: "event" as const,
          ...event,
          ...publicLinks(origin, `/events/${event.slug}`),
          actionUrl: `${origin}/events/${event.slug}`,
        })),
        ...(kind && kind !== "tournament"
          ? []
          : coverage.events.filter(matchesQuery).map((event) => ({
              entityType: "professional_event" as const,
              ...event,
              ...publicLinks(origin, `/events/${event.slug}`),
              actionUrl: `${origin}/events/${event.slug}`,
            }))),
      ].slice(0, bounded);
    }
    case "get_event": {
      const slug = stringArgument(input.args, "slug")!;
      const [event, professionalEvent] = await Promise.all([
        caller.public.eventBySlug({ slug }).catch(() => undefined),
        caller.public.proEvent({ slug }).catch(() => undefined),
      ]);
      const result = event ?? professionalEvent;
      if (!result) throw new Error("Public event not found");
      return {
        entityType: event ? "event" : "professional_event",
        ...result,
        ...publicLinks(origin, `/events/${slug}`),
        actionUrl: `${origin}/events/${slug}`,
      };
    }
    case "get_match": {
      const matchId = stringArgument(input.args, "matchId")!;
      const eventSlug = stringArgument(input.args, "eventSlug", false);
      if (eventSlug) {
        const detail = await caller.public.proMatch({ eventSlug, matchId });
        return {
          entityType: "professional_match",
          ...detail,
          ...publicLinks(origin, detail.match.canonicalPath),
        };
      }
      const match = await caller.public
        .matchDetails({ matchId })
        .catch(() => undefined);
      if (match) {
        return {
          entityType: "match",
          ...match,
          ...publicLinks(origin, `/matches/${match.id}`),
        };
      }
      const coverage = await caller.public.proCoverage();
      const coverageMatch = coverage.matches.find(
        (candidate) => candidate.id === matchId,
      );
      const resolvedSlug = eventSlugFromMatchPath(coverageMatch?.canonicalPath);
      if (!resolvedSlug) throw new Error("Public match not found");
      const detail = await caller.public.proMatch({
        eventSlug: resolvedSlug,
        matchId,
      });
      return {
        entityType: "professional_match",
        ...detail,
        ...publicLinks(origin, detail.match.canonicalPath),
      };
    }
    case "get_team": {
      const teamNo = Math.floor(numberArgument(input.args, "teamNo", 0));
      if (teamNo < 1) throw new Error("teamNo is required");
      const team = await caller.public.proTeam({ teamNo });
      return {
        entityType: "professional_team",
        ...team,
        ...publicLinks(origin, `/pro/teams/${team.teamNo}`),
      };
    }
    case "find_where_to_watch": {
      const eventSlug = stringArgument(input.args, "eventSlug", false);
      const matchId = stringArgument(input.args, "matchId", false);
      if (!eventSlug && !matchId) {
        throw new Error("eventSlug or matchId is required");
      }
      if (matchId) {
        let resolvedSlug = eventSlug;
        if (!resolvedSlug) {
          const coverage = await caller.public.proCoverage();
          resolvedSlug = eventSlugFromMatchPath(
            coverage.matches.find((candidate) => candidate.id === matchId)
              ?.canonicalPath,
          );
        }
        if (!resolvedSlug) {
          const match = await caller.public
            .matchDetails({ matchId })
            .catch(() => undefined);
          if (!match) throw new Error("Public match not found");
          return {
            subject: `${match.teamA.map((player) => player.displayName).join(" / ")} vs ${match.teamB.map((player) => player.displayName).join(" / ")}`,
            status: "pending",
            watchOptions: [],
            note: "Duna has no verified broadcast destination for this match.",
            ...publicLinks(origin, `/matches/${match.id}`),
          };
        }
        const detail = await caller.public.proMatch({
          eventSlug: resolvedSlug,
          matchId,
        });
        return {
          subject: `${detail.match.teamA.label} vs ${detail.match.teamB.label}`,
          status: detail.match.watchOptions.length ? "confirmed" : "pending",
          watchOptions: detail.match.watchOptions,
          ...publicLinks(origin, detail.match.canonicalPath),
        };
      }
      if (eventSlug) {
        const event = await caller.public.proEvent({ slug: eventSlug });
        const matchOptions = event.matches.flatMap((match) =>
          match.watchOptions.map((option) => ({
            matchId: match.id,
            match: `${match.teamA.label} vs ${match.teamB.label}`,
            canonicalUrl: `${origin}${match.canonicalPath}`,
            ...option,
          })),
        );
        return {
          subject: event.name,
          status:
            event.watchOptions.length || matchOptions.length
              ? "confirmed"
              : "pending",
          eventWatchOptions: event.watchOptions,
          matchWatchOptions: matchOptions,
          ...publicLinks(origin, `/events/${event.slug}`),
        };
      }
      throw new Error("Public event or match not found");
    }
    case "search_players": {
      const query = stringArgument(input.args, "query")!;
      const players = await caller.public.searchPlayers({
        query,
        limit: Math.min(50, Math.max(1, limit)),
      });
      return players.map((player) => ({
        ...player,
        ...publicLinks(
          origin,
          player.publicPath ?? `/players/${player.handle}`,
        ),
        profileUrl: `${origin}${player.publicPath ?? `/players/${player.handle}`}`,
      }));
    }
    case "get_player": {
      const handle = stringArgument(input.args, "handle")!;
      const route = await caller.public.playerRoute({ identifier: handle });
      const { player } = route;
      const [performance, intelligence, videos] = await Promise.all([
        caller.public.playerPerformance({ handle: player.handle }),
        caller.public.playerIntelligence({ handle: player.handle }),
        caller.public.videos({ ownerHandle: player.handle }),
      ]);
      return {
        player,
        performance,
        intelligence,
        videos,
        ...publicLinks(origin, route.canonicalPath),
        profileUrl: `${origin}${route.canonicalPath}`,
        claimUrl: `${origin}/app/onboarding?claimProfile=${encodeURIComponent(player.handle)}`,
      };
    }
    case "get_world_rankings": {
      const rankings = await caller.public.worldRankings();
      const system =
        stringArgument(input.args, "system", false) === "duna"
          ? "duna"
          : "world";
      const gender =
        stringArgument(input.args, "gender", false) === "women"
          ? "women"
          : "men";
      const rows = rankings[system][gender].slice(
        0,
        Math.min(200, Math.max(1, limit || 25)),
      );
      return {
        system,
        gender,
        snapshotDate: rankings.latestDates[gender],
        rows,
        markdownUrl: `${origin}/rankings.md`,
        rankingsUrl: `${origin}/rankings?view=${system}&gender=${gender}`,
      };
    }
    case "get_rating_methodology": {
      const lab = await caller.public.ratingLab();
      return {
        lab,
        methodologyUrl: `${origin}/methodology`,
        markdownUrl: `${origin}/methodology.md`,
      };
    }
    case "find_coaches": {
      const organizationSlug = stringArgument(
        input.args,
        "organizationSlug",
        false,
      );
      const query = stringArgument(input.args, "query", false)?.toLowerCase();
      const coaches = await caller.public.coaches(
        organizationSlug ? { organizationSlug } : undefined,
      );
      return coaches
        .filter((coach) =>
          query ? JSON.stringify(coach).toLowerCase().includes(query) : true,
        )
        .slice(0, Math.min(50, Math.max(1, limit)))
        .map((coach) => ({
          ...coach,
          ...publicLinks(origin, `/coaches/${coach.handle}`),
          profileUrl: `${origin}/coaches/${coach.handle}`,
        }));
    }
    case "get_coach": {
      const handle = stringArgument(input.args, "handle")!;
      const organizationSlug = stringArgument(
        input.args,
        "organizationSlug",
        false,
      );
      const coach = await caller.public.coach({
        handle,
        ...(organizationSlug ? { organizationSlug } : {}),
      });
      return {
        ...coach,
        ...publicLinks(origin, `/coaches/${coach.handle}`),
        profileUrl: `${origin}/coaches/${coach.handle}`,
      };
    }
    case "find_booking_options": {
      const query = stringArgument(input.args, "query", false)?.toLowerCase();
      const organizationSlug = stringArgument(
        input.args,
        "organizationSlug",
        false,
      );
      const [events, coaches, venues] = await Promise.all([
        caller.public.events(),
        caller.public.coaches(
          organizationSlug ? { organizationSlug } : undefined,
        ),
        caller.public.venues(),
      ]);
      const matchesQuery = (value: unknown) =>
        query ? JSON.stringify(value).toLowerCase().includes(query) : true;
      const bounded = Math.min(30, Math.max(1, limit || 12));
      return {
        events: events
          .filter(matchesQuery)
          .slice(0, bounded)
          .map((event) => ({
            ...event,
            ...publicLinks(origin, `/events/${event.slug}`),
            actionUrl: `${origin}/events/${event.slug}`,
          })),
        coaches: coaches
          .filter(matchesQuery)
          .slice(0, bounded)
          .map((coach) => ({
            ...coach,
            ...publicLinks(origin, `/coaches/${coach.handle}`),
            actionUrl: `${origin}/coaches/${coach.handle}`,
          })),
        venues: venues.filter(matchesQuery).slice(0, bounded),
        discoveryUrl: `${origin}/app/discover`,
        checkoutPolicy:
          "Return options only. The user must review eligibility, price, policies, and complete Duna checkout.",
      };
    }
    case "report_match_issue": {
      if (!input.context.actor) throw new Error("Authentication is required");
      return caller.player.flagMatchHistory({
        matchId: stringArgument(input.args, "matchId")!,
        reasonCode: stringArgument(input.args, "reasonCode")! as
          "not-me" | "wrong-score" | "wrong-opponents" | "duplicate" | "other",
        details: stringArgument(input.args, "details", false),
        idempotencyKey:
          stringArgument(input.args, "idempotencyKey", false) ??
          crypto.randomUUID(),
      });
    }
    case "list_data_issues": {
      const data = await caller.admin.sandData();
      const bounded = Math.min(100, Math.max(1, limit || 25));
      return {
        unresolvedPlayers: data.mappings.slice(0, bounded),
        importedMatches: data.matches.slice(0, bounded),
        matchDisputes: data.historyDisputes.slice(0, bounded),
        profileClaims: data.profileClaimReviews.slice(0, bounded),
      };
    }
    case "inspect_player_identity": {
      const query = stringArgument(input.args, "query")!;
      const [players, data] = await Promise.all([
        caller.admin.sandPlayerSearch({ query }),
        caller.admin.sandData(),
      ]);
      const normalized = query.toLowerCase();
      return {
        players,
        connectedSources: data.linkedMappings.filter((mapping) =>
          JSON.stringify(mapping).toLowerCase().includes(normalized),
        ),
        unresolvedSources: data.mappings.filter((mapping) =>
          JSON.stringify(mapping).toLowerCase().includes(normalized),
        ),
      };
    }
    case "resolve_player_identity": {
      const confidence = numberArgument(input.args, "confidence", 0);
      const evidenceUrls = Array.isArray(input.args.evidenceUrls)
        ? input.args.evidenceUrls.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      if (confidence < 0.98 || evidenceUrls.length === 0) {
        throw new Error(
          "Identity resolution requires confidence of at least 0.98 and an evidence URL",
        );
      }
      for (const value of evidenceUrls) new URL(value);
      const reason = stringArgument(input.args, "reason")!;
      return caller.admin.linkSandPlayer({
        externalProfileId: stringArgument(input.args, "externalProfileId")!,
        personId: stringArgument(input.args, "personId")!,
        reason: `${reason} Evidence: ${evidenceUrls.join(", ")}`.slice(0, 500),
      });
    }
    case "review_profile_claim":
      return caller.admin.reviewProfileClaim({
        jobId: stringArgument(input.args, "jobId")!,
        decision: stringArgument(input.args, "decision")! as
          "approved" | "rejected",
        officialProfileMatched: input.args.officialProfileMatched === true,
        reason: stringArgument(input.args, "reason")!,
      });
    case "review_match_issue":
      return caller.admin.reviewMatchHistoryDispute({
        disputeId: stringArgument(input.args, "disputeId")!,
        decision: stringArgument(input.args, "decision")! as
          "upheld" | "rejected",
        resolutionNotes: stringArgument(input.args, "resolutionNotes")!,
      });
    case "run_rating_backtest":
      return caller.admin.evaluateRating();
    default:
      throw new Error(`Unknown or unauthorized tool: ${input.name}`);
  }
}

async function readResource(input: {
  readonly uri: string;
  readonly context: ApiContext;
}): Promise<{
  readonly uri: string;
  readonly mimeType: "text/markdown";
  readonly text: string;
}> {
  const caller = createCaller(input.context);
  const url = new URL(input.uri);
  if (url.protocol !== "duna:") throw new Error("Unsupported resource URI");
  const parts = [url.hostname, ...url.pathname.split("/").filter(Boolean)];
  let text: string | undefined;

  if (parts[0] === "guide" && parts[1] === "agents") {
    text = renderAgentsGuide();
  } else if (parts[0] === "site" && parts[1] === "index") {
    const { default: buildSitemap } = await import("../../sitemap");
    text = renderSitemapMarkdown(await buildSitemap());
  } else if (
    parts[0] === "events" &&
    parts[1] &&
    parts[2] === "matches" &&
    parts[3]
  ) {
    const detail = await caller.public
      .proMatch({ eventSlug: parts[1], matchId: parts[3] })
      .catch(() => undefined);
    if (detail) text = renderProfessionalMatchMarkdown(detail);
  } else if (parts[0] === "events" && parts[1]) {
    const [professional, event] = await Promise.all([
      caller.public.proEvent({ slug: parts[1] }).catch(() => undefined),
      caller.public.eventBySlug({ slug: parts[1] }).catch(() => undefined),
    ]);
    if (professional) text = renderProfessionalEventMarkdown(professional);
    else if (event) text = renderConsumerEventMarkdown(event);
  } else if (parts[0] === "matches" && parts[1]) {
    const match = await caller.public
      .matchDetails({ matchId: parts[1] })
      .catch(() => undefined);
    if (match) text = renderMatchMarkdown(match);
  } else if (parts[0] === "players" && parts[1]) {
    const route = await caller.public
      .playerRoute({ identifier: parts[1] })
      .catch(() => undefined);
    if (route) {
      const [performance, intelligence] = await Promise.all([
        caller.public
          .playerPerformance({ handle: route.player.handle })
          .catch(() => undefined),
        caller.public
          .playerIntelligence({ handle: route.player.handle })
          .catch(() => undefined),
      ]);
      text = renderPlayerMarkdown({
        player: route.player,
        canonicalPath: route.canonicalPath,
        performance,
        intelligence,
      });
    }
  } else if (parts[0] === "teams" && parts[1]) {
    const teamNo = Number.parseInt(parts[1], 10);
    const team = Number.isInteger(teamNo)
      ? await caller.public.proTeam({ teamNo }).catch(() => undefined)
      : undefined;
    if (team) text = renderProfessionalTeamMarkdown(team);
  } else if (parts[0] === "coaches" && parts[1]) {
    const coach = await caller.public
      .coach({ handle: parts[1] })
      .catch(() => undefined);
    if (coach) text = renderCoachMarkdown(coach);
  } else if (parts[0] === "clubs" && parts[1]) {
    const slug = parts[1];
    const [storefront, organization, events, coaches, venues] =
      await Promise.all([
        caller.public.organizationStorefront({ slug }).catch(() => undefined),
        caller.public.organizationBySlug({ slug }).catch(() => undefined),
        caller.public.events().catch(() => []),
        caller.public.coaches({ organizationSlug: slug }).catch(() => []),
        caller.public.venues().catch(() => []),
      ]);
    if (storefront) text = renderStorefrontMarkdown(storefront);
    else if (organization) {
      text = renderOrganizationMarkdown({
        organization,
        events: events.filter(
          (event) =>
            event.organizationId === organization.id ||
            event.organizationSlug === slug,
        ),
        coaches,
        venues: venues.filter(
          (venue) => venue.organizationId === organization.id,
        ),
      });
    }
  }

  if (!text) throw new Error("Public Duna resource not found");
  return { uri: input.uri, mimeType: "text/markdown", text };
}

function getPrompt(input: {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly request: Request;
}) {
  const origin = publicOrigin();
  const agentGuide = `${origin}/agents`;
  const promptArgument = (name: string) =>
    stringArgument(input.args, name, false) ?? "not specified";
  const instructions =
    input.name === "answer_where_to_watch"
      ? `Answer where to watch ${promptArgument("event_or_match")}. Read ${agentGuide}, use search_events and find_where_to_watch, state whether coverage is confirmed or pending, preserve the event timezone, and link the canonical Duna event or match page. Never infer a stream.`
      : input.name === "research_player"
        ? `Research ${promptArgument("player")} as a beach volleyball player. Read ${agentGuide}, resolve the canonical Duna identity, then distinguish official world rank, Duna Sand Rating, verified results, partners, form, upcoming events, and published biography. Cite and link the canonical Duna player and relevant event or match pages.`
        : input.name === "find_play_or_coaching"
          ? `Help with this request: ${promptArgument("request")}. Read ${agentGuide}, search public events and coaches, verify place, timezone, dates, level, price, and current availability, then return the canonical Duna registration or booking links. Do not claim registration, a hold, or payment before the user completes Duna checkout.`
          : undefined;
  if (!instructions) throw new Error("Unknown prompt");
  return {
    description: publicPrompts.find((prompt) => prompt.name === input.name)
      ?.description,
    messages: [
      {
        role: "user",
        content: { type: "text", text: instructions },
      },
    ],
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) {
    return jsonRpcError(null, -32000, "Origin is not allowed", 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumBodyBytes) {
    return jsonRpcError(null, -32600, "Request body is too large", 413);
  }
  const requestedProtocol = request.headers.get("mcp-protocol-version");
  if (requestedProtocol && !supportedProtocolVersions.has(requestedProtocol)) {
    return jsonRpcError(null, -32600, "Unsupported MCP protocol version", 400);
  }
  const responseProtocol = requestedProtocol ?? protocolVersion;
  let message: JsonRpcRequest;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maximumBodyBytes) {
      return jsonRpcError(null, -32600, "Request body is too large", 413);
    }
    message = JSON.parse(body) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return jsonRpcError(message.id ?? null, -32600, "Invalid Request", 400);
  }
  const context = await createApiContextFromRequest(request, {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  if (message.id === undefined) {
    return new Response(null, {
      status: 202,
      headers: { "MCP-Protocol-Version": protocolVersion },
    });
  }
  if (message.method === "initialize") {
    const initializedVersion = stringArgument(
      asObject(message.params),
      "protocolVersion",
      false,
    );
    const negotiatedVersion =
      initializedVersion && supportedProtocolVersions.has(initializedVersion)
        ? initializedVersion
        : protocolVersion;
    return jsonRpcResponse(
      {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: { name: "duna", title: "Duna", version: "2.0.0" },
          instructions:
            "Read duna://guide/agents first. Use public tools and Markdown resources for events, matches, teams, players, rankings, coaches, clinics, geography, broadcasts, and booking entry points. Return canonical Duna links for people and transactions. Missing facts are unverified, not invitations to infer. Authenticated repair tools are role-gated and audited.",
        },
      },
      200,
      negotiatedVersion,
    );
  }
  if (message.method === "ping") {
    return jsonRpcResponse(
      { jsonrpc: "2.0", id: message.id, result: {} },
      200,
      responseProtocol,
    );
  }
  if (message.method === "tools/list") {
    return jsonRpcResponse(
      {
        jsonrpc: "2.0",
        id: message.id,
        result: { tools: toolsFor(context) },
      },
      200,
      responseProtocol,
    );
  }
  if (message.method === "resources/list") {
    return jsonRpcResponse(
      {
        jsonrpc: "2.0",
        id: message.id,
        result: { resources: publicResources },
      },
      200,
      responseProtocol,
    );
  }
  if (message.method === "resources/templates/list") {
    return jsonRpcResponse(
      {
        jsonrpc: "2.0",
        id: message.id,
        result: { resourceTemplates: publicResourceTemplates },
      },
      200,
      responseProtocol,
    );
  }
  if (message.method === "resources/read") {
    const params = asObject(message.params);
    const uri = typeof params.uri === "string" ? params.uri : "";
    if (!uri) return jsonRpcError(message.id, -32602, "uri is required");
    try {
      const content = await readResource({ uri, context });
      return jsonRpcResponse(
        {
          jsonrpc: "2.0",
          id: message.id,
          result: { contents: [content] },
        },
        200,
        responseProtocol,
      );
    } catch (error) {
      return jsonRpcError(
        message.id,
        -32002,
        error instanceof Error ? error.message : "Resource read failed",
      );
    }
  }
  if (message.method === "prompts/list") {
    return jsonRpcResponse(
      {
        jsonrpc: "2.0",
        id: message.id,
        result: { prompts: publicPrompts },
      },
      200,
      responseProtocol,
    );
  }
  if (message.method === "prompts/get") {
    const params = asObject(message.params);
    const name = typeof params.name === "string" ? params.name : "";
    try {
      return jsonRpcResponse(
        {
          jsonrpc: "2.0",
          id: message.id,
          result: getPrompt({
            name,
            args: asObject(params.arguments),
            request,
          }),
        },
        200,
        responseProtocol,
      );
    } catch (error) {
      return jsonRpcError(
        message.id,
        -32602,
        error instanceof Error ? error.message : "Prompt could not be built",
      );
    }
  }
  if (message.method === "tools/call") {
    const params = asObject(message.params);
    const name = typeof params.name === "string" ? params.name : "";
    const available = toolsFor(context).some((tool) => tool.name === name);
    if (!available) {
      return jsonRpcError(message.id, -32602, "Unknown or unauthorized tool");
    }
    try {
      const data = await callTool({
        name,
        args: asObject(params.arguments),
        context,
        request,
      });
      return jsonRpcResponse(
        {
          jsonrpc: "2.0",
          id: message.id,
          result: toolResult(data),
        },
        200,
        responseProtocol,
      );
    } catch (error) {
      return jsonRpcResponse(
        {
          jsonrpc: "2.0",
          id: message.id,
          result: toolResult(
            {
              error:
                error instanceof Error ? error.message : "Tool call failed",
            },
            true,
          ),
        },
        200,
        responseProtocol,
      );
    }
  }
  return jsonRpcError(message.id, -32601, "Method not found");
}

export function GET(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "MCP-Protocol-Version": protocolVersion,
    },
  });
}

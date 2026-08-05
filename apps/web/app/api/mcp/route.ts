import {
  createApiContextFromRequest,
  createCaller,
  type ApiContext,
} from "@duna/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const protocolVersion = "2025-06-18";
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

function publicOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin
  );
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
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": protocolVersion,
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
  const origin = publicOrigin(input.request);
  const limit = Math.floor(numberArgument(input.args, "limit", 20));
  switch (input.name) {
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
      const events = await caller.public.events({
        ...(kind ? { kind } : {}),
        ...(typeof ratingValue === "number" ? { rating: ratingValue } : {}),
      });
      const query = stringArgument(input.args, "query", false)?.toLowerCase();
      return events
        .filter((event) =>
          query ? JSON.stringify(event).toLowerCase().includes(query) : true,
        )
        .slice(0, Math.min(50, Math.max(1, limit)))
        .map((event) => ({
          ...event,
          actionUrl: `${origin}/events/${event.slug}`,
        }));
    }
    case "get_event": {
      const slug = stringArgument(input.args, "slug")!;
      const event = await caller.public.eventBySlug({ slug });
      return { ...event, actionUrl: `${origin}/events/${event.slug}` };
    }
    case "search_players": {
      const query = stringArgument(input.args, "query")!;
      const players = await caller.public.searchPlayers({
        query,
        limit: Math.min(50, Math.max(1, limit)),
      });
      return players.map((player) => ({
        ...player,
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
        rankingsUrl: `${origin}/rankings?view=${system}&gender=${gender}`,
      };
    }
    case "get_rating_methodology": {
      const lab = await caller.public.ratingLab();
      return { lab, methodologyUrl: `${origin}/methodology` };
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
      return { ...coach, profileUrl: `${origin}/coaches/${coach.handle}` };
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
            actionUrl: `${origin}/events/${event.slug}`,
          })),
        coaches: coaches
          .filter(matchesQuery)
          .slice(0, bounded)
          .map((coach) => ({
            ...coach,
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

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) {
    return jsonRpcError(null, -32000, "Origin is not allowed", 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumBodyBytes) {
    return jsonRpcError(null, -32600, "Request body is too large", 413);
  }
  const requestedProtocol = request.headers.get("mcp-protocol-version");
  if (requestedProtocol && requestedProtocol !== protocolVersion) {
    return jsonRpcError(null, -32600, "Unsupported MCP protocol version", 400);
  }
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
    return jsonRpcResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "duna", title: "Duna", version: "1.0.0" },
        instructions:
          "Use public tools for discovery, rankings, players, lessons, events, and booking entry points. Authenticated repair tools are audited; do not infer identity links without cited source evidence.",
      },
    });
  }
  if (message.method === "ping") {
    return jsonRpcResponse({ jsonrpc: "2.0", id: message.id, result: {} });
  }
  if (message.method === "tools/list") {
    return jsonRpcResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: toolsFor(context) },
    });
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
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: toolResult(data),
      });
    } catch (error) {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: toolResult(
          {
            error: error instanceof Error ? error.message : "Tool call failed",
          },
          true,
        ),
      });
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

import {
  Agent,
  OpenAIProvider,
  run,
  setTracingDisabled,
  tool,
  webSearchTool,
} from "@openai/agents";
import { z } from "zod";
import type {
  DiscoveryMapItem,
  EventSummary,
  WeatherForecast,
} from "./contracts";
import { bookingSummarySchema, metricSchema } from "./contracts";
import type { ApiActor } from "./context";
import { loadDiscoveryMap } from "./discovery-service";
import { cancelPlayerBooking } from "./player-bookings";
import { getRepository } from "./repository";
import {
  confirmAgentAction,
  getAgentDraft,
  proposeAgentAction,
  type AgentDraft,
  type RegisteredToolName,
} from "./risk";
import { consumeRateLimit } from "./rate-limit";
import { cancelCalendarSession } from "./catalog-service";
import { loadWeatherForecast } from "./weather";

// Duna's first-party context can include membership and payment information.
// OpenAI tracing stays off; Duna stores its own bounded audit record for every
// proposed and confirmed write through the existing risk gate.
setTracingDisabled(true);

type BookingSummary = z.infer<typeof bookingSummarySchema>;
type Metric = z.infer<typeof metricSchema>;

export const dunaAiSurfaceSchema = z.enum(["player", "hq"]);
export type DunaAiSurface = z.infer<typeof dunaAiSurfaceSchema>;

export const dunaAiClientContextSchema = z.object({
  pathname: z.string().trim().max(240),
  pageTitle: z.string().trim().max(160).optional(),
  timezone: z.string().trim().max(80).optional(),
  locale: z.string().trim().max(40).optional(),
  localTime: z.iso.datetime({ offset: true }).optional(),
  recentPaths: z.array(z.string().trim().max(240)).max(8).optional(),
  interactionSignals: z.array(z.string().trim().max(160)).max(8).optional(),
});
export type DunaAiClientContext = z.infer<typeof dunaAiClientContextSchema>;

const dunaAiHistoryItemSchema = z.object({
  role: z.enum(["assistant", "user"]),
  body: z.string().trim().min(1).max(2_000),
});

const dunaAiAskRequestSchema = z.object({
  mode: z.literal("ask").optional(),
  message: z.string().trim().min(1).max(2_000),
  surface: dunaAiSurfaceSchema,
  page: z.string().trim().max(240).optional(),
  context: dunaAiClientContextSchema.optional(),
  history: z.array(dunaAiHistoryItemSchema).max(10).optional(),
  researchMode: z.enum(["off", "on"]).default("off"),
});

const dunaAiSuggestionsRequestSchema = z.object({
  mode: z.literal("suggestions"),
  surface: dunaAiSurfaceSchema,
  page: z.string().trim().max(240).optional(),
  context: dunaAiClientContextSchema.optional(),
});

export const dunaAiRequestSchema = z.union([
  dunaAiSuggestionsRequestSchema,
  dunaAiAskRequestSchema,
]);

interface DunaAiCardBase {
  readonly title: string;
  readonly detail: string;
}

export interface DunaAiLinkCard extends DunaAiCardBase {
  readonly kind: "link" | "notice";
  readonly href?: string;
  readonly tone?: "default" | "positive" | "warning" | "danger";
}

export interface DunaAiEventCard extends DunaAiCardBase {
  readonly kind: "event";
  readonly href: string;
  readonly imageUrl?: string;
  readonly startsAt?: string;
  readonly venue?: string;
  readonly price?: string;
  readonly spotsRemaining?: number;
}

export interface DunaAiMapCard extends DunaAiCardBase {
  readonly kind: "map";
  readonly points: readonly {
    readonly id: string;
    readonly title: string;
    readonly subtitle: string;
    readonly href: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly imageUrl?: string;
    readonly startsAt?: string;
  }[];
}

export interface DunaAiMetricCard extends DunaAiCardBase {
  readonly kind: "metric";
  readonly metrics: readonly Pick<
    Metric,
    "label" | "value" | "change" | "trend" | "tone"
  >[];
}

export interface DunaAiApprovalCard extends DunaAiCardBase {
  readonly kind: "approval";
  readonly changes: readonly string[];
  readonly draft: Pick<
    AgentDraft,
    | "id"
    | "toolName"
    | "riskTier"
    | "proposedDiff"
    | "expiresAt"
    | "confirmationNonce"
  >;
}

export type DunaAiCard =
  | DunaAiLinkCard
  | DunaAiEventCard
  | DunaAiMapCard
  | DunaAiMetricCard
  | DunaAiApprovalCard;

export interface DunaAiResponse {
  readonly reply: string;
  readonly cards: readonly DunaAiCard[];
  readonly suggestions: readonly string[];
  readonly toolsUsed: readonly string[];
  readonly model?: string;
  readonly reasoningEffort: "high";
  readonly providerAvailable: boolean;
  readonly researchUsed: boolean;
}

export interface DunaAiActionOutcome {
  readonly draft: AgentDraft;
  readonly status: "applied" | "approved-plan" | "failed";
  readonly reply: string;
  readonly changes: readonly string[];
  readonly href?: string;
}

interface DunaAiRuntime {
  readonly modelProvider?: OpenAIProvider;
}

interface ContextSnapshot {
  readonly actor: {
    readonly personId: string;
    readonly displayName: string;
    readonly roles: readonly string[];
    readonly scopes: readonly string[];
    readonly ageBand: string;
    readonly organizationId?: string;
  };
  readonly now: string;
  readonly localContext: DunaAiClientContext;
  readonly pageIntent: string;
  readonly metrics: readonly Metric[];
  readonly bookings: readonly BookingSummary[];
  readonly events: readonly EventSummary[];
  readonly conflicts: readonly string[];
  readonly weatherSignals: readonly WeatherSignal[];
  readonly underperforming: readonly EventSummary[];
  readonly discovery: readonly DiscoveryMapItem[];
  readonly alerts: readonly { title: string; detail: string }[];
}

interface WeatherSignal {
  readonly title: string;
  readonly startsAt: string;
  readonly condition: string;
  readonly precipitationProbability?: number;
  readonly windGustKph?: number;
  readonly temperatureC?: number;
}

function dunaAiRuntime(): DunaAiRuntime | undefined {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!credential) return undefined;
  return {
    modelProvider: new OpenAIProvider({
      apiKey: credential,
      baseURL: "https://ai-gateway.vercel.sh/v1",
      cacheResponsesWebSocketModels: false,
      useResponses: true,
    }),
  };
}

export function hasDunaAiGatewayCredential(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

export function resolveDunaAiCopilotModel(): string {
  const configured = process.env.DUNA_COPILOT_MODEL?.trim() || "gpt-5.6-terra";
  return configured.includes("/") ? configured : `openai/${configured}`;
}

function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

function formatMoney(item: DiscoveryMapItem): string | undefined {
  if (!item.price) return undefined;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: item.price.currency,
    maximumFractionDigits: item.price.amountMinor % 100 === 0 ? 0 : 2,
  }).format(item.price.amountMinor / 100);
}

function pageIntent(surface: DunaAiSurface, pathname: string): string {
  const value = pathname.toLowerCase();
  if (/discover|map|venue/.test(value)) return "discovering places to play";
  if (/event/.test(value))
    return surface === "hq" ? "operating an event" : "evaluating an event";
  if (/calendar|schedule/.test(value)) return "planning a schedule";
  if (/team|coach/.test(value)) return "managing coaches and team availability";
  if (/payment|finance|report/.test(value))
    return "reviewing business performance";
  if (/match|rating/.test(value))
    return "reviewing play and rating performance";
  if (/message/.test(value)) return "communicating with members or players";
  return surface === "hq"
    ? "reviewing the operation"
    : "reviewing the player home";
}

function overlaps(
  left: { startsAt: string; endsAt: string },
  right: { startsAt: string; endsAt: string },
): boolean {
  return (
    Date.parse(left.startsAt) < Date.parse(right.endsAt) &&
    Date.parse(right.startsAt) < Date.parse(left.endsAt)
  );
}

export function findScheduleConflicts(
  items: readonly { title: string; startsAt: string; endsAt: string }[],
): readonly string[] {
  const sorted = [...items].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const conflicts: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    for (let other = index + 1; other < sorted.length; other += 1) {
      const left = sorted[index];
      const right = sorted[other];
      if (
        !left ||
        !right ||
        Date.parse(right.startsAt) >= Date.parse(left.endsAt)
      )
        break;
      if (overlaps(left, right))
        conflicts.push(`${left.title} overlaps ${right.title}`);
    }
  }
  return conflicts.slice(0, 8);
}

function weatherSignal(
  title: string,
  startsAt: string,
  forecast: WeatherForecast | undefined,
): WeatherSignal | undefined {
  const point = forecast?.hourly.reduce<
    WeatherForecast["hourly"][number] | undefined
  >(
    (closest, candidate) =>
      !closest ||
      Math.abs(Date.parse(candidate.startsAt) - Date.parse(startsAt)) <
        Math.abs(Date.parse(closest.startsAt) - Date.parse(startsAt))
        ? candidate
        : closest,
    undefined,
  );
  const day = forecast?.days[0];
  if (!point && !day) return undefined;
  return {
    title,
    startsAt,
    condition: point?.condition ?? day?.condition ?? "Forecast available",
    precipitationProbability:
      point?.precipitationProbability ?? day?.precipitationProbability,
    windGustKph: point?.windGustKph ?? day?.windGustKph,
    temperatureC: point?.temperatureC,
  };
}

async function bookingWeather(
  booking: BookingSummary,
  now: Date,
): Promise<WeatherSignal | undefined> {
  const latitude = booking.location?.latitude;
  const longitude = booking.location?.longitude;
  if (latitude === undefined || longitude === undefined) return undefined;
  if (Date.parse(booking.startsAt) > now.getTime() + 10 * 86_400_000)
    return undefined;
  const forecast = await loadWeatherForecast({
    latitude,
    longitude,
    timezone: booking.venueTimezone ?? "America/New_York",
    startsAt: new Date(booking.startsAt),
    endsAt: new Date(booking.endsAt),
    now,
  }).catch(() => undefined);
  return weatherSignal(booking.title, booking.startsAt, forecast);
}

function discoveryTerms(message: string): string[] {
  const stop = new Set([
    "find",
    "show",
    "give",
    "want",
    "looking",
    "near",
    "nearby",
    "please",
    "where",
    "event",
    "events",
    "game",
    "games",
    "play",
    "map",
    "with",
    "that",
    "fits",
    "schedule",
    "for",
    "the",
    "and",
    "this",
    "weekend",
    "today",
    "tomorrow",
  ]);
  return message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stop.has(word));
}

export function rankDiscoveryItems(
  items: readonly DiscoveryMapItem[],
  message: string,
  now = new Date(),
): readonly DiscoveryMapItem[] {
  const terms = discoveryTerms(message);
  return items
    .filter((item) => !item.endsAt || Date.parse(item.endsAt) >= now.getTime())
    .map((item) => {
      const haystack = [item.title, item.subtitle, item.kind, ...item.tags]
        .join(" ")
        .toLowerCase();
      const termScore = terms.reduce(
        (total, term) => total + (haystack.includes(term) ? 3 : 0),
        0,
      );
      const score =
        termScore +
        (item.entityType === "event" ? 2 : 0) +
        (item.latitude !== undefined && item.longitude !== undefined ? 1 : 0);
      return { item, score, termScore };
    })
    .filter(({ termScore }) => terms.length === 0 || termScore > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(a.item.startsAt ?? "9999-12-31") -
          Date.parse(b.item.startsAt ?? "9999-12-31"),
    )
    .slice(0, 8)
    .map(({ item }) => item);
}

function shouldLoadDiscovery(
  surface: DunaAiSurface,
  message: string,
  pathname: string,
): boolean {
  return (
    surface === "player" &&
    /find|discover|near|map|where|game|event|coach|club|venue|play/.test(
      `${message} ${pathname}`.toLowerCase(),
    )
  );
}

async function buildContextSnapshot(input: {
  actor: ApiActor;
  surface: DunaAiSurface;
  message: string;
  page?: string;
  context?: DunaAiClientContext;
  now: Date;
}): Promise<ContextSnapshot> {
  const localContext: DunaAiClientContext = input.context ?? {
    pathname: input.page ?? (input.surface === "hq" ? "/" : "/app"),
  };
  const base = {
    actor: {
      personId: input.actor.personId,
      displayName: input.actor.displayName,
      roles: input.actor.roles,
      scopes: input.actor.scopes,
      ageBand: input.actor.ageBand,
      organizationId: input.actor.organizationId,
    },
    now: input.now.toISOString(),
    localContext,
    pageIntent: pageIntent(input.surface, localContext.pathname),
  };

  if (input.surface === "player") {
    const dashboard = await getRepository().player.dashboard(
      input.actor.personId,
    );
    const bookings = dashboard.bookings
      .filter((item) => Date.parse(item.endsAt) >= input.now.getTime())
      .slice(0, 20);
    const events = dashboard.events
      .filter((item) => Date.parse(item.endsAt) >= input.now.getTime())
      .slice(0, 20);
    const weatherSignals = (
      await Promise.all(
        bookings
          .slice(0, 3)
          .map((booking) => bookingWeather(booking, input.now)),
      )
    ).filter((item): item is WeatherSignal => Boolean(item));
    const discovery = shouldLoadDiscovery(
      input.surface,
      input.message,
      localContext.pathname,
    )
      ? rankDiscoveryItems(
          (await loadDiscoveryMap()).items,
          input.message,
          input.now,
        )
      : [];
    return {
      ...base,
      metrics: dashboard.metrics,
      bookings,
      events,
      conflicts: findScheduleConflicts(bookings),
      weatherSignals,
      underperforming: [],
      discovery,
      alerts: [],
    };
  }

  if (!input.actor.organizationId) {
    return {
      ...base,
      metrics: [],
      bookings: [],
      events: [],
      conflicts: [],
      weatherSignals: [],
      underperforming: [],
      discovery: [],
      alerts: [
        {
          title: "Choose an organization",
          detail:
            "Duna HQ needs an active organization before operational context can be loaded.",
        },
      ],
    };
  }
  const dashboard = await getRepository().operator.dashboard(
    input.actor.organizationId,
  );
  const events = dashboard.events
    .filter((item) => Date.parse(item.endsAt) >= input.now.getTime())
    .slice(0, 30);
  const underperforming = events
    .filter((event) => {
      const filled = event.capacity - event.spotsRemaining;
      const leadTime = Date.parse(event.startsAt) - input.now.getTime();
      return (
        event.lifecycleStatus !== "cancelled" &&
        leadTime > 0 &&
        leadTime <= 14 * 86_400_000 &&
        filled / event.capacity <= 0.35
      );
    })
    .slice(0, 8);
  const weatherSignals = events.slice(0, 4).flatMap((event) => {
    const signal = weatherSignal(event.title, event.startsAt, event.weather);
    return signal ? [signal] : [];
  });
  return {
    ...base,
    metrics: dashboard.metrics,
    bookings: [],
    events,
    conflicts: findScheduleConflicts(events),
    weatherSignals,
    underperforming,
    discovery: [],
    alerts: dashboard.alerts.map(({ title, detail }) => ({ title, detail })),
  };
}

function eventCard(item: DiscoveryMapItem): DunaAiEventCard {
  return {
    kind: "event",
    title: item.title,
    detail: item.subtitle,
    href: item.href,
    imageUrl: item.imageUrl,
    startsAt: item.startsAt,
    venue: item.subtitle,
    price: formatMoney(item),
    spotsRemaining: item.spotsRemaining,
  };
}

function contextCards(
  snapshot: ContextSnapshot,
  message: string,
): DunaAiCard[] {
  const cards: DunaAiCard[] = [];
  if (snapshot.discovery.length > 0) {
    const mapped = snapshot.discovery.filter(
      (
        item,
      ): item is DiscoveryMapItem & { latitude: number; longitude: number } =>
        item.latitude !== undefined && item.longitude !== undefined,
    );
    if (mapped.length > 0) {
      cards.push({
        kind: "map",
        title: "Places that fit",
        detail: `${mapped.length} relevant Duna results, shown in the co-pilot map.`,
        points: mapped.slice(0, 6).map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          href: item.href,
          latitude: item.latitude,
          longitude: item.longitude,
          imageUrl: item.imageUrl,
          startsAt: item.startsAt,
        })),
      });
    }
    cards.push(...snapshot.discovery.slice(0, 3).map(eventCard));
  }
  if (
    /performance|business|revenue|metric|doing|attention|underperform/.test(
      message.toLowerCase(),
    ) &&
    snapshot.metrics.length > 0
  ) {
    cards.push({
      kind: "metric",
      title: "Current performance",
      detail: "Live metrics available to your current Duna role.",
      metrics: snapshot.metrics.slice(0, 6),
    });
  }
  if (
    /weather|conflict|attention|today|tomorrow|week|schedule/.test(
      message.toLowerCase(),
    )
  ) {
    for (const conflict of snapshot.conflicts.slice(0, 2))
      cards.push({
        kind: "notice",
        title: "Schedule conflict",
        detail: conflict,
        tone: "warning",
      });
    for (const signal of snapshot.weatherSignals.slice(0, 2)) {
      const risks = [
        signal.precipitationProbability !== undefined
          ? `${Math.round(signal.precipitationProbability)}% rain`
          : undefined,
        signal.windGustKph !== undefined
          ? `gusts ${Math.round(signal.windGustKph)} km/h`
          : undefined,
        signal.temperatureC !== undefined
          ? `${Math.round(signal.temperatureC)}°C`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      cards.push({
        kind: "notice",
        title: `${signal.title}: ${signal.condition}`,
        detail: risks || "Forecast available for the scheduled time.",
        tone:
          (signal.precipitationProbability ?? 0) >= 50 ||
          (signal.windGustKph ?? 0) >= 40
            ? "warning"
            : "default",
      });
    }
  }
  if (
    snapshot.underperforming.length > 0 &&
    /attention|underperform|business|performance|today/.test(
      message.toLowerCase(),
    )
  ) {
    for (const event of snapshot.underperforming.slice(0, 3))
      cards.push({
        kind: "link",
        title: event.title,
        detail: `${event.capacity - event.spotsRemaining} of ${event.capacity} spots filled. Review before ${new Date(event.startsAt).toLocaleDateString("en-US")}.`,
        href: `/events/${event.id}`,
        tone: "warning",
      });
  }
  return cards;
}

function defaultLinkCards(
  surface: DunaAiSurface,
  message: string,
): DunaAiCard[] {
  const value = message.toLowerCase();
  if (surface === "hq") {
    if (/availability|coach|team/.test(value))
      return [
        {
          kind: "link",
          title: "Coach availability",
          detail: "Review assignments and availability before saving changes.",
          href: "/team",
        },
        {
          kind: "link",
          title: "Calendar",
          detail: "Place approved availability around current sessions.",
          href: "/calendar",
        },
      ];
    if (/event|league|clinic|tournament/.test(value))
      return [
        {
          kind: "link",
          title: "Guided event setup",
          detail: "Keep pricing, capacity, venue, and safeguards connected.",
          href: "/events/create",
        },
      ];
    return [
      {
        kind: "link",
        title: "Operating overview",
        detail: "Review schedule, demand, and organization signals.",
        href: "/",
      },
    ];
  }
  if (/rating|match/.test(value))
    return [
      {
        kind: "link",
        title: "Match history",
        detail: "Review the verified matches behind your rating.",
        href: "/app/matches",
      },
    ];
  if (/book|game|play|run|event|discover|near|map/.test(value))
    return [
      {
        kind: "link",
        title: "Explore all results",
        detail: "Open the full discovery map and filters.",
        href: "/app/discover",
      },
    ];
  return [
    {
      kind: "link",
      title: "Your Duna home",
      detail: "See upcoming bookings, events, and recent play.",
      href: "/app",
    },
  ];
}

function requiresHumanReview(message: string): boolean {
  return /\b(cancel|refund|delete|remove|send|email|message|text|pay|payment|transfer|payout|withdraw|price|charge|publish)\b/i.test(
    message,
  );
}

function fallbackReply(input: {
  surface: DunaAiSurface;
  message: string;
  snapshot: ContextSnapshot;
}): string {
  if (requiresHumanReview(input.message))
    return "I can prepare the exact change set, but consequential work is never applied until you review the targets and approve it with a fresh action.";
  if (input.snapshot.discovery.length > 0)
    return `I found ${input.snapshot.discovery.length} relevant options and put the strongest matches directly in the co-pilot.`;
  if (
    shouldLoadDiscovery(
      input.surface,
      input.message,
      input.snapshot.localContext.pathname,
    )
  ) {
    return "I didn’t find an exact current Duna match for that search. I won’t pad the answer with unrelated places; open Discover to broaden the filters.";
  }
  if (input.surface === "hq")
    return "I checked your page, current operating context, upcoming schedule, performance signals, weather, and conflicts. The most relevant next steps are below.";
  return "I checked your current page, upcoming Duna schedule, conflicts, and available weather context. The most relevant next steps are below.";
}

export function classifyDunaAiAction(message: string):
  | {
      readonly toolName: RegisteredToolName;
      readonly scope: string;
      readonly title: string;
    }
  | undefined {
  const value = message.toLowerCase();
  if (/refund/.test(value))
    return {
      toolName: "payments.refund",
      scope: "payments:write",
      title: "Refund payment",
    };
  if (/cancel.*(booking|rental|reservation)/.test(value))
    return {
      toolName: "bookings.cancel",
      scope: "bookings:write",
      title: "Cancel booking",
    };
  if (/cancel.*(event|clinic|tournament|league)/.test(value))
    return {
      toolName: "events.cancel",
      scope: "sessions:write",
      title: "Cancel event",
    };
  if (/delete.*(account|profile)/.test(value))
    return {
      toolName: "accounts.delete",
      scope: "profile:write",
      title: "Delete account",
    };
  if (
    /(send|email|text|message).*(all|members|players|team)|mass message/.test(
      value,
    )
  )
    return {
      toolName: "messages.send",
      scope: "messages:propose",
      title: "Send message",
    };
  if (/price|pricing/.test(value) && /(change|update|set)/.test(value))
    return {
      toolName: "prices.change",
      scope: "sessions:write",
      title: "Change price",
    };
  if (
    /availability/.test(value) &&
    /(set|change|update|block|make)/.test(value)
  )
    return {
      toolName: "staff.availability.set",
      scope: "sessions:write",
      title: "Set coach availability",
    };
  if (/create.*(event|clinic|tournament)|set up.*event/.test(value))
    return {
      toolName: "events.create",
      scope: "sessions:write",
      title: "Create event",
    };
  return undefined;
}

function matchingEvents(
  message: string,
  snapshot: ContextSnapshot,
): readonly EventSummary[] {
  const value = message.toLowerCase();
  const pageId = snapshot.localContext.pathname.match(
    /\/events\/([0-9a-f-]{36})(?:\/|$)/i,
  )?.[1];
  const candidates = snapshot.events.filter(
    (event) => event.lifecycleStatus !== "cancelled",
  );
  if (pageId) return candidates.filter((event) => event.id === pageId);
  const named = candidates.filter((event) =>
    value.includes(event.title.toLowerCase()),
  );
  if (named.length > 0) return named;
  if (/underperform/.test(value)) return snapshot.underperforming;
  if (/all|every/.test(value)) return candidates.slice(0, 25);
  if (/next|upcoming/.test(value)) return candidates.slice(0, 1);
  return candidates.length === 1 ? candidates : [];
}

function matchingBookings(
  message: string,
  snapshot: ContextSnapshot,
): readonly BookingSummary[] {
  const value = message.toLowerCase();
  const candidates = snapshot.bookings.filter(
    (booking) => booking.canCancel !== false,
  );
  const named = candidates.filter(
    (booking) =>
      value.includes(booking.title.toLowerCase()) ||
      value.includes(booking.id.toLowerCase()),
  );
  if (named.length > 0) return named;
  if (/all|every/.test(value)) return candidates.slice(0, 25);
  if (/next|upcoming/.test(value)) return candidates.slice(0, 1);
  return candidates.length === 1 ? candidates : [];
}

function proposalTargets(
  intent: NonNullable<ReturnType<typeof classifyDunaAiAction>>,
  message: string,
  snapshot: ContextSnapshot,
): { ids: readonly string[]; changes: readonly string[] } | undefined {
  if (intent.toolName === "bookings.cancel") {
    const targets = matchingBookings(message, snapshot);
    return targets.length > 0
      ? {
          ids: targets.map(({ id }) => id),
          changes: targets.map(
            (item) =>
              `Cancel ${item.title} on ${new Date(item.startsAt).toLocaleString("en-US")}`,
          ),
        }
      : undefined;
  }
  if (intent.toolName === "events.cancel") {
    const targets = matchingEvents(message, snapshot);
    return targets.length > 0
      ? {
          ids: targets.map(({ id }) => id),
          changes: targets.flatMap((item) => [
            `Cancel ${item.title} on ${new Date(item.startsAt).toLocaleString("en-US")} (${item.capacity - item.spotsRemaining} registered)`,
            `Notify active registrants that ${item.title} was cancelled`,
          ]),
        }
      : undefined;
  }
  return {
    ids: [],
    changes: [`Prepare: ${intent.title}`, `Request: ${message}`],
  };
}

function proposalCard(
  draft: AgentDraft,
  title: string,
  changes: readonly string[],
): DunaAiApprovalCard {
  return {
    kind: "approval",
    title:
      draft.riskTier === "confirm-always"
        ? `Approve: ${title}`
        : `Review: ${title}`,
    detail:
      draft.riskTier === "confirm-always"
        ? "Nothing has changed yet. Check every target below, then approve this exact change set."
        : "Approve this plan to carry its details into Duna’s governed workflow.",
    changes,
    draft: {
      id: draft.id,
      toolName: draft.toolName,
      riskTier: draft.riskTier,
      proposedDiff: draft.proposedDiff,
      expiresAt: draft.expiresAt,
      confirmationNonce: draft.confirmationNonce,
    },
  };
}

function suggestionsFor(
  snapshot: ContextSnapshot,
  surface: DunaAiSurface,
): string[] {
  const suggestions: string[] = [];
  if (snapshot.conflicts.length > 0)
    suggestions.push("Show me the schedule conflicts and help resolve them");
  if (
    snapshot.weatherSignals.some(
      (item) =>
        (item.precipitationProbability ?? 0) >= 40 ||
        (item.windGustKph ?? 0) >= 35,
    )
  )
    suggestions.push("Which upcoming events have weather risk?");
  if (surface === "hq" && snapshot.underperforming.length > 0)
    suggestions.push("Show me what is under-performing and what to do next");
  if (surface === "hq")
    suggestions.push(
      "How is the business performing today?",
      "Help me plan next week around coaches and courts",
    );
  else
    suggestions.push(
      "Find events that fit my upcoming schedule",
      "What should I know before my next booking?",
    );
  return [...new Set(suggestions)].slice(0, 4);
}

export async function getDunaAiSuggestions(input: {
  actor: ApiActor;
  surface: DunaAiSurface;
  page?: string;
  context?: DunaAiClientContext;
  now: Date;
}): Promise<DunaAiResponse> {
  const snapshot = await buildContextSnapshot({
    ...input,
    message: "attention schedule weather performance",
  });
  const cards = contextCards(
    snapshot,
    "attention schedule weather performance",
  ).slice(0, 5);
  return {
    reply:
      cards.length > 0
        ? "I checked this page against your upcoming schedule and live Duna context. Here’s what is most relevant right now."
        : `I’m ready on this page, with ${snapshot.pageIntent} in mind.`,
    cards,
    suggestions: suggestionsFor(snapshot, input.surface),
    toolsUsed: [
      input.surface === "hq"
        ? "operator.dashboard.read"
        : "player.dashboard.read",
    ],
    reasoningEffort: "high",
    providerAvailable: Boolean(dunaAiRuntime()),
    researchUsed: false,
  };
}

export async function runDunaAiAgent(input: {
  actor: ApiActor;
  message: string;
  surface: DunaAiSurface;
  page?: string;
  context?: DunaAiClientContext;
  history?: readonly { role: "assistant" | "user"; body: string }[];
  researchMode?: "off" | "on";
  requestId: string;
  now: Date;
}): Promise<DunaAiResponse> {
  const rateLimit = await consumeRateLimit({
    key: `duna-ai:${input.actor.personId}`,
    capacity: 30,
    refillPerMinute: 15,
    now: input.now,
  });
  if (!rateLimit.allowed)
    throw new Error(
      `Duna AI is taking a short pause. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
    );
  const toolsUsed = new Set<string>();
  const snapshot = await buildContextSnapshot(input);
  toolsUsed.add(
    input.surface === "hq"
      ? "operator.dashboard.read"
      : "player.dashboard.read",
  );
  if (snapshot.discovery.length > 0) toolsUsed.add("events.search");
  const cards = [
    ...contextCards(snapshot, input.message),
    ...defaultLinkCards(input.surface, input.message),
  ];
  const intent = classifyDunaAiAction(input.message);
  if (intent) {
    if (!hasScope(input.actor, intent.scope)) {
      cards.unshift({
        kind: "notice",
        title: "Permission required",
        detail: `Your current Duna role cannot ${intent.title.toLowerCase()}. I can still prepare the details for someone who can.`,
        tone: "warning",
      });
    } else {
      const targets = proposalTargets(intent, input.message, snapshot);
      if (
        !targets ||
        (intent.toolName.endsWith(".cancel") && targets.ids.length === 0)
      ) {
        cards.unshift({
          kind: "notice",
          title: "Choose the exact target",
          detail:
            "I won’t guess which record you mean. Name it, say “next,” or open its Duna page and ask again.",
          tone: "warning",
        });
      } else {
        const draft = await proposeAgentAction({
          toolName: intent.toolName,
          toolInput: {
            request: input.message,
            surface: input.surface,
            page: snapshot.localContext.pathname,
            targetIds: targets.ids,
          },
          proposedDiff: {
            operation: intent.title,
            targetCount: targets.ids.length,
            changes: targets.changes,
            status: "awaiting-review",
          },
          actorPersonId: input.actor.personId,
          organizationId: input.actor.organizationId,
          conversationId: input.requestId,
          now: input.now,
        });
        toolsUsed.add("propose_governed_action");
        cards.unshift(proposalCard(draft, intent.title, targets.changes));
      }
    }
  }

  const runtime = dunaAiRuntime();
  const fallback = fallbackReply({
    surface: input.surface,
    message: input.message,
    snapshot,
  });
  if (!runtime)
    return {
      reply: fallback,
      cards: cards.slice(0, 10),
      suggestions: suggestionsFor(snapshot, input.surface),
      toolsUsed: [...toolsUsed],
      reasoningEffort: "high",
      providerAvailable: false,
      researchUsed: false,
    };

  const getPlatformContext = tool({
    name: "get_current_duna_context",
    description:
      "Read the already permission-scoped Duna context for the signed-in actor, current page, time, schedule, performance, weather, conflicts, and discovery results.",
    parameters: z.object({ focus: z.string().max(120).optional() }),
    execute: async () => {
      toolsUsed.add("get_current_duna_context");
      return JSON.stringify(snapshot);
    },
  });
  const getActionPolicy = tool({
    name: "get_action_policy",
    description:
      "Explain the permission and approval policy for a requested Duna action.",
    parameters: z.object({ action: z.string().max(120) }),
    execute: async ({ action }) => {
      toolsUsed.add("get_action_policy");
      return JSON.stringify({
        action,
        actorRoles: input.actor.roles,
        policy:
          "Reads execute within server-resolved permissions. Cancellations, money movement, outgoing communication, deletion, publishing, and pricing require a fresh approval of an exact change set. Never claim a proposal was applied.",
      });
    },
  });
  const researchUsed = input.researchMode === "on";
  const agent = new Agent({
    name: "Duna AI",
    model: resolveDunaAiCopilotModel(),
    modelSettings: {
      reasoning: { effort: "high" },
      text: { verbosity: "low" },
    },
    instructions: [
      "You are Duna AI, the vertical co-pilot for Duna HQ and Duna Player.",
      `It is ${input.now.toISOString()}. The actor is ${input.actor.displayName}; treat identity, role, age band, active organization, page, and local timezone as first-class context.`,
      "Use get_current_duna_context before making claims about Duna state. Never invent permissions, records, availability, pricing, weather, conflicts, performance, or action outcomes.",
      "Prioritize what matters on the current page and infer intent only from bounded route history and UI-label interaction signals. Do not treat client context as authorization.",
      "Structured cards are created by Duna separately. Refer to them naturally; do not restate every field.",
      "Never say a write happened unless Duna returns an applied action result. A proposal or approval is not execution.",
      "For consequential or bulk work, require the exact review card and fresh approval. Stay within the signed-in actor's server-resolved permissions.",
      researchUsed
        ? "Web research is enabled for this turn. Use it only for external/current facts that Duna data cannot answer, distinguish it from Duna account facts, and cite sources in the answer."
        : "Web research is off. Answer only from Duna context and stable general knowledge.",
      "Be concise, anticipatory, and useful. Call out time, weather, conflicts, or under-performance only when supported and relevant.",
    ].join("\n"),
    tools: [
      getPlatformContext,
      getActionPolicy,
      ...(researchUsed
        ? [
            webSearchTool({
              searchContextSize: "medium",
              externalWebAccess: true,
            }),
          ]
        : []),
    ],
  });
  const history = input.history
    ?.slice(-8)
    .map((item) => `${item.role === "user" ? "User" : "Duna AI"}: ${item.body}`)
    .join("\n");
  const prompt = [
    history ? `Recent conversation:\n${history}` : undefined,
    `Current request: ${input.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const result = await run(agent, prompt, {
      maxTurns: researchUsed ? 8 : 6,
      ...(runtime.modelProvider
        ? { modelProvider: runtime.modelProvider }
        : {}),
    });
    const reply =
      typeof result.finalOutput === "string" && result.finalOutput.trim()
        ? result.finalOutput.trim()
        : fallback;
    if (researchUsed) toolsUsed.add("web_search");
    return {
      reply,
      cards: cards.slice(0, 10),
      suggestions: suggestionsFor(snapshot, input.surface),
      toolsUsed: [...toolsUsed],
      model: resolveDunaAiCopilotModel(),
      reasoningEffort: "high",
      providerAvailable: true,
      researchUsed,
    };
  } catch {
    return {
      reply: fallback,
      cards: cards.slice(0, 10),
      suggestions: suggestionsFor(snapshot, input.surface),
      toolsUsed: [...toolsUsed],
      model: resolveDunaAiCopilotModel(),
      reasoningEffort: "high",
      providerAvailable: false,
      researchUsed: false,
    };
  }
}

export async function confirmDunaAiAction(input: {
  actor: ApiActor;
  draftId: string;
  confirmationNonce?: string;
  requestId: string;
  ipAddress?: string;
  now: Date;
}): Promise<DunaAiActionOutcome> {
  const pending = await getAgentDraft(input.draftId);
  if (!pending) throw new Error("Draft not found");
  const requiredScope: Partial<Record<RegisteredToolName, string>> = {
    "bookings.cancel": "bookings:write",
    "events.cancel": "sessions:write",
    "events.create": "sessions:write",
    "staff.availability.set": "sessions:write",
    "payments.refund": "payments:write",
    "messages.send": "messages:propose",
    "prices.change": "sessions:write",
    "accounts.delete": "profile:write",
  };
  const scope = requiredScope[pending.toolName];
  if (scope && !hasScope(input.actor, scope)) {
    throw new Error(
      "Your current Duna role no longer has permission to approve this action.",
    );
  }
  const draft = await confirmAgentAction({
    draftId: input.draftId,
    actorPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    confirmationNonce: input.confirmationNonce,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  const targetIds = Array.isArray(draft.input.targetIds)
    ? draft.input.targetIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  if (
    draft.toolName !== "bookings.cancel" &&
    draft.toolName !== "events.cancel"
  ) {
    const href =
      draft.toolName === "events.create"
        ? "/events/create"
        : draft.toolName === "staff.availability.set"
          ? "/calendar"
          : undefined;
    return {
      draft,
      status: "approved-plan",
      reply:
        "The exact plan is approved and remains attached to Duna’s audit trail. Open the guided workspace to finish any required fields and apply it.",
      changes: Object.values(draft.proposedDiff).flatMap((value) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [],
      ),
      href,
    };
  }
  const results = await Promise.allSettled(
    targetIds.map(async (targetId) => {
      if (draft.toolName === "bookings.cancel") {
        const result = await cancelPlayerBooking({
          actor: input.actor,
          bookingId: targetId,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
        });
        return `Cancelled ${result.id}`;
      }
      const result = await cancelCalendarSession({
        actor: input.actor,
        sessionId: targetId,
        reason: `Approved through Duna AI: ${String(draft.input.request ?? "User requested cancellation")}`,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      return `Cancelled ${result.id}`;
    }),
  );
  const changes = results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : `Could not change ${targetIds[index] ?? "target"}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
  );
  const applied = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  return {
    draft,
    status: applied === targetIds.length && applied > 0 ? "applied" : "failed",
    reply:
      applied === targetIds.length && applied > 0
        ? `${applied} approved ${applied === 1 ? "change is" : "changes are"} now applied. The results are listed below.`
        : `${applied} of ${targetIds.length} approved changes applied. Review the result list; Duna did not hide partial failures.`,
    changes,
  };
}

import { z } from "zod";

const firecrawlSearchUrl = "https://api.firecrawl.dev/v2/search";
const gatewayResponsesUrl = "https://ai-gateway.vercel.sh/v1/responses";
const defaultResearchModel = "openai/gpt-5.6-luna";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const claimSchema = z.object({
  field: z.enum([
    "overview",
    "venueName",
    "venueAddress",
    "startsOn",
    "endsOn",
    "ticketUrl",
    "timezone",
    "broadcast",
  ]),
  value: z.string().trim().min(1).max(1_500),
  confidence: z.number().int().min(0).max(100),
  evidenceUrls: z.array(z.url()).min(1).max(6),
});

const watchSchema = z.object({
  kind: z.enum(["vbtv", "youtube", "live-tv"]),
  label: z.string().trim().min(1).max(100),
  url: z.string().trim().max(500),
  channelName: z.string().trim().max(100),
  confidence: z.number().int().min(0).max(100),
  evidenceUrls: z.array(z.url()).min(1).max(6),
});

const gatewayResultSchema = z.object({
  overview: z.string().trim().max(1_500),
  venueName: z.string().trim().max(180),
  venueAddress: z.string().trim().max(320),
  startsOn: z.string().trim().max(10),
  endsOn: z.string().trim().max(10),
  ticketUrl: z.string().trim().max(500),
  watchOptions: z.array(watchSchema).max(12),
  claims: z.array(claimSchema).max(24),
});

const gatewayJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string", maxLength: 1_500 },
    venueName: { type: "string", maxLength: 180 },
    venueAddress: { type: "string", maxLength: 320 },
    startsOn: { type: "string", maxLength: 10 },
    endsOn: { type: "string", maxLength: 10 },
    ticketUrl: { type: "string", maxLength: 500 },
    watchOptions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["vbtv", "youtube", "live-tv"] },
          label: { type: "string", minLength: 1, maxLength: 100 },
          url: { type: "string", maxLength: 500 },
          channelName: { type: "string", maxLength: 100 },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          evidenceUrls: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", format: "uri" },
          },
        },
        required: [
          "kind",
          "label",
          "url",
          "channelName",
          "confidence",
          "evidenceUrls",
        ],
      },
    },
    claims: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: {
            type: "string",
            enum: [
              "overview",
              "venueName",
              "venueAddress",
              "startsOn",
              "endsOn",
              "ticketUrl",
              "timezone",
              "broadcast",
            ],
          },
          value: { type: "string", minLength: 1, maxLength: 1_500 },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          evidenceUrls: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", format: "uri" },
          },
        },
        required: ["field", "value", "confidence", "evidenceUrls"],
      },
    },
  },
  required: [
    "overview",
    "venueName",
    "venueAddress",
    "startsOn",
    "endsOn",
    "ticketUrl",
    "watchOptions",
    "claims",
  ],
} as const;

export interface ProfessionalResearchEvidence {
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  readonly markdown?: string;
}

export interface ProfessionalResearchPlace {
  readonly googlePlaceId?: string;
  readonly googleMapsUri?: string;
  readonly formattedAddress?: string;
  readonly addressLine1?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly timezone?: string;
}

export interface ProfessionalEventResearchProposal {
  readonly id: string;
  readonly query: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly status: "review" | "applied";
  readonly overview?: string;
  readonly venueName?: string;
  readonly venueAddress?: string;
  readonly venue?: ProfessionalResearchPlace;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly ticketUrl?: string;
  readonly watchOptions: readonly {
    readonly kind: "vbtv" | "youtube" | "live-tv";
    readonly label: string;
    readonly url?: string;
    readonly channelName?: string;
    readonly confidence: number;
    readonly evidenceUrls: readonly string[];
  }[];
  readonly claims: readonly z.infer<typeof claimSchema>[];
  readonly evidence: readonly Omit<ProfessionalResearchEvidence, "markdown">[];
  readonly appliedAt?: string;
}

const storedProposalSchema = z.object({
  id: z.uuid(),
  query: z.string().trim().min(1).max(1_000),
  generatedAt: z.iso.datetime(),
  model: z.string().trim().min(1).max(200),
  status: z.enum(["review", "applied"]),
  overview: z.string().trim().max(1_500).optional(),
  venueName: z.string().trim().max(180).optional(),
  venueAddress: z.string().trim().max(320).optional(),
  venue: z
    .object({
      googlePlaceId: z.string().trim().max(256).optional(),
      googleMapsUri: z.url().optional(),
      formattedAddress: z.string().trim().max(320).optional(),
      addressLine1: z.string().trim().max(180).optional(),
      locality: z.string().trim().max(120).optional(),
      administrativeArea: z.string().trim().max(120).optional(),
      postalCode: z.string().trim().max(32).optional(),
      countryCode: z.string().trim().length(2).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      timezone: z.string().trim().max(80).optional(),
    })
    .optional(),
  startsOn: z.string().regex(datePattern).optional(),
  endsOn: z.string().regex(datePattern).optional(),
  ticketUrl: z.url().optional(),
  watchOptions: z.array(
    z.object({
      kind: z.enum(["vbtv", "youtube", "live-tv"]),
      label: z.string().trim().min(1).max(100),
      url: z.url().optional(),
      channelName: z.string().trim().max(100).optional(),
      confidence: z.number().int().min(0).max(100),
      evidenceUrls: z.array(z.url()).min(1).max(6),
    }),
  ),
  claims: z.array(claimSchema).max(24),
  evidence: z.array(
    z.object({
      title: z.string().trim().min(1).max(240),
      url: z.url(),
      description: z.string().trim().max(1_000).optional(),
    }),
  ),
  appliedAt: z.iso.datetime().optional(),
});

export function parseProfessionalEventResearchProposal(
  value: unknown,
): ProfessionalEventResearchProposal | undefined {
  const parsed = storedProposalSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function credential(name: "firecrawl" | "gateway"): string | undefined {
  return name === "firecrawl"
    ? process.env.FIRECRAWL_API_KEY?.trim() ||
        process.env.FIRECRAWL_API?.trim() ||
        undefined
    : process.env.AI_GATEWAY_API_KEY?.trim() ||
        process.env.VERCEL_OIDC_TOKEN?.trim() ||
        undefined;
}

function outputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    readonly output_text?: unknown;
    readonly output?: readonly {
      readonly content?: readonly {
        readonly type?: unknown;
        readonly text?: unknown;
      }[];
    }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

function validHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeEvidence(
  value: unknown,
): readonly ProfessionalResearchEvidence[] {
  const payload = value as {
    readonly data?: readonly unknown[] | { readonly web?: readonly unknown[] };
  };
  const data = payload.data;
  const webRows =
    data && !Array.isArray(data)
      ? (data as { readonly web?: readonly unknown[] }).web
      : undefined;
  const rows: readonly unknown[] = Array.isArray(data) ? data : (webRows ?? []);
  return rows.flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const url = typeof row.url === "string" ? validHttpUrl(row.url) : undefined;
    if (!url) return [];
    return [
      {
        title:
          typeof row.title === "string" && row.title.trim()
            ? row.title.trim().slice(0, 240)
            : new URL(url).hostname,
        url,
        ...(typeof row.description === "string" && row.description.trim()
          ? { description: row.description.trim().slice(0, 1_000) }
          : {}),
        ...(typeof row.markdown === "string" && row.markdown.trim()
          ? { markdown: row.markdown.trim().slice(0, 12_000) }
          : {}),
      },
    ];
  });
}

export function filterResearchToEvidence(
  result: z.infer<typeof gatewayResultSchema>,
  evidenceUrls: ReadonlySet<string>,
) {
  const evidenceFor = (urls: readonly string[]) =>
    urls.filter((url) => evidenceUrls.has(url));
  const claims = result.claims.flatMap((claim) => {
    const evidence = evidenceFor(claim.evidenceUrls);
    return evidence.length > 0 ? [{ ...claim, evidenceUrls: evidence }] : [];
  });
  const claimed = (
    field: z.infer<typeof claimSchema>["field"],
    value: string,
  ) =>
    Boolean(
      value &&
      claims.some(
        (claim) => claim.field === field && claim.value.trim() === value.trim(),
      ),
    );
  const watchOptions = result.watchOptions.flatMap((option) => {
    const evidence = evidenceFor(option.evidenceUrls);
    if (evidence.length === 0) return [];
    const url = validHttpUrl(option.url);
    return [
      {
        ...option,
        ...(url && evidenceUrls.has(url) ? { url } : { url: "" }),
        evidenceUrls: evidence,
      },
    ];
  });
  return {
    overview: claimed("overview", result.overview) ? result.overview : "",
    venueName: claimed("venueName", result.venueName) ? result.venueName : "",
    venueAddress: claimed("venueAddress", result.venueAddress)
      ? result.venueAddress
      : "",
    startsOn:
      claimed("startsOn", result.startsOn) && datePattern.test(result.startsOn)
        ? result.startsOn
        : "",
    endsOn:
      claimed("endsOn", result.endsOn) && datePattern.test(result.endsOn)
        ? result.endsOn
        : "",
    ticketUrl:
      claimed("ticketUrl", result.ticketUrl) &&
      evidenceUrls.has(validHttpUrl(result.ticketUrl) ?? "")
        ? (validHttpUrl(result.ticketUrl) ?? "")
        : "",
    watchOptions,
    claims,
  };
}

async function searchEvidence(
  query: string,
  firecrawlCredential: string,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(firecrawlSearchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlCredential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 6,
      sources: ["web"],
      timeout: 75_000,
      ignoreInvalidURLs: true,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: 86_400_000,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl research returned HTTP ${response.status}.`);
  }
  const evidence = normalizeEvidence(await response.json());
  if (evidence.length === 0) {
    throw new Error("Firecrawl research returned no usable sources.");
  }
  return evidence;
}

async function synthesize(
  input: {
    readonly name: string;
    readonly year: number;
    readonly currentLocation?: string;
    readonly currentStartsOn?: string;
    readonly currentEndsOn?: string;
    readonly sourceUrl?: string;
  },
  evidence: readonly ProfessionalResearchEvidence[],
  gatewayCredential: string,
  fetchImpl: typeof fetch,
) {
  const model =
    process.env.AI_GATEWAY_EVENT_RESEARCH_MODEL?.trim() || defaultResearchModel;
  const response = await fetchImpl(gatewayResponsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayCredential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 8_000,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `Research one specific professional beach-volleyball event in ${input.year}. Use only the supplied web evidence. Prefer the official tour, venue, broadcaster, and reputable ticketing pages. Never reuse a prior year's venue or schedule. Every non-empty field and every broadcast must have one or more exact evidence URLs from the supplied set. Return an empty string or empty array when evidence conflicts or is insufficient. Keep the overview factual and under 120 words. Dates use YYYY-MM-DD. Do not infer a timezone; Duna resolves it from the verified venue coordinates.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                event: input,
                evidence: evidence.map((item) => ({
                  title: item.title,
                  url: item.url,
                  description: item.description,
                  markdown: item.markdown,
                })),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "professional_event_research",
          strict: true,
          schema: gatewayJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Vercel AI Gateway returned HTTP ${response.status}.`);
  }
  const text = outputText(await response.json());
  if (!text)
    throw new Error("Vercel AI Gateway returned no research proposal.");
  return { result: gatewayResultSchema.parse(JSON.parse(text)), model };
}

interface GooglePlaceDetails {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly formattedAddress?: string;
  readonly googleMapsUri?: string;
  readonly location?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly addressComponents?: readonly {
    readonly longText?: string;
    readonly shortText?: string;
    readonly types?: readonly string[];
  }[];
}

async function resolvePlace(
  query: string,
  fetchImpl: typeof fetch,
): Promise<ProfessionalResearchPlace | undefined> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key || !query.trim()) return undefined;
  const autocomplete = await fetchImpl(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId",
      },
      body: JSON.stringify({ input: query, includeQueryPredictions: false }),
    },
  );
  if (!autocomplete.ok) return undefined;
  const suggestions = (await autocomplete.json()) as {
    readonly suggestions?: readonly {
      readonly placePrediction?: { readonly placeId?: string };
    }[];
  };
  const placeId = suggestions.suggestions?.[0]?.placePrediction?.placeId;
  if (!placeId) return undefined;
  const response = await fetchImpl(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,googleMapsUri,addressComponents",
      },
    },
  );
  if (!response.ok) return undefined;
  const place = (await response.json()) as GooglePlaceDetails;
  const component = (type: string, short = false) => {
    const value = place.addressComponents?.find((entry) =>
      entry.types?.includes(type),
    );
    return short ? value?.shortText : value?.longText;
  };
  const street = [
    component("street_number"),
    component("route", true) ?? component("route"),
  ]
    .filter(Boolean)
    .join(" ");
  let timezone: string | undefined;
  if (
    place.location?.latitude !== undefined &&
    place.location.longitude !== undefined
  ) {
    const parameters = new URLSearchParams({
      location: `${place.location.latitude},${place.location.longitude}`,
      timestamp: String(Math.floor(Date.now() / 1_000)),
      key,
    });
    const timezoneResponse = await fetchImpl(
      `https://maps.googleapis.com/maps/api/timezone/json?${parameters.toString()}`,
    );
    if (timezoneResponse.ok) {
      const payload = (await timezoneResponse.json()) as {
        readonly status?: string;
        readonly timeZoneId?: string;
      };
      if (payload.status === "OK" && payload.timeZoneId) {
        timezone = payload.timeZoneId;
      }
    }
  }
  return {
    googlePlaceId: place.id ?? placeId,
    googleMapsUri: place.googleMapsUri,
    formattedAddress: place.formattedAddress,
    addressLine1: street || place.formattedAddress,
    locality:
      component("locality") ??
      component("postal_town") ??
      component("sublocality_level_1") ??
      component("administrative_area_level_2"),
    administrativeArea: component("administrative_area_level_1", true),
    postalCode: component("postal_code") ?? component("postal_code_prefix"),
    countryCode: component("country", true),
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    timezone,
  };
}

export async function createProfessionalEventResearchProposal(
  input: {
    readonly name: string;
    readonly year: number;
    readonly currentLocation?: string;
    readonly currentStartsOn?: string;
    readonly currentEndsOn?: string;
    readonly sourceUrl?: string;
  },
  options: { readonly fetchImpl?: typeof fetch; readonly now?: Date } = {},
): Promise<ProfessionalEventResearchProposal> {
  const firecrawlCredential = credential("firecrawl");
  const gatewayCredential = credential("gateway");
  if (!firecrawlCredential) {
    throw new Error("Firecrawl is not configured for event research.");
  }
  if (!gatewayCredential) {
    throw new Error("Vercel AI Gateway is not configured for event research.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const query =
    `"${input.name}" ${input.year} beach volleyball venue tickets schedule broadcast ${input.currentLocation ?? ""}`.trim();
  const evidence = await searchEvidence(query, firecrawlCredential, fetchImpl);
  const { result, model } = await synthesize(
    input,
    evidence,
    gatewayCredential,
    fetchImpl,
  );
  const filtered = filterResearchToEvidence(
    result,
    new Set(evidence.map((item) => item.url)),
  );
  const place = await resolvePlace(
    [filtered.venueName, filtered.venueAddress].filter(Boolean).join(", "),
    fetchImpl,
  );
  const now = options.now ?? new Date();
  return {
    id: crypto.randomUUID(),
    query,
    generatedAt: now.toISOString(),
    model,
    status: "review",
    ...(filtered.overview ? { overview: filtered.overview } : {}),
    ...(filtered.venueName ? { venueName: filtered.venueName } : {}),
    ...(filtered.venueAddress ? { venueAddress: filtered.venueAddress } : {}),
    ...(place ? { venue: place } : {}),
    ...(filtered.startsOn ? { startsOn: filtered.startsOn } : {}),
    ...(filtered.endsOn ? { endsOn: filtered.endsOn } : {}),
    ...(filtered.ticketUrl ? { ticketUrl: filtered.ticketUrl } : {}),
    watchOptions: filtered.watchOptions.map((option) => ({
      kind: option.kind,
      label: option.label,
      ...(option.url ? { url: option.url } : {}),
      ...(option.channelName ? { channelName: option.channelName } : {}),
      confidence: option.confidence,
      evidenceUrls: option.evidenceUrls,
    })),
    claims: filtered.claims,
    evidence: evidence.map((source) => ({
      title: source.title,
      url: source.url,
      ...(source.description ? { description: source.description } : {}),
    })),
  };
}

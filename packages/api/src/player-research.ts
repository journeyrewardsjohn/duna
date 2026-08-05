import { z } from "zod";

const firecrawlSearchUrl = "https://api.firecrawl.dev/v2/search";
const gatewayResponsesUrl = "https://ai-gateway.vercel.sh/v1/responses";
const defaultResearchModel = "openai/gpt-5.6-luna";

const claimFieldSchema = z.enum([
  "shortBio",
  "biography",
  "countryCode",
  "hometown",
  "collegeName",
  "playingRole",
  "heightMillimeters",
  "events",
  "wins",
  "podiums",
  "gold",
  "silver",
  "bronze",
  "earningsMinor",
  "earningsCurrency",
  "website",
  "instagram",
  "youtube",
]);

const claimSchema = z.object({
  field: claimFieldSchema,
  value: z.string().trim().min(1).max(2_500),
  numericValue: z.number().nullable(),
  confidence: z.number().int().min(0).max(100),
  evidenceUrls: z.array(z.url()).min(1).max(6),
});

const newsSchema = z.object({
  title: z.string().trim().min(1).max(240),
  url: z.url(),
  publisher: z.string().trim().max(120),
  publishedAt: z.string().trim().max(32),
  evidenceUrls: z.array(z.url()).min(1).max(3),
});

const gatewayResultSchema = z.object({
  claims: z.array(claimSchema).max(40),
  news: z.array(newsSchema).max(8),
});

const gatewayJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: {
            type: "string",
            enum: claimFieldSchema.options,
          },
          value: { type: "string", minLength: 1, maxLength: 2_500 },
          numericValue: {
            anyOf: [{ type: "number" }, { type: "null" }],
          },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          evidenceUrls: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", format: "uri" },
          },
        },
        required: [
          "field",
          "value",
          "numericValue",
          "confidence",
          "evidenceUrls",
        ],
      },
    },
    news: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 240 },
          url: { type: "string", format: "uri" },
          publisher: { type: "string", maxLength: 120 },
          publishedAt: { type: "string", maxLength: 32 },
          evidenceUrls: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string", format: "uri" },
          },
        },
        required: ["title", "url", "publisher", "publishedAt", "evidenceUrls"],
      },
    },
  },
  required: ["claims", "news"],
} as const;

export interface PlayerResearchEvidence {
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  readonly markdown?: string;
}

export interface PlayerSourceProfileDiscovery {
  readonly source: "bvbinfo" | "volleyball-life";
  readonly externalId: string;
  readonly url: string;
  readonly confidence: number;
}

export interface PlayerResearchProposal extends Record<string, unknown> {
  readonly id: string;
  readonly query: string;
  readonly generatedAt: string;
  readonly model: string;
  readonly status: "review" | "applied";
  readonly shortBio?: string;
  readonly biography?: string;
  readonly countryCode?: string;
  readonly hometown?: string;
  readonly collegeName?: string;
  readonly playingRole?: string;
  readonly heightMillimeters?: number;
  readonly careerStats: {
    readonly events?: number;
    readonly wins?: number;
    readonly podiums?: number;
    readonly gold?: number;
    readonly silver?: number;
    readonly bronze?: number;
    readonly earningsMinor?: number;
    readonly earningsCurrency?: string;
  };
  readonly links: readonly {
    readonly label: string;
    readonly url: string;
    readonly kind: "website" | "instagram" | "youtube";
  }[];
  readonly news: readonly {
    readonly title: string;
    readonly url: string;
    readonly publisher?: string;
    readonly publishedAt?: string;
  }[];
  readonly claims: readonly z.infer<typeof claimSchema>[];
  readonly evidence: readonly Omit<PlayerResearchEvidence, "markdown">[];
  readonly sourceProfiles: readonly PlayerSourceProfileDiscovery[];
  readonly appliedAt?: string;
}

const storedProposalSchema = z.object({
  id: z.uuid(),
  query: z.string().trim().min(1).max(1_000),
  generatedAt: z.iso.datetime(),
  model: z.string().trim().min(1).max(200),
  status: z.enum(["review", "applied"]),
  shortBio: z.string().trim().max(700).optional(),
  biography: z.string().trim().max(2_500).optional(),
  countryCode: z.string().trim().min(2).max(3).optional(),
  hometown: z.string().trim().max(180).optional(),
  collegeName: z.string().trim().max(180).optional(),
  playingRole: z.string().trim().max(80).optional(),
  heightMillimeters: z.number().int().min(600).max(2_600).optional(),
  careerStats: z.object({
    events: z.number().int().nonnegative().optional(),
    wins: z.number().int().nonnegative().optional(),
    podiums: z.number().int().nonnegative().optional(),
    gold: z.number().int().nonnegative().optional(),
    silver: z.number().int().nonnegative().optional(),
    bronze: z.number().int().nonnegative().optional(),
    earningsMinor: z.number().int().nonnegative().optional(),
    earningsCurrency: z.string().trim().min(3).max(3).optional(),
  }),
  links: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      url: z.url(),
      kind: z.enum(["website", "instagram", "youtube"]),
    }),
  ),
  news: z.array(
    z.object({
      title: z.string().trim().min(1).max(240),
      url: z.url(),
      publisher: z.string().trim().max(120).optional(),
      publishedAt: z.string().trim().max(32).optional(),
    }),
  ),
  claims: z.array(claimSchema).max(40),
  evidence: z.array(
    z.object({
      title: z.string().trim().min(1).max(240),
      url: z.url(),
      description: z.string().trim().max(1_000).optional(),
    }),
  ),
  sourceProfiles: z
    .array(
      z.object({
        source: z.enum(["bvbinfo", "volleyball-life"]),
        externalId: z.string().trim().regex(/^\d+$/),
        url: z.url(),
        confidence: z.number().int().min(0).max(100),
      }),
    )
    .default([]),
  appliedAt: z.iso.datetime().optional(),
});

export function parsePlayerResearchProposal(
  value: unknown,
): PlayerResearchProposal | undefined {
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

function validHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return undefined;
    if (/(^|\.)sandrating\.com$/i.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizedResearchName(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function discoverPlayerSourceProfiles(
  displayName: string,
  evidence: readonly PlayerResearchEvidence[],
): readonly PlayerSourceProfileDiscovery[] {
  const targetName = normalizedResearchName(displayName);
  if (targetName.split(" ").length < 2) return [];
  const discoveries = new Map<string, PlayerSourceProfileDiscovery>();
  for (const item of evidence) {
    const evidenceText = normalizedResearchName(
      [item.title, item.description, item.markdown].filter(Boolean).join(" "),
    );
    if (!evidenceText.includes(targetName)) continue;
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    const hostname = url.hostname.toLowerCase();
    if (/(^|\.)bvbinfo\.com$/.test(hostname)) {
      const externalId =
        url.searchParams.get("ID") ?? url.searchParams.get("id");
      if (externalId && /^\d+$/.test(externalId)) {
        discoveries.set(`bvbinfo:${externalId}`, {
          source: "bvbinfo",
          externalId,
          url: `http://www.bvbinfo.com/player.asp?ID=${externalId}`,
          confidence: 98,
        });
      }
      continue;
    }
    if (/(^|\.)volleyballlife\.com$/.test(hostname)) {
      const externalId = url.pathname.match(
        /\/(?:player|playerprofile)\/(\d+)/i,
      )?.[1];
      if (externalId) {
        discoveries.set(`volleyball-life:${externalId}`, {
          source: "volleyball-life",
          externalId,
          url: `https://volleyballlife.com/player/${externalId}`,
          confidence: 98,
        });
      }
    }
  }
  return [...discoveries.values()];
}

function normalizeEvidence(value: unknown): readonly PlayerResearchEvidence[] {
  const payload = value as {
    readonly data?: readonly unknown[] | { readonly web?: readonly unknown[] };
  };
  const data = payload.data;
  let rows: readonly unknown[] = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === "object" && "web" in data) {
    const web = data.web;
    rows = Array.isArray(web) ? web : [];
  }
  return rows.flatMap((candidate) => {
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
          ? { markdown: row.markdown.trim().slice(0, 14_000) }
          : {}),
      },
    ];
  });
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

async function gatewayFailure(response: Response): Promise<Error> {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    // The status code remains useful when the provider omits a readable body.
  }
  if (/customer_verification_required/i.test(detail)) {
    return new Error(
      "Vercel AI Gateway is blocking Duna research until the Vercel team completes customer verification or billing setup. No player data was changed; complete verification in Vercel, then retry.",
    );
  }
  return new Error(`Vercel AI Gateway returned HTTP ${response.status}.`);
}

async function searchEvidence(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(firecrawlSearchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 8,
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
    throw new Error(
      `Firecrawl player research returned HTTP ${response.status}.`,
    );
  }
  const evidence = normalizeEvidence(await response.json());
  if (evidence.length === 0) {
    throw new Error("Player research returned no usable evidence.");
  }
  return evidence;
}

async function synthesize(
  input: {
    readonly displayName: string;
    readonly countryCode?: string;
    readonly worldRank?: number;
    readonly genderCategory?: string;
  },
  evidence: readonly PlayerResearchEvidence[],
  apiKey: string,
  fetchImpl: typeof fetch,
) {
  const model =
    process.env.AI_GATEWAY_PLAYER_RESEARCH_MODEL?.trim() ||
    defaultResearchModel;
  const response = await fetchImpl(gatewayResponsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 10_000,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `Research one beach-volleyball player using only the supplied evidence. Every claim needs one or more exact evidence URLs from the supplied set. Return no claim when sources conflict or do not support it. Biography must be factual, current, under 220 words, and contain no quotes, injuries, relationship details, or speculation. shortBio is one sentence. countryCode is ISO alpha-2 or alpha-3. playingRole is only blocker, defender, or all-around when explicitly sourced. Money uses integer minor units with a three-letter currency. Distinguish event wins from match wins. News must be a genuine article about the player and use its own URL. Do not cite or mention SandRating; Duna calculates Sand Rating from its connected match archive.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                player: input,
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
          name: "duna_player_research",
          strict: true,
          schema: gatewayJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw await gatewayFailure(response);
  }
  const text = outputText(await response.json());
  if (!text) throw new Error("Vercel AI Gateway returned no player proposal.");
  return { result: gatewayResultSchema.parse(JSON.parse(text)), model };
}

function integerClaim(
  claims: readonly z.infer<typeof claimSchema>[],
  field: z.infer<typeof claimFieldSchema>,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const value = claims.find((claim) => claim.field === field)?.numericValue;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, Math.round(value)))
    : undefined;
}

export async function createPlayerResearchProposal(
  input: {
    readonly displayName: string;
    readonly countryCode?: string;
    readonly worldRank?: number;
    readonly genderCategory?: string;
  },
  options: { readonly fetchImpl?: typeof fetch; readonly now?: Date } = {},
): Promise<PlayerResearchProposal> {
  const firecrawl = credential("firecrawl");
  const gateway = credential("gateway");
  if (!firecrawl)
    throw new Error("Firecrawl is not configured for player research.");
  if (!gateway) {
    throw new Error("Vercel AI Gateway is not configured for player research.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = [
    `"${input.displayName}" beach volleyball`,
    input.countryCode,
    "official bio hometown college height earnings medals interview BVBInfo VolleyballLife profile match history",
  ]
    .filter(Boolean)
    .join(" ");
  const evidence = await searchEvidence(query, firecrawl, fetchImpl);
  const { result, model } = await synthesize(
    input,
    evidence,
    gateway,
    fetchImpl,
  );
  const evidenceUrls = new Set(evidence.map((item) => item.url));
  const claims = result.claims.flatMap((claim) => {
    const urls = claim.evidenceUrls.filter((url) => evidenceUrls.has(url));
    return urls.length > 0 ? [{ ...claim, evidenceUrls: urls }] : [];
  });
  const value = (field: z.infer<typeof claimFieldSchema>) =>
    claims.find((claim) => claim.field === field)?.value.trim();
  const validLink = (
    field: "website" | "instagram" | "youtube",
    label: string,
  ) => {
    const url = validHttpUrl(value(field) ?? "");
    return url && evidenceUrls.has(url)
      ? [{ label, url, kind: field } as const]
      : [];
  };
  const news = result.news.flatMap((item) => {
    const url = validHttpUrl(item.url);
    const supported = item.evidenceUrls.some((candidate) =>
      evidenceUrls.has(candidate),
    );
    return url && evidenceUrls.has(url) && supported
      ? [
          {
            title: item.title,
            url,
            ...(item.publisher ? { publisher: item.publisher } : {}),
            ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
          },
        ]
      : [];
  });
  const heightMillimeters = integerClaim(claims, "heightMillimeters", 2_600);
  const sourceProfiles = discoverPlayerSourceProfiles(
    input.displayName,
    evidence,
  );
  const now = options.now ?? new Date();
  return {
    id: crypto.randomUUID(),
    query,
    generatedAt: now.toISOString(),
    model,
    status: "review",
    ...(value("shortBio") ? { shortBio: value("shortBio") } : {}),
    ...(value("biography") ? { biography: value("biography") } : {}),
    ...(value("countryCode")
      ? { countryCode: value("countryCode")?.toUpperCase() }
      : {}),
    ...(value("hometown") ? { hometown: value("hometown") } : {}),
    ...(value("collegeName") ? { collegeName: value("collegeName") } : {}),
    ...(value("playingRole") ? { playingRole: value("playingRole") } : {}),
    ...(heightMillimeters ? { heightMillimeters } : {}),
    careerStats: {
      ...(integerClaim(claims, "events") !== undefined
        ? { events: integerClaim(claims, "events") }
        : {}),
      ...(integerClaim(claims, "wins") !== undefined
        ? { wins: integerClaim(claims, "wins") }
        : {}),
      ...(integerClaim(claims, "podiums") !== undefined
        ? { podiums: integerClaim(claims, "podiums") }
        : {}),
      ...(integerClaim(claims, "gold") !== undefined
        ? { gold: integerClaim(claims, "gold") }
        : {}),
      ...(integerClaim(claims, "silver") !== undefined
        ? { silver: integerClaim(claims, "silver") }
        : {}),
      ...(integerClaim(claims, "bronze") !== undefined
        ? { bronze: integerClaim(claims, "bronze") }
        : {}),
      ...(integerClaim(claims, "earningsMinor") !== undefined
        ? { earningsMinor: integerClaim(claims, "earningsMinor") }
        : {}),
      ...(value("earningsCurrency")
        ? { earningsCurrency: value("earningsCurrency")?.toUpperCase() }
        : {}),
    },
    links: [
      ...validLink("website", "Official website"),
      ...validLink("instagram", "Instagram"),
      ...validLink("youtube", "YouTube"),
    ],
    news,
    claims,
    sourceProfiles,
    evidence: evidence.map((item) => ({
      title: item.title,
      url: item.url,
      ...(item.description ? { description: item.description } : {}),
    })),
  };
}

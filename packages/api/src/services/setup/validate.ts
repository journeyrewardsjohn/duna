/**
 * Code validates everything the model returns (B1: "the model proposes,
 * code validates"). A fact survives only when its quote is on the page and
 * its key value is inside that quote; then each value is checked and
 * normalised by type. What cannot be verified is flagged (`checks`), never
 * silently accepted; what is not on the page is dropped, never invented.
 */
import { foregroundFor, parseHexColor } from "@duna/tideline-core/club-mark";
import type { setupProposalCategories } from "@duna/db/schema";
import type {
  SetupRawExtraction,
  setupOfferingKinds,
} from "./extraction-schema";
import { setupLimits } from "./limits";
import { isInstructionLike } from "./sanitize";
import { normaliseSetupUrl } from "./url-safety";
import type { SetupReaderBranding } from "./reader";

export type SetupCategory = (typeof setupProposalCategories)[number];
export type SetupConfidence = "stated" | "inferred";

export interface SetupQuote {
  readonly page: string;
  readonly text: string;
}

/** One validated fact from one page, before merging across pages. */
export interface SetupFact {
  readonly category: SetupCategory;
  readonly fieldKey: string;
  /** Facts with the same merge key are the same fact seen on several pages. */
  readonly mergeKey: string;
  readonly label: string;
  /** The value in the shape of its target. */
  readonly value: Readonly<Record<string, unknown>>;
  readonly quote: SetupQuote;
  readonly confidence: SetupConfidence;
  /** Plain notes for anything a person must confirm. */
  readonly checks: readonly string[];
}

export interface SetupValidationContext {
  /** Site-relative path ("/contact") or "description". */
  readonly page: string;
  /** The sanitised text the model saw. */
  readonly text: string;
  /** The club's currency, used only when the page shows a bare "$". */
  readonly currency: string;
  /** Calling code for numbers written without one (NANP clubs: "1"). */
  readonly callingCode: string;
}

export interface SetupValidationResult {
  readonly facts: SetupFact[];
  /** Facts refused (not on the page, malformed, or instruction-like). */
  readonly dropped: number;
}

export function normaliseForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\]\(/g, " ")
    .replace(/[*_`#>|\\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseKey(value: string): string {
  return normaliseForMatch(value)
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortQuote(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > setupLimits.maxQuoteChars
    ? `${flat.slice(0, setupLimits.maxQuoteChars - 1)}…`
    : flat;
}

/** E.164 from a written number, or undefined when it cannot be certain. */
export function toE164(raw: string, callingCode: string): string | undefined {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  let e164: string | undefined;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (callingCode === "1" && digits.length === 10) e164 = `+1${digits}`;
  else if (
    callingCode === "1" &&
    digits.length === 11 &&
    digits.startsWith("1")
  )
    e164 = `+${digits}`;
  return e164 && /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : undefined;
}

export const emailPattern =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

export const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const socialHosts: Readonly<Record<string, readonly string[]>> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
};

const zeroDecimalCurrencies = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

const currencySymbols: readonly (readonly [RegExp, string])[] = [
  [/€/, "EUR"],
  [/£/, "GBP"],
  [/¥/, "JPY"],
  [/\bA\$|AU\$/, "AUD"],
  [/\bC\$|CA\$/, "CAD"],
  [/\bNZ\$/, "NZD"],
];

const isoCurrency =
  /\b(USD|EUR|GBP|CAD|AUD|NZD|CHF|MXN|BRL|JPY|SEK|NOK|DKK)\b/i;

export interface SetupPrice {
  readonly amountMinor: number;
  readonly currency: string;
  /** The price exactly as the page wrote it. */
  readonly wording: string;
  readonly per: string;
}

/** Integer minor units from a written price; checks the number against the wording. */
export function parseWrittenPrice(input: {
  readonly priceText: string;
  readonly amount: number | null;
  readonly currencyHint: string | null;
  readonly clubCurrency: string;
  readonly per: string;
}): { price?: SetupPrice; checks: string[] } {
  const checks: string[] = [];
  const match = /\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?/.exec(
    input.priceText,
  );
  if (!match) return { checks: ["No price on the site"] };
  const written = Number(
    match[0].replace(/[\s,](?=\d{3}\b)/g, "").replace(",", "."),
  );
  if (!Number.isFinite(written)) return { checks: ["No price on the site"] };
  if (input.amount !== null && Math.abs(input.amount - written) > 0.001) {
    return { checks: ["The price could not be read for certain"] };
  }
  let currency: string | undefined;
  const iso = isoCurrency.exec(input.priceText)?.[1]?.toUpperCase();
  if (iso) currency = iso;
  for (const [pattern, code] of currencySymbols) {
    if (!currency && pattern.test(input.priceText)) currency = code;
  }
  if (!currency && /\$/.test(input.priceText)) {
    const hint = input.currencyHint?.toUpperCase();
    currency =
      hint && /^(USD|CAD|AUD|NZD|MXN)$/.test(hint)
        ? hint
        : input.clubCurrency.toUpperCase();
  }
  if (!currency) {
    currency = input.clubCurrency.toUpperCase();
    checks.push("The currency is not shown on the site");
  }
  const amountMinor = zeroDecimalCurrencies.has(currency)
    ? Math.round(written)
    : Math.round(written * 100);
  return {
    price: {
      amountMinor,
      currency,
      wording: input.priceText.trim(),
      per: input.per,
    },
    checks,
  };
}

export const offeringCatalogKind: Readonly<
  Record<(typeof setupOfferingKinds)[number], { type: string; subtype: string }>
> = {
  "private-lesson": { type: "service", subtype: "private-lesson" },
  "group-lesson": { type: "service", subtype: "group-lesson" },
  program: { type: "service", subtype: "program" },
  clinic: { type: "event", subtype: "clinic" },
  camp: { type: "service", subtype: "program" },
  league: { type: "event", subtype: "league" },
  "open-play": { type: "event", subtype: "open-play" },
  "court-rental": { type: "service", subtype: "court-rental" },
  membership: { type: "plan", subtype: "membership" },
  tournament: { type: "event", subtype: "tournament" },
  other: { type: "service", subtype: "other" },
};

const staffRoleMap: Readonly<Record<string, string>> = {
  coach: "coach",
  director: "director",
  manager: "manager",
  "front-desk": "front-desk",
  other: "coach",
};

const numberWords = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

function quoteStatesNumber(quote: string, value: number): boolean {
  const flat = normaliseForMatch(quote);
  if (new RegExp(`(?:^|\\D)${value}(?:\\D|$)`).test(flat)) return true;
  const word = numberWords[value];
  return Boolean(word && new RegExp(`\\b${word}\\b`).test(flat));
}

/**
 * Validates one page's raw extraction. Order of checks per fact:
 * instruction-like text → drop; quote not on the page → drop; key value not
 * in the quote → drop; malformed value → drop or flag.
 */
export function validatePageExtraction(
  raw: SetupRawExtraction,
  context: SetupValidationContext,
): SetupValidationResult {
  const pageText = normaliseForMatch(context.text);
  const facts: SetupFact[] = [];
  let dropped = 0;

  const onPage = (quote: string) => {
    const q = normaliseForMatch(quote);
    return q.length >= 3 && pageText.includes(q);
  };
  const inQuote = (quote: string, value: string) => {
    const v = normaliseForMatch(value);
    return v.length > 0 && normaliseForMatch(quote).includes(v);
  };
  const add = (
    fact: Omit<SetupFact, "quote" | "checks" | "confidence"> & {
      quote: string;
      confidence?: SetupConfidence;
      checks?: string[];
    },
    strings: readonly (string | null | undefined)[],
  ) => {
    if ([fact.quote, ...strings].some((s) => s && isInstructionLike(s))) {
      dropped += 1;
      return;
    }
    if (!onPage(fact.quote)) {
      dropped += 1;
      return;
    }
    const confidence = fact.confidence ?? "stated";
    const checks = [...(fact.checks ?? [])];
    if (confidence === "inferred") {
      checks.unshift("Inferred, not stated word for word on the page");
    }
    facts.push({
      ...fact,
      quote: { page: context.page, text: shortQuote(fact.quote) },
      confidence,
      checks,
    });
  };
  const reject = () => {
    dropped += 1;
  };

  if (raw.clubName) {
    const value = raw.clubName.value.trim();
    if (value && inQuote(raw.clubName.quote, value)) {
      add(
        {
          category: "identity",
          fieldKey: "identity.name",
          mergeKey: "identity.name",
          label: "Club name",
          value: { value },
          quote: raw.clubName.quote,
        },
        [value],
      );
    } else reject();
  }
  if (raw.tagline) {
    const value = raw.tagline.value.trim().slice(0, 160);
    if (value && inQuote(raw.tagline.quote, value)) {
      add(
        {
          category: "identity",
          fieldKey: "identity.tagline",
          mergeKey: "identity.tagline",
          label: "Tagline",
          value: { value },
          quote: raw.tagline.quote,
        },
        [value],
      );
    } else reject();
  }
  if (raw.about) {
    const value = raw.about.value.trim().slice(0, 4_000);
    if (value) {
      add(
        {
          category: "identity",
          fieldKey: "identity.about",
          mergeKey: "identity.about",
          label: "About the club",
          value: { value },
          quote: raw.about.quote,
          confidence: pageText.includes(normaliseForMatch(value))
            ? "stated"
            : "inferred",
        },
        [value],
      );
    } else reject();
  }
  const sports = new Set<string>();
  let sportsQuote: string | undefined;
  for (const sport of raw.sports) {
    const word =
      sport.value === "beach"
        ? "beach"
        : sport.value === "indoor"
          ? "indoor"
          : undefined;
    if (!word) continue;
    if (!inQuote(sport.quote, word) || !onPage(sport.quote)) {
      reject();
      continue;
    }
    sports.add(word);
    sportsQuote ??= sport.quote;
  }
  if (sports.size && sportsQuote) {
    add(
      {
        category: "identity",
        fieldKey: "identity.sports",
        mergeKey: "identity.sports",
        label: "Sports",
        value: { values: [...sports].sort() },
        quote: sportsQuote,
      },
      [],
    );
  }

  for (const phone of raw.phones) {
    const digits = phone.value.replace(/\D/g, "");
    const quoteDigits = phone.quote.replace(/\D/g, "");
    const national = digits.length > 10 ? digits.slice(-10) : digits;
    if (digits.length < 7 || !quoteDigits.includes(national)) {
      reject();
      continue;
    }
    const e164 = toE164(phone.value, context.callingCode);
    add(
      {
        category: "contact",
        fieldKey: "contact.phone",
        mergeKey: "contact.phone",
        label: "Phone",
        value: {
          value: e164 ?? phone.value.trim(),
          written: phone.value.trim(),
        },
        quote: phone.quote,
        checks: e164 ? [] : ["Could not read this as a full phone number"],
      },
      [phone.value],
    );
  }
  for (const email of raw.emails) {
    const value = email.value
      .trim()
      .toLowerCase()
      .replace(/^mailto:/, "");
    if (!emailPattern.test(value) || !inQuote(email.quote, value)) {
      reject();
      continue;
    }
    add(
      {
        category: "contact",
        fieldKey: "contact.email",
        mergeKey: "contact.email",
        label: "Email",
        value: { value },
        quote: email.quote,
      },
      [value],
    );
  }
  for (const social of raw.socials) {
    const checked = normaliseSetupUrl(social.url);
    if (!checked.ok) {
      reject();
      continue;
    }
    const url = new URL(checked.url);
    url.protocol = "https:";
    const host = url.hostname.replace(/^www\./, "");
    const hosts = socialHosts[social.network];
    if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      reject();
      continue;
    }
    const bare = `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    const bareNoWww = bare.replace(/^www\./, "");
    if (
      !pageText.includes(normaliseForMatch(bareNoWww)) &&
      !inQuote(social.quote, bareNoWww)
    ) {
      reject();
      continue;
    }
    add(
      {
        category: "contact",
        fieldKey: "contact.social",
        mergeKey: `contact.social:${social.network}`,
        label:
          social.network === "x"
            ? "X"
            : social.network[0]!.toUpperCase() + social.network.slice(1),
        value: { network: social.network, url: url.toString() },
        quote: social.quote,
      },
      [social.url],
    );
  }

  for (const location of raw.locations) {
    const name = (
      location.name ??
      location.street ??
      location.locality
    )?.trim();
    if (!name || !inQuote(location.quote, name)) {
      reject();
      continue;
    }
    const checks: string[] = [];
    const address = {
      line1: location.street?.trim() || undefined,
      locality: location.locality?.trim() || undefined,
      administrativeArea: location.region?.trim() || undefined,
      postalCode: location.postalCode?.trim() || undefined,
      countryCode:
        location.country && /^[A-Za-z]{2}$/.test(location.country)
          ? location.country.toUpperCase()
          : undefined,
    };
    // Every address part must be on the page; parts that are not are left out.
    for (const key of [
      "line1",
      "locality",
      "administrativeArea",
      "postalCode",
    ] as const) {
      const part = address[key];
      if (part && !pageText.includes(normaliseForMatch(part))) {
        address[key] = undefined;
        checks.push("Part of the address was not on the page");
      }
    }
    const hasAddress = Boolean(address.line1 || address.postalCode);
    if (hasAddress) checks.push("Address not confirmed on a map yet");
    let courtCount = location.courtCount;
    if (courtCount !== null && !quoteStatesNumber(location.quote, courtCount)) {
      courtCount = null;
      checks.push("The number of courts was not stated");
    }
    const addressText = [
      address.line1,
      address.locality,
      address.administrativeArea,
      address.postalCode,
    ]
      .filter(Boolean)
      .join(", ");
    add(
      {
        category: "places",
        fieldKey: "places.venue",
        mergeKey: `places.venue:${normaliseKey(name)}`,
        label: name,
        value: {
          name,
          address: Object.fromEntries(
            Object.entries(address).filter(([, v]) => v !== undefined),
          ),
          ...(addressText ? { addressText } : {}),
          courtCount,
          surface: location.surface === "unknown" ? null : location.surface,
          environment:
            location.environment === "unknown" ? null : location.environment,
          geocoded: false,
        },
        quote: location.quote,
        checks,
      },
      [name, location.street, location.locality],
    );
  }

  const weekly = new Map<number, { opens: string; closes: string }>();
  let hoursQuote: string | undefined;
  for (const window of raw.hours) {
    if (
      !timePattern.test(window.opens) ||
      !timePattern.test(window.closes) ||
      window.opens >= window.closes ||
      !/\d/.test(window.quote) ||
      !onPage(window.quote) ||
      isInstructionLike(window.quote)
    ) {
      reject();
      continue;
    }
    const existing = weekly.get(window.weekday);
    if (
      existing &&
      (existing.opens !== window.opens || existing.closes !== window.closes)
    ) {
      reject();
      continue;
    }
    weekly.set(window.weekday, { opens: window.opens, closes: window.closes });
    hoursQuote ??= window.quote;
  }
  if (weekly.size && hoursQuote) {
    add(
      {
        category: "places",
        fieldKey: "places.hours",
        mergeKey: "places.hours",
        label: "Hours",
        value: {
          weekly: [...weekly.entries()]
            .sort(([a], [b]) => a - b)
            .map(([weekday, w]) => ({ weekday, ...w })),
        },
        quote: hoursQuote,
      },
      [],
    );
  }

  for (const person of raw.staff) {
    const name = person.name.trim();
    if (name.split(/\s+/).length > 6 || !inQuote(person.quote, name)) {
      reject();
      continue;
    }
    add(
      {
        category: "team",
        fieldKey: "team.member",
        mergeKey: `team.member:${normaliseKey(name)}`,
        label: name,
        value: {
          displayName: name,
          role: staffRoleMap[person.role] ?? "coach",
          ...(person.title ? { title: person.title.trim() } : {}),
        },
        quote: person.quote,
      },
      [name, person.title],
    );
  }

  for (const offering of raw.offerings) {
    const title = offering.title.trim();
    if (!title || !inQuote(offering.quote, title)) {
      reject();
      continue;
    }
    const checks: string[] = [];
    let price: SetupPrice | undefined;
    if (offering.priceText) {
      if (!pageText.includes(normaliseForMatch(offering.priceText))) {
        checks.push("The price could not be read for certain");
      } else {
        const parsed = parseWrittenPrice({
          priceText: offering.priceText,
          amount: offering.amount,
          currencyHint: offering.currency,
          clubCurrency: context.currency,
          per: offering.per,
        });
        price = parsed.price;
        checks.push(...parsed.checks);
      }
    } else {
      checks.push("No price on the site");
    }
    const kind = offeringCatalogKind[offering.kind];
    add(
      {
        category: "offerings",
        fieldKey: "offerings.item",
        mergeKey: `offerings.item:${normaliseKey(title)}`,
        label: title,
        value: {
          title,
          kind: `${kind.type}/${kind.subtype}`,
          ...(offering.description
            ? { description: offering.description.trim() }
            : {}),
          ...(offering.durationMinutes
            ? { durationMinutes: offering.durationMinutes }
            : {}),
          price: price ?? null,
          status: "draft",
        },
        quote: offering.quote,
        checks,
      },
      [title, offering.description, offering.priceText],
    );
  }

  for (const policy of raw.policies) {
    const title = policy.title.trim() || policy.kind;
    const summary = policy.summary.trim();
    if (!summary) {
      reject();
      continue;
    }
    let refundBeforeMinutes: number | null = null;
    const checks = ["Summarised from your site: check the wording"];
    if (policy.noticeHours !== null) {
      if (quoteStatesNumber(policy.quote, policy.noticeHours)) {
        refundBeforeMinutes = Math.round(policy.noticeHours * 60);
      } else {
        checks.push("The notice period was not stated");
      }
    }
    add(
      {
        category: "policies",
        fieldKey: `policies.${policy.kind}`,
        mergeKey: `policies.${policy.kind}`,
        label: title,
        value: {
          kind: policy.kind,
          title,
          summary,
          refundBeforeMinutes,
          status: "draft",
        },
        quote: policy.quote,
        confidence: "inferred",
        checks,
      },
      [title, summary],
    );
  }

  return { facts, dropped };
}

/** Logo and colours come from the site's own styles (the reader's branding), not the model. */
export function brandingFacts(
  branding: SetupReaderBranding | undefined,
  page: string,
): SetupFact[] {
  if (!branding) return [];
  const facts: SetupFact[] = [];
  if (branding.logo) {
    const checked = normaliseSetupUrl(branding.logo);
    if (checked.ok && checked.url.startsWith("https://")) {
      facts.push({
        category: "identity",
        fieldKey: "identity.logo",
        mergeKey: "identity.logo",
        label: "Logo",
        value: { url: checked.url },
        quote: { page, text: "Logo on your home page" },
        confidence: "stated",
        checks: [],
      });
    }
  }
  const hex = (value: string | undefined) => {
    const rgb = value ? parseHexColor(value) : null;
    if (!rgb) return undefined;
    return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  };
  const primary = hex(branding.colors?.primary);
  const accent = hex(branding.colors?.accent ?? branding.colors?.secondary);
  if (primary) {
    const contrast = foregroundFor(primary);
    facts.push({
      category: "identity",
      fieldKey: "identity.colors",
      mergeKey: "identity.colors",
      label: "Brand colours",
      value: {
        primary,
        ...(accent ? { accent } : {}),
        contrast: {
          foreground: contrast.foreground,
          ratio: contrast.ratio,
          passesText: contrast.passesText,
          passesGraphics: contrast.passesGraphics,
        },
      },
      quote: { page, text: "Colours used on your home page" },
      confidence: "stated",
      checks: contrast.passesText
        ? []
        : [
            "This colour is hard to read text on: Duna will adjust it for buttons",
          ],
    });
  }
  return facts;
}
